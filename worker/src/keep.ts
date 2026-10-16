// 우리 장부 자동 보관 서버 (SPEC-006, ADR 005)
// 폰에서 암호화한 보관본을 이름(복구 코드에서 만든 SHA-256 해시)별로 KV 에 덮어쓴다.
// 서버는 내용도 복구 코드도 모른다: 받은 JSON 을 형식만 보고 그대로 저장·전달한다.
// SPEC-007(ADR 006): 같은 이름으로 폰의 보관 상태 신호를 받아 두고, 토큰을 가진 쪽(GitHub Actions)에 요약을 준다.
// #128(ADR 008): 본 주소와 미리보기 주소를 받고, 미리보기 요청은 KV 의 다른 자리(preview:)에 둔다.

export const MAX_BODY_BYTES = 1_048_576
export const MAX_STATUS_BYTES = 4096

// 받는 출처(앱 주소)와 그 출처의 KV 저장 자리 (#128)
// 미리보기(Cloudflare Pages)는 키 앞에 preview: 를 붙여, 같은 복구 코드로 불러오거나 보관해도 본 사본에 닿지 않게 한다.
// 미리보기의 배포별 주소(<hash>.uri-jangbu-preview.pages.dev)는 받지 않는다: 미리보기 QA 는 고정 주소 하나로 한다
const ORIGIN_KEY_PREFIXES: ReadonlyMap<string, string> = new Map([
  ['https://crowwan.github.io', ''],
  ['https://uri-jangbu-preview.pages.dev', 'preview:'],
])

// KV 에서 쓰는 동작만 (Cloudflare KVNamespace 가 이 모양을 만족한다, 테스트는 가짜)
export interface KeepStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  // 기기는 가족 몇 대라 한 번(최대 1,000개)으로 충분하다. 다음 장(cursor)은 읽지 않는다
  list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>
}

export interface Env {
  KEEP: KeepStore
  // 요약 토큰 (Worker 비밀값). 넣지 않았으면 비어 있고, 그때 요약은 늘 401
  REPORT_TOKEN?: string
}

const ID_PATH = /^\/v1\/(keep|status)\/([^/]+)$/
const REPORT_PATH = '/v1/report'
const STATUS_PREFIX = 'status:'
const MAX_APP_VERSION_LENGTH = 32
const KEEP_ID = /^[0-9a-f]{64}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
} as const

// 출처 검사를 통과한 요청: 응답 CORS 에 돌려줄 출처와 KV 키 앞에 붙일 자리
interface AppRequest {
  origin: string
  keyPrefix: string
}

function respond(app: AppRequest, status: number, body: string | null = null, contentType?: string): Response {
  const headers = new Headers(CORS_HEADERS)
  headers.set('Access-Control-Allow-Origin', app.origin)
  if (contentType) headers.set('Content-Type', contentType)
  return new Response(body, { status, headers })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBase64(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && BASE64.test(value)
}

function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
}

// 보관본 형식: { v: 1, savedAt: ISO 시각, iv: base64, data: base64 }
function isKeepBody(text: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return false
  }
  if (!isRecord(parsed)) return false
  const { v, savedAt, iv, data } = parsed
  return v === 1 && typeof savedAt === 'string' && isIsoDate(savedAt) && isBase64(iv) && isBase64(data)
}

// 상태 신호 (SPEC-007): 장부 내용·복구 코드는 없고 보관 상태만
interface StatusSignal {
  v: 1
  enabled: boolean
  pendingSince?: string
  lastKeptAt?: string
  tooLarge: boolean
  appVersion: string
}

const STATUS_KEYS = new Set(['v', 'enabled', 'pendingSince', 'lastKeptAt', 'tooLarge', 'appVersion'])

function toStatusSignal(record: Record<string, unknown>): StatusSignal | null {
  const { v, enabled, pendingSince, lastKeptAt, tooLarge, appVersion } = record
  if (v !== 1 || typeof enabled !== 'boolean' || typeof tooLarge !== 'boolean') return null
  if (pendingSince !== undefined && (typeof pendingSince !== 'string' || !isIsoDate(pendingSince))) return null
  if (lastKeptAt !== undefined && (typeof lastKeptAt !== 'string' || !isIsoDate(lastKeptAt))) return null
  if (typeof appVersion !== 'string' || appVersion.length === 0) return null
  if (appVersion.length > MAX_APP_VERSION_LENGTH) return null
  return { v, enabled, pendingSince, lastKeptAt, tooLarge, appVersion }
}

// 정한 칸 말고 다른 것이 섞여 있으면 받지 않는다 (서버에 평문으로 남는 것을 정한 만큼으로)
function parseStatusBody(text: string): StatusSignal | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (Object.keys(parsed).some((key) => !STATUS_KEYS.has(key))) return null
  return toStatusSignal(parsed)
}

// JSON 본문을 크기 상한 안에서 읽는다. 못 받을 본문이면 돌려줄 응답을 준다
async function readJsonBody(request: Request, app: AppRequest, maxBytes: number): Promise<string | Response> {
  // 크기는 먼저 Content-Length 로 거르고, 실제 받은 바이트로 한 번 더 본다
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0')
  if (declaredLength > maxBytes) return respond(app, 413)

  const contentType = request.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) return respond(app, 400)

  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > maxBytes) return respond(app, 413)

  return new TextDecoder().decode(bytes)
}

async function putKeep(request: Request, env: Env, app: AppRequest, key: string): Promise<Response> {
  const text = await readJsonBody(request, app, MAX_BODY_BYTES)
  if (text instanceof Response) return text
  if (!isKeepBody(text)) return respond(app, 400)

  await env.KEEP.put(key, text)
  return respond(app, 204)
}

async function putStatus(request: Request, env: Env, app: AppRequest, id: string): Promise<Response> {
  const text = await readJsonBody(request, app, MAX_STATUS_BYTES)
  if (text instanceof Response) return text
  const signal = parseStatusBody(text)
  if (!signal) return respond(app, 400)

  // 받은 때는 폰 시계가 아니라 서버 시각
  const key = `${app.keyPrefix}${STATUS_PREFIX}${id}`
  await env.KEEP.put(key, JSON.stringify({ ...signal, seenAt: new Date().toISOString() }))
  return respond(app, 204)
}

async function handleKeep(request: Request, env: Env, app: AppRequest, id: string): Promise<Response> {
  const key = `${app.keyPrefix}keep:${id}`
  switch (request.method) {
    case 'PUT':
      return putKeep(request, env, app, key)
    case 'GET': {
      const stored = await env.KEEP.get(key)
      return stored === null ? respond(app, 404) : respond(app, 200, stored, 'application/json')
    }
    case 'DELETE':
      // 보관본을 지우면 그 기기의 상태 신호도 지운다 (SPEC-007). 같은 자리(본/미리보기) 안에서만
      await Promise.all([env.KEEP.delete(key), env.KEEP.delete(`${app.keyPrefix}${STATUS_PREFIX}${id}`)])
      return respond(app, 204)
    default:
      return respond(app, 405)
  }
}

// 길이가 같으면 끝까지 비교한다 (맞는 글자 수로 걸리는 시간이 달라지지 않게)
function sameToken(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  if (a.byteLength !== b.byteLength) return false
  let diff = 0
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function isAuthorized(request: Request, token: string | undefined): boolean {
  if (!token) return false
  const authorization = request.headers.get('Authorization') ?? ''
  const prefix = 'Bearer '
  return authorization.startsWith(prefix) && sameToken(authorization.slice(prefix.length), token)
}

interface DeviceSummary extends Omit<StatusSignal, 'v'> {
  id: string
  seenAt: string
}

// 저장한 신호를 요약 한 줄로. 서버가 쓴 값이라 형식이 틀릴 일은 없지만, 틀리면 빼고 준다
function toDeviceSummary(key: string, stored: string | null): DeviceSummary | null {
  if (stored === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return null
  }
  if (!isRecord(parsed) || typeof parsed.seenAt !== 'string') return null
  const signal = toStatusSignal(parsed)
  if (!signal) return null
  const { enabled, pendingSince, lastKeptAt, tooLarge, appVersion } = signal
  return {
    // 기기는 이름(64자 해시)의 앞 8자로만 보여 준다
    id: key.slice(STATUS_PREFIX.length, STATUS_PREFIX.length + 8),
    seenAt: parsed.seenAt,
    enabled,
    pendingSince,
    lastKeptAt,
    tooLarge,
    appVersion,
  }
}

// GitHub Actions 가 부르는 요약: 출처 검사·CORS 헤더 없이 토큰으로만 연다
async function handleReport(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405 })
  if (!isAuthorized(request, env.REPORT_TOKEN)) return new Response(null, { status: 401 })

  // 본 자리만 본다: KV list 는 앞부분 일치라 미리보기 신호(preview:status:…)는 잡히지 않는다 (#128)
  const { keys } = await env.KEEP.list({ prefix: STATUS_PREFIX })
  const summaries = await Promise.all(
    keys.map(async ({ name }) => toDeviceSummary(name, await env.KEEP.get(name))),
  )
  const devices = summaries.filter((summary) => summary !== null)
  const body = JSON.stringify({ now: new Date().toISOString(), devices })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export async function handleKeepRequest(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url)
  // 요약은 출처 검사보다 먼저 (앱이 아니라 GitHub Actions 에서 부른다)
  if (pathname === REPORT_PATH) return handleReport(request, env)

  const match = ID_PATH.exec(pathname)
  // 그 밖의 경로는 출처와 상관없이 404 (주소 확인용으로도 쓴다)
  if (!match) return new Response(null, { status: 404 })

  // 허용한 출처(앱 주소)에서 온 요청만 받는다. 출처가 없는 요청도 거부
  const origin = request.headers.get('Origin')
  const keyPrefix = origin === null ? undefined : ORIGIN_KEY_PREFIXES.get(origin)
  if (origin === null || keyPrefix === undefined) return new Response(null, { status: 403 })
  const app: AppRequest = { origin, keyPrefix }

  if (request.method === 'OPTIONS') return respond(app, 204)

  const [, kind, id] = match
  if (!KEEP_ID.test(id)) return respond(app, 400)

  if (kind === 'keep') return handleKeep(request, env, app, id)
  return request.method === 'PUT' ? putStatus(request, env, app, id) : respond(app, 405)
}
