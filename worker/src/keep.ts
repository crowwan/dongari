// 우리 장부 자동 보관 서버 (SPEC-006, ADR 005)
// 폰에서 암호화한 보관본을 이름(복구 코드에서 만든 SHA-256 해시)별로 KV 에 덮어쓴다.
// 서버는 내용도 복구 코드도 모른다: 받은 JSON 을 형식만 보고 그대로 저장·전달한다.
// SPEC-007(ADR 006): 같은 이름으로 폰의 보관 상태 신호를 받아 두고, 토큰을 가진 쪽(GitHub Actions)에 요약을 준다.
// #128(ADR 008): 본 주소와 미리보기 주소를 받고, 미리보기 요청은 KV 의 다른 자리(preview:)에 둔다.
// SPEC-011(ADR 010): 날(한국 시간)·달이 바뀐 뒤 첫 보관 때 있던 최신본을 날짜별·달별 사본으로 남기고, 개발자가 골라 받게 한다.

export const MAX_BODY_BYTES = 1_048_576
export const MAX_STATUS_BYTES = 4096

// 사본이 남는 기간 (KV 가 TTL 로 지운다, 정리 작업 없음)
export const DAY_COPY_TTL_SECONDS = 31 * 24 * 60 * 60 // 2,678,400
export const MONTH_COPY_TTL_SECONDS = 400 * 24 * 60 * 60 // 34,560,000

// 받는 출처(앱 주소)와 그 출처의 KV 저장 자리 (#128)
// 미리보기(Cloudflare Pages)는 키 앞에 preview: 를 붙여, 같은 복구 코드로 불러오거나 보관해도 본 사본에 닿지 않게 한다.
// 미리보기의 배포별 주소(<hash>.uri-jangbu-preview.pages.dev)는 받지 않는다: 미리보기 QA 는 고정 주소 하나로 한다
const ORIGIN_KEY_PREFIXES: ReadonlyMap<string, string> = new Map([
  ['https://crowwan.github.io', ''],
  ['https://uri-jangbu-preview.pages.dev', 'preview:'],
])

// KV put 옵션 중 쓰는 것 (Cloudflare KV 와 같은 이름): metadata 는 값과 함께 두는 작은 JSON, expirationTtl 은 초
export interface KeepPutOptions {
  metadata?: unknown
  expirationTtl?: number
}

// KV 에서 쓰는 동작만 (Cloudflare KVNamespace 가 이 모양을 만족한다, 테스트는 가짜)
export interface KeepStore {
  get(key: string): Promise<string | null>
  // metadata 는 쓸 때 준 그대로(없으면 null). 모양은 읽는 쪽이 검사한다
  getWithMetadata(key: string): Promise<{ value: string | null; metadata: unknown }>
  put(key: string, value: string, options?: KeepPutOptions): Promise<void>
  delete(key: string): Promise<void>
  // 기기는 가족 몇 대, 사본은 이름당 최대 31 + 13개라 한 번(최대 1,000개)으로 충분하다. 다음 장(cursor)은 읽지 않는다
  list(options: { prefix: string }): Promise<{ keys: { name: string; metadata?: unknown }[] }>
}

export interface Env {
  KEEP: KeepStore
  // 요약 토큰 (Worker 비밀값). 넣지 않았으면 비어 있고, 그때 요약은 늘 401
  REPORT_TOKEN?: string
}

// 서버 시각 (테스트는 정한 시각을 넣는다)
export type Clock = () => Date

const ID_PATH = /^\/v1\/(keep|status)\/([^/]+)$/
const HISTORY_PATH = /^\/v1\/keep\/([^/]+)\/history$/
const REPORT_PATH = '/v1/report'
const STATUS_PREFIX = 'status:'
const MAX_APP_VERSION_LENGTH = 32
const KEEP_ID = /^[0-9a-f]{64}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const DAY_STAMP = /^\d{4}-\d{2}-\d{2}$/
const MONTH_STAMP = /^\d{4}-\d{2}$/
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

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

// 한 이름(id)이 한 자리(본 / 미리보기 preview:)에서 쓰는 KV 키
// 최신본 keep:<id>, 상태 신호 status:<id>, 날짜별 사본 snap:<id>:<YYYY-MM-DD>, 달별 사본 month:<id>:<YYYY-MM>
interface KeepKeys {
  latest: string
  status: string
  dayPrefix: string
  monthPrefix: string
}

function keepKeysOf(app: AppRequest, id: string): KeepKeys {
  const place = app.keyPrefix
  return {
    latest: `${place}keep:${id}`,
    status: `${place}${STATUS_PREFIX}${id}`,
    dayPrefix: `${place}snap:${id}:`,
    monthPrefix: `${place}month:${id}:`,
  }
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

// 한국 시간의 날 YYYY-MM-DD (사본은 이 날·달로 나눈다)
function kstDay(iso: string): string {
  return new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString().slice(0, 10)
}

// 서버가 최신본·사본에 붙이는 metadata { savedAt } 의 보관 시각. 모양이 다르면 undefined
function savedAtOfMetadata(metadata: unknown): string | undefined {
  if (!isRecord(metadata)) return undefined
  const { savedAt } = metadata
  return typeof savedAt === 'string' && isIsoDate(savedAt) ? savedAt : undefined
}

function savedAtOfEnvelope(text: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) && typeof parsed.savedAt === 'string' && isIsoDate(parsed.savedAt) ? parsed.savedAt : undefined
  } catch {
    return undefined
  }
}

// 최신본의 보관 시각: metadata 의 서버 시각, 없으면(이 기능 전에 저장한 최신본) 보관본 겉봉투의 savedAt
function keptAtOf(value: string, metadata: unknown): string | undefined {
  return savedAtOfMetadata(metadata) ?? savedAtOfEnvelope(value)
}

// 새 값을 쓰기 전에: 지금 최신본의 보관일이 오늘이 아니면 그 날 사본으로, 보관 달이 이번 달이 아니면 달 사본으로도 복사한다.
// 그래서 사본은 "그날(그달) 마지막으로 보관된 모습"이다. 이미 있으면 덮어쓴다
async function copyBeforeOverwrite(store: KeepStore, keys: KeepKeys, today: string): Promise<void> {
  const { value, metadata } = await store.getWithMetadata(keys.latest)
  if (value === null) return
  // 받을 때 형식을 검사하므로 보관 시각이 없을 일은 없다. 없으면 이름을 정할 수 없어 복사하지 않는다
  const keptAt = keptAtOf(value, metadata)
  if (keptAt === undefined) return
  const keptDay = kstDay(keptAt)
  if (keptDay === today) return

  const copyMetadata = { savedAt: keptAt }
  const copies = [
    store.put(`${keys.dayPrefix}${keptDay}`, value, { metadata: copyMetadata, expirationTtl: DAY_COPY_TTL_SECONDS }),
  ]
  const keptMonth = keptDay.slice(0, 7)
  if (keptMonth !== today.slice(0, 7)) {
    copies.push(
      store.put(`${keys.monthPrefix}${keptMonth}`, value, { metadata: copyMetadata, expirationTtl: MONTH_COPY_TTL_SECONDS }),
    )
  }
  await Promise.all(copies)
}

async function putKeep(request: Request, env: Env, app: AppRequest, keys: KeepKeys, clock: Clock): Promise<Response> {
  const text = await readJsonBody(request, app, MAX_BODY_BYTES)
  if (text instanceof Response) return text
  if (!isKeepBody(text)) return respond(app, 400)

  // 보관 시각은 폰 시계가 아니라 서버 시각 (날 가르기 기준)
  const savedAt = clock().toISOString()
  try {
    await copyBeforeOverwrite(env.KEEP, keys, kstDay(savedAt))
  } catch {
    // 사본이 빠진 채 최신본만 바뀌지 않게 새 값을 쓰지 않는다. 폰은 실패로 보고 다시 보낸다
    return respond(app, 503)
  }
  await env.KEEP.put(keys.latest, text, { metadata: { savedAt } })
  return respond(app, 204)
}

// 받을 키: 쿼리가 없으면 최신본, ?day=YYYY-MM-DD 는 날짜별 사본, ?month=YYYY-MM 은 달별 사본. 형식이 틀리면 undefined
function readKeyOf(url: URL, keys: KeepKeys): string | undefined {
  const day = url.searchParams.get('day')
  const month = url.searchParams.get('month')
  if (day !== null && month !== null) return undefined
  if (day !== null) return DAY_STAMP.test(day) ? `${keys.dayPrefix}${day}` : undefined
  if (month !== null) return MONTH_STAMP.test(month) ? `${keys.monthPrefix}${month}` : undefined
  return keys.latest
}

async function getKeep(request: Request, env: Env, app: AppRequest, keys: KeepKeys): Promise<Response> {
  const key = readKeyOf(new URL(request.url), keys)
  if (key === undefined) return respond(app, 400)
  const stored = await env.KEEP.get(key)
  return stored === null ? respond(app, 404) : respond(app, 200, stored, 'application/json')
}

interface CopyStamp {
  stamp: string
  savedAt: string
}

// 사본 목록: 키 끝의 날·달과 metadata 의 보관 시각, 최신 것부터.
// 서버는 사본에 늘 metadata 를 붙여 쓰므로 모양이 다른 것은 빼고 준다
async function listCopies(store: KeepStore, prefix: string, stampPattern: RegExp): Promise<CopyStamp[]> {
  const { keys } = await store.list({ prefix })
  return keys
    .flatMap(({ name, metadata }) => {
      const stamp = name.slice(prefix.length)
      const savedAt = savedAtOfMetadata(metadata)
      return stampPattern.test(stamp) && savedAt !== undefined ? [{ stamp, savedAt }] : []
    })
    .sort((a, b) => b.stamp.localeCompare(a.stamp))
}

// 개발자 꺼내기 스크립트가 부르는 사본 목록 (SPEC-011 1절). 본문은 주지 않고 날·달과 보관 시각만
async function getHistory(env: Env, app: AppRequest, keys: KeepKeys): Promise<Response> {
  const [latest, days, months] = await Promise.all([
    env.KEEP.getWithMetadata(keys.latest),
    listCopies(env.KEEP, keys.dayPrefix, DAY_STAMP),
    listCopies(env.KEEP, keys.monthPrefix, MONTH_STAMP),
  ])
  const latestSavedAt = latest.value === null ? undefined : keptAtOf(latest.value, latest.metadata)
  const body = JSON.stringify({
    latest: latestSavedAt === undefined ? undefined : { savedAt: latestSavedAt },
    days: days.map(({ stamp, savedAt }) => ({ date: stamp, savedAt })),
    months: months.map(({ stamp, savedAt }) => ({ month: stamp, savedAt })),
  })
  return respond(app, 200, body, 'application/json')
}

// 자동으로 지키기 끄기 [지우기]: 최신본·상태 신호(SPEC-007)와 날짜별·달별 사본(SPEC-011)을 모두 지운다.
// 같은 자리(본/미리보기) 안에서만. KV list 는 앞부분 일치라 다른 이름·다른 자리의 사본은 잡히지 않는다
async function deleteKeep(env: Env, app: AppRequest, keys: KeepKeys): Promise<Response> {
  const copies = await Promise.all([env.KEEP.list({ prefix: keys.dayPrefix }), env.KEEP.list({ prefix: keys.monthPrefix })])
  const copyKeys = copies.flatMap((listed) => listed.keys.map(({ name }) => name))
  await Promise.all([keys.latest, keys.status, ...copyKeys].map((key) => env.KEEP.delete(key)))
  return respond(app, 204)
}

async function putStatus(request: Request, env: Env, app: AppRequest, keys: KeepKeys, clock: Clock): Promise<Response> {
  const text = await readJsonBody(request, app, MAX_STATUS_BYTES)
  if (text instanceof Response) return text
  const signal = parseStatusBody(text)
  if (!signal) return respond(app, 400)

  // 받은 때는 폰 시계가 아니라 서버 시각
  await env.KEEP.put(keys.status, JSON.stringify({ ...signal, seenAt: clock().toISOString() }))
  return respond(app, 204)
}

async function handleKeep(request: Request, env: Env, app: AppRequest, keys: KeepKeys, clock: Clock): Promise<Response> {
  switch (request.method) {
    case 'PUT':
      return putKeep(request, env, app, keys, clock)
    case 'GET':
      return getKeep(request, env, app, keys)
    case 'DELETE':
      return deleteKeep(env, app, keys)
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
async function handleReport(request: Request, env: Env, clock: Clock): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405 })
  if (!isAuthorized(request, env.REPORT_TOKEN)) return new Response(null, { status: 401 })

  // 본 자리만 본다: KV list 는 앞부분 일치라 미리보기 신호(preview:status:…)는 잡히지 않는다 (#128)
  const { keys } = await env.KEEP.list({ prefix: STATUS_PREFIX })
  const summaries = await Promise.all(
    keys.map(async ({ name }) => toDeviceSummary(name, await env.KEEP.get(name))),
  )
  const devices = summaries.filter((summary) => summary !== null)
  const body = JSON.stringify({ now: clock().toISOString(), devices })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
}

// 이름(id)이 들어간 경로: 보관본 /v1/keep/<id>, 상태 신호 /v1/status/<id>, 사본 목록 /v1/keep/<id>/history
interface IdRoute {
  kind: 'keep' | 'status' | 'history'
  id: string
}

function idRouteOf(pathname: string): IdRoute | undefined {
  const history = HISTORY_PATH.exec(pathname)
  if (history) return { kind: 'history', id: history[1] }
  const match = ID_PATH.exec(pathname)
  if (!match) return undefined
  return { kind: match[1] === 'keep' ? 'keep' : 'status', id: match[2] }
}

export async function handleKeepRequest(
  request: Request,
  env: Env,
  clock: Clock = () => new Date(),
): Promise<Response> {
  const { pathname } = new URL(request.url)
  // 요약은 출처 검사보다 먼저 (앱이 아니라 GitHub Actions 에서 부른다)
  if (pathname === REPORT_PATH) return handleReport(request, env, clock)

  const route = idRouteOf(pathname)
  // 그 밖의 경로는 출처와 상관없이 404 (주소 확인용으로도 쓴다)
  if (!route) return new Response(null, { status: 404 })

  // 허용한 출처(앱 주소)에서 온 요청만 받는다. 출처가 없는 요청도 거부
  const origin = request.headers.get('Origin')
  const keyPrefix = origin === null ? undefined : ORIGIN_KEY_PREFIXES.get(origin)
  if (origin === null || keyPrefix === undefined) return new Response(null, { status: 403 })
  const app: AppRequest = { origin, keyPrefix }

  if (request.method === 'OPTIONS') return respond(app, 204)

  if (!KEEP_ID.test(route.id)) return respond(app, 400)
  const keys = keepKeysOf(app, route.id)

  switch (route.kind) {
    case 'keep':
      return handleKeep(request, env, app, keys, clock)
    case 'history':
      return request.method === 'GET' ? getHistory(env, app, keys) : respond(app, 405)
    case 'status':
      return request.method === 'PUT' ? putStatus(request, env, app, keys, clock) : respond(app, 405)
  }
}
