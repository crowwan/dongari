// 자동 보관 서버와 주고받기 (SPEC-006, Worker API v1: worker/).
// 실패는 예외 대신 결과로 돌려준다. fetch 는 테스트에서 가짜 서버로 바꿔 넣는다.
// 상태 신호(SPEC-007)는 개발자가 보관이 밀린 것을 알게 보내는 것 — 장부 내용·복구 코드는 넣지 않는다
import { isRecord } from '../../storage/schema'
import type { KeepEnvelope } from './keepCrypto'

// 보관본 크기 상한 1MB (서버도 넘으면 413). 지금 데이터는 수십 KB
export const KEEP_SIZE_LIMIT = 1024 * 1024

export type KeepPutResult = 'ok' | 'too-large' | 'failed'

// offline: 서버에 닿지 못했다 (인터넷 없음 등) / failed: 서버가 답했지만 쓸 수 없다
export type KeepGetResult =
  | { status: 'found'; envelope: KeepEnvelope }
  | { status: 'not-found' }
  | { status: 'offline' }
  | { status: 'failed' }

// 상태 신호 본문 (SPEC-007, PUT /v1/status/:id). 서버가 받은 때(seenAt)를 붙인다
export interface KeepStatus {
  v: 1
  enabled: boolean
  pendingSince?: string
  lastKeptAt?: string
  tooLarge: boolean
  appVersion: string
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
      await request(`/v1/status/${id}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(status) })
    },
  }
}
