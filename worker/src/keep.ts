// 우리 장부 자동 보관 서버 (SPEC-006, ADR 005)
// 폰에서 암호화한 보관본을 이름(복구 코드에서 만든 SHA-256 해시)별로 KV 에 덮어쓴다.
// 서버는 내용도 복구 코드도 모른다: 받은 JSON 을 형식만 보고 그대로 저장·전달한다.

export const MAX_BODY_BYTES = 1_048_576
export const ALLOWED_ORIGIN = 'https://crowwan.github.io'

// KV 에서 쓰는 동작만 (Cloudflare KVNamespace 가 이 모양을 만족한다, 테스트는 가짜)
export interface KeepStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface Env {
  KEEP: KeepStore
}

const KEEP_PATH = /^\/v1\/keep\/([^/]+)$/
const KEEP_ID = /^[0-9a-f]{64}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
} as const

function respond(status: number, body: string | null = null, contentType?: string): Response {
  const headers = new Headers(CORS_HEADERS)
  if (contentType) headers.set('Content-Type', contentType)
  return new Response(body, { status, headers })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBase64(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && BASE64.test(value)
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
  return (
    v === 1 &&
    typeof savedAt === 'string' &&
    ISO_DATE.test(savedAt) &&
    !Number.isNaN(Date.parse(savedAt)) &&
    isBase64(iv) &&
    isBase64(data)
  )
}

async function putKeep(request: Request, env: Env, key: string): Promise<Response> {
  // 크기는 먼저 Content-Length 로 거르고, 실제 받은 바이트로 한 번 더 본다
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0')
  if (declaredLength > MAX_BODY_BYTES) return respond(413)

  const contentType = request.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) return respond(400)

  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > MAX_BODY_BYTES) return respond(413)

  const text = new TextDecoder().decode(bytes)
  if (!isKeepBody(text)) return respond(400)

  await env.KEEP.put(key, text)
  return respond(204)
}

export async function handleKeepRequest(request: Request, env: Env): Promise<Response> {
  const match = KEEP_PATH.exec(new URL(request.url).pathname)
  // 그 밖의 경로는 출처와 상관없이 404 (주소 확인용으로도 쓴다)
  if (!match) return new Response(null, { status: 404 })

  // 허용한 출처(앱 주소)에서 온 요청만 받는다. 출처가 없는 요청도 거부
  if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return new Response(null, { status: 403 })

  if (request.method === 'OPTIONS') return respond(204)

  const id = match[1]
  if (!KEEP_ID.test(id)) return respond(400)
  const key = `keep:${id}`

  switch (request.method) {
    case 'PUT':
      return putKeep(request, env, key)
    case 'GET': {
      const stored = await env.KEEP.get(key)
      return stored === null ? respond(404) : respond(200, stored, 'application/json')
    }
    case 'DELETE':
      await env.KEEP.delete(key)
      return respond(204)
    default:
      return respond(405)
  }
}
