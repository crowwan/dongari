// 자동 보관 서버와 주고받기 (SPEC-006, Worker API v1: worker/).
// 실패는 예외 대신 결과로 돌려준다. fetch 는 테스트에서 가짜 서버로 바꿔 넣는다.
// 상태 신호(SPEC-007)는 개발자가 보관이 밀린 것을 알게 보내는 것 — 장부 내용·복구 코드는 넣지 않는다.
// v2(SPEC-012 2절)는 정리한 앱 오류 목록을 함께 싣는다
import { isRecord } from '../../storage/schema'
import type { AppError } from '../errors/appErrors'
import type { KeepEnvelope } from './keepCrypto'

// 보관본 크기 상한 1MB (서버도 넘으면 413). 지금 데이터는 수십 KB
export const KEEP_SIZE_LIMIT = 1024 * 1024
// 상태 신호 크기 상한 4KB (서버 MAX_STATUS_BYTES, worker/src/keep.ts). JSON 으로 바꾼 뒤의 UTF-8 바이트로 잰다.
// 넘으면 서버가 413 으로 보관 상태까지 통째로 버린다
export const STATUS_SIZE_LIMIT = 4096
// 상태 신호 하나를 기다리는 시간. 신호는 차례로 보내므로(AutoKeeper) 걸린 요청이 뒤 신호를 붙잡지 않게 끊는다.
// 보관본 올리기(최대 1MB)는 약한 망에서 이보다 오래 걸릴 수 있어 끊지 않는다 (상태 신호 차례와 따로 간다)
export const STATUS_TIMEOUT_MS = 10_000

export type KeepPutResult = 'ok' | 'too-large' | 'failed'

// offline: 서버에 닿지 못했다 (인터넷 없음 등) / failed: 서버가 답했지만 쓸 수 없다
export type KeepGetResult =
  | { status: 'found'; envelope: KeepEnvelope }
  | { status: 'not-found' }
  | { status: 'offline' }
  | { status: 'failed' }

// 상태 신호 본문 v2 (SPEC-007·SPEC-012, PUT /v1/status/:id). 서버가 받은 때(seenAt)를 붙인다.
// errors: 앱 오류 0~5줄 (없으면 칸째 뺀다)
export interface KeepStatus {
  v: 2
  enabled: boolean
  pendingSince?: string
  lastKeptAt?: string
  tooLarge: boolean
  appVersion: string
  errors?: readonly AppError[]
}

export interface KeepServer {
  put: (id: string, envelope: KeepEnvelope) => Promise<KeepPutResult>
  get: (id: string) => Promise<KeepGetResult>
  remove: (id: string) => Promise<boolean>
  // 실패는 삼킨다 (다시 시도하지 않고 다음 앱 열기 때 보낸다)
  sendStatus: (id: string, status: KeepStatus) => Promise<void>
}

function isKeepEnvelope(value: unknown): value is KeepEnvelope {
  return (
    isRecord(value) &&
    value.v === 1 &&
    typeof value.savedAt === 'string' &&
    typeof value.iv === 'string' &&
    typeof value.data === 'string'
  )
}

async function readEnvelope(response: Response): Promise<KeepGetResult> {
  try {
    const body: unknown = await response.json()
    return isKeepEnvelope(body) ? { status: 'found', envelope: body } : { status: 'failed' }
  } catch {
    return { status: 'failed' }
  }
}

const JSON_HEADERS = { 'content-type': 'application/json' }

const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength

// ms 뒤 끊는 신호. AbortSignal.timeout 이 없는 예전 브라우저(크롬 103·삼성 인터넷 20 전)는 끊지 않고 그대로 보낸다
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined
}

// 마지막 때가 가장 오래된 줄 하나를 뺀다 (나머지는 순서 그대로)
function withoutOldest(errors: readonly AppError[]): AppError[] {
  const oldest = errors.reduce((found, error) => (Date.parse(error.lastAt) < Date.parse(found.lastAt) ? error : found))
  return errors.filter((error) => error !== oldest)
}

// 보낼 상태 신호 본문 (SPEC-012): 오류가 없으면 errors 칸을 빼고, 4KB 를 넘으면 마지막 때가 오래된 오류 줄부터 뺀다.
// 다 빼도 넘으면 errors 없이 보낸다 — 보관 상태는 꼭 닿게
export function statusBody({ errors = [], ...status }: KeepStatus): string {
  let kept: readonly AppError[] = errors
  for (;;) {
    const body = JSON.stringify(kept.length > 0 ? { ...status, errors: kept } : status)
    if (kept.length === 0 || utf8Bytes(body) <= STATUS_SIZE_LIMIT) return body
    kept = withoutOldest(kept)
  }
}

// baseUrl: 빌드 환경변수 VITE_KEEP_URL (끝의 / 는 있어도 없어도 된다)
export function createKeepServer(baseUrl: string, fetchFn: typeof fetch = (...args) => fetch(...args)): KeepServer {
  const root = baseUrl.replace(/\/+$/, '')

  // 서버에 닿지 못하면 undefined
  async function request(path: string, init: RequestInit): Promise<Response | undefined> {
    try {
      return await fetchFn(`${root}${path}`, init)
    } catch {
      return undefined
    }
  }
  const keepPath = (id: string) => `/v1/keep/${id}`

  return {
    put: async (id, envelope) => {
      const body = JSON.stringify(envelope)
      if (new Blob([body]).size > KEEP_SIZE_LIMIT) return 'too-large'
      const response = await request(keepPath(id), { method: 'PUT', headers: JSON_HEADERS, body })
      if (response?.status === 413) return 'too-large'
      return response?.ok ? 'ok' : 'failed'
    },
    get: async (id) => {
      const response = await request(keepPath(id), { method: 'GET' })
      if (!response) return { status: 'offline' }
      if (response.status === 404) return { status: 'not-found' }
      if (!response.ok) return { status: 'failed' }
      return readEnvelope(response)
    },
    remove: async (id) => (await request(keepPath(id), { method: 'DELETE' }))?.ok ?? false,
    sendStatus: async (id, status) => {
      await request(`/v1/status/${id}`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: statusBody(status),
        signal: timeoutSignal(STATUS_TIMEOUT_MS),
      })
    },
  }
}
