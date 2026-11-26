// 우리 장부 자동 보관 서버 (SPEC-006, ADR 005)
// 폰에서 암호화한 보관본을 이름(복구 코드에서 만든 SHA-256 해시)별로 KV 에 덮어쓴다.
// 서버는 내용도 복구 코드도 모른다: 받은 JSON 을 형식만 보고 그대로 저장·전달한다.
// SPEC-007(ADR 006): 같은 이름으로 폰의 보관 상태 신호를 받아 두고, 토큰을 가진 쪽(GitHub Actions)에 요약을 준다.
// #128(ADR 008): 본 주소와 미리보기 주소를 받고, 미리보기 요청은 KV 의 다른 자리(preview:)에 둔다.
// SPEC-011(ADR 010): 날(한국 시간)·달이 바뀐 뒤 첫 보관 때 있던 최신본을 날짜별·달별 사본으로 남기고, 개발자가 골라 받게 한다.
// 서버 밖 주간 사본(비공개 백업 레포의 GitHub Actions)에는 내보내기 토큰으로 본 자리 최신본 전부를 준다.
// SPEC-012(ADR 011): 상태 신호 v2 는 앱 오류 목록(정리한 글, 5줄까지)을 함께 싣고, 요약은 기기마다 그 목록을 준다.

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
  // 기기는 가족 몇 대, 사본은 이름당 최대 31 + 13개라 한 번(최대 1,000개)으로 충분하다. 다음 장(cursor)은 읽지 않는다.
  // list_complete 가 false 면 그 장 뒤에 더 있다 (내보내기는 잘린 목록을 주지 않는다)
  list(options: { prefix: string }): Promise<{ keys: { name: string; metadata?: unknown }[]; list_complete: boolean }>
}

export interface Env {
  KEEP: KeepStore
  // 요약 토큰 (Worker 비밀값). 넣지 않았으면 비어 있고, 그때 요약은 늘 401
  REPORT_TOKEN?: string
  // 내보내기 토큰 (Worker 비밀값, 요약 토큰과 별개, SPEC-011 2절). 넣지 않았으면 내보내기는 늘 401
  EXPORT_TOKEN?: string
}

// 서버 시각 (테스트는 정한 시각을 넣는다)
export type Clock = () => Date

const ID_PATH = /^\/v1\/(keep|status)\/([^/]+)$/
const HISTORY_PATH = /^\/v1\/keep\/([^/]+)\/history$/
const REPORT_PATH = '/v1/report'
const EXPORT_PATH = '/v1/export'
const STATUS_PREFIX = 'status:'
// 본 자리 최신본 키의 앞부분. 미리보기(preview:keep:)·사본(snap:·month:)은 앞부분이 달라 잡히지 않는다
const LATEST_PREFIX = 'keep:'
// 마지막 내보내기 { at, count } (요약이 싣는다)
const EXPORT_LAST_KEY = 'export:last'
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
    latest: `${place}${LATEST_PREFIX}${id}`,
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

// JSON 이 아니면 undefined
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// 보관본 형식: { v: 1, savedAt: ISO 시각, iv: base64, data: base64 }
function isKeepBody(text: string): boolean {
  const parsed = parseJson(text)
  if (!isRecord(parsed)) return false
  const { v, savedAt, iv, data } = parsed
  return v === 1 && typeof savedAt === 'string' && isIsoDate(savedAt) && isBase64(iv) && isBase64(data)
}

// 앱 오류 한 줄 (SPEC-012 2절 "서버에 평문으로 남는 것"): 폰이 같은 오류를 묶어 횟수와 처음·마지막 때(폰 시각)를 올린다
const APP_ERROR_KINDS = ['render', 'uncaught', 'rejection', 'save'] as const
type AppErrorKind = (typeof APP_ERROR_KINDS)[number]

interface AppError {
  kind: AppErrorKind
  name: string
  message: string
  screen: string
  where?: string
  count: number
  firstAt: string
  lastAt: string
}

const APP_ERROR_KEYS = new Set(['kind', 'name', 'message', 'screen', 'where', 'count', 'firstAt', 'lastAt'])
const MAX_APP_ERRORS = 5

// 상태 신호 (SPEC-007): 장부 내용·복구 코드는 없고 보관 상태만.
// v2(SPEC-012 2절)는 같은 칸에 앱 오류 목록(errors, 선택)을 더한다. 예전 앱이 보내는 v1 도 계속 받는다
interface StatusSignal {
  v: 1 | 2
  enabled: boolean
  pendingSince?: string
  lastKeptAt?: string
  tooLarge: boolean
  appVersion: string
  // v2 에만 있다. 칸이 없으면 undefined
  errors?: AppError[]
}

const STATUS_V1_KEYS = new Set(['v', 'enabled', 'pendingSince', 'lastKeptAt', 'tooLarge', 'appVersion'])
const STATUS_V2_KEYS = new Set([...STATUS_V1_KEYS, 'errors'])

// 정한 칸 말고 다른 것이 섞여 있는가 (서버에 평문으로 남는 것을 정한 만큼으로)
function hasOtherKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(record).some((key) => !allowed.has(key))
}

function isTextOfLength(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max
}

function isIsoText(value: unknown): value is string {
  return typeof value === 'string' && isIsoDate(value)
}

function isAppErrorKind(value: unknown): value is AppErrorKind {
  return APP_ERROR_KINDS.some((kind) => kind === value)
}

// 칸 길이: 이름 1~40자, 글 0~120자(폰이 정리한 글), 화면 1~32자, 위치 0~80자(없으면 뺀다)
function toAppError(value: unknown): AppError | null {
  if (!isRecord(value) || hasOtherKeys(value, APP_ERROR_KEYS)) return null
  const { kind, name, message, screen, where, count, firstAt, lastAt } = value
  if (!isAppErrorKind(kind)) return null
  if (!isTextOfLength(name, 1, 40) || !isTextOfLength(message, 0, 120) || !isTextOfLength(screen, 1, 32)) return null
  if (where !== undefined && !isTextOfLength(where, 0, 80)) return null
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return null
  if (!isIsoText(firstAt) || !isIsoText(lastAt)) return null
  return { kind, name, message, screen, where, count, firstAt, lastAt }
}

// 오류 목록: 5줄까지, 한 줄이라도 틀리면 null
function toAppErrors(value: unknown): AppError[] | null {
  if (!Array.isArray(value) || value.length > MAX_APP_ERRORS) return null
  const errors: AppError[] = []
  for (const item of value) {
    const error = toAppError(item)
    if (!error) return null
    errors.push(error)
  }
  return errors
}

function toStatusSignal(record: Record<string, unknown>): StatusSignal | null {
  const { v, enabled, pendingSince, lastKeptAt, tooLarge, appVersion } = record
  if ((v !== 1 && v !== 2) || typeof enabled !== 'boolean' || typeof tooLarge !== 'boolean') return null
  if (pendingSince !== undefined && (typeof pendingSince !== 'string' || !isIsoDate(pendingSince))) return null
  if (lastKeptAt !== undefined && (typeof lastKeptAt !== 'string' || !isIsoDate(lastKeptAt))) return null
  if (typeof appVersion !== 'string' || appVersion.length === 0) return null
  if (appVersion.length > MAX_APP_VERSION_LENGTH) return null
  const signal: StatusSignal = { v, enabled, pendingSince, lastKeptAt, tooLarge, appVersion }
  // v1 에 오류 칸이 오는 것은 받을 때 칸 검사(parseStatusBody)가 막는다
  if (record.errors === undefined) return signal
  const errors = toAppErrors(record.errors)
  return errors === null ? null : { ...signal, errors }
}

// 정한 칸 말고 다른 것이 섞여 있으면 받지 않는다. v1 에 오류 칸(errors)이 와도 400
function parseStatusBody(text: string): StatusSignal | null {
  const parsed = parseJson(text)
  if (!isRecord(parsed)) return null
  if (hasOtherKeys(parsed, parsed.v === 2 ? STATUS_V2_KEYS : STATUS_V1_KEYS)) return null
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

// { savedAt: ISO 시각 } 의 보관 시각 (서버가 최신본·사본에 붙이는 metadata, 보관본 겉봉투). 모양이 다르면 undefined
function savedAtOf(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const { savedAt } = value
  return typeof savedAt === 'string' && isIsoDate(savedAt) ? savedAt : undefined
}

// 최신본의 보관 시각: metadata 의 서버 시각, 없으면(이 기능 전에 저장한 최신본) 보관본 겉봉투의 savedAt
function keptAtOf(value: string, metadata: unknown): string | undefined {
  return savedAtOf(metadata) ?? savedAtOf(parseJson(value))
}

// 새 값을 쓰기 전에: 지금 최신본의 보관일이 오늘보다 앞이면 그 날 사본으로, 보관 달이 이번 달이 아니면 달 사본으로도 복사한다.
// 그래서 사본은 "그날(그달) 마지막으로 보관된 모습"이다. 이미 있으면 덮어쓴다
async function copyBeforeOverwrite(store: KeepStore, keys: KeepKeys, today: string): Promise<void> {
  const { value, metadata } = await store.getWithMetadata(keys.latest)
  if (value === null) return
  // 받을 때 형식을 검사하므로 보관 시각이 없을 일은 없다. 없으면 이름을 정할 수 없어 복사하지 않는다
  const keptAt = keptAtOf(value, metadata)
  if (keptAt === undefined) return
  const keptDay = kstDay(keptAt)
  // 오늘이거나, metadata 없는 옛 최신본의 폰 시계가 앞서 있어 미래 날이면 복사하지 않는다 (미래 날·달 사본이 생기지 않게, #190 리뷰)
  if (keptDay >= today) return

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
    // 복사가 실패하면 사본이 빠진 채 최신본만 바뀌지 않게 새 값을 쓰지 않는다
    await copyBeforeOverwrite(env.KEEP, keys, kstDay(savedAt))
    await env.KEEP.put(keys.latest, text, { metadata: { savedAt } })
  } catch {
    // 복사든 최신본 쓰기(예: KV 하루 쓰기 한도)든 CORS 헤더가 있는 503 으로 답한다.
    // CORS 없는 500 이면 폰은 연결 실패로 본다. 503 이면 실패로 보고 다시 보낸다 (#190 리뷰)
    return respond(app, 503)
  }
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
      const savedAt = savedAtOf(metadata)
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

interface DeviceSummary extends Omit<StatusSignal, 'v' | 'errors'> {
  id: string
  seenAt: string
  // 앱 오류 목록 (SPEC-012 2절). v1 신호이거나 오류 칸이 없으면 빈 목록
  errors: AppError[]
}

// 저장한 신호를 요약 한 줄로. 서버가 쓴 값이라 형식이 틀릴 일은 없지만, 틀리면 빼고 준다
function toDeviceSummary(key: string, stored: string | null): DeviceSummary | null {
  if (stored === null) return null
  const parsed = parseJson(stored)
  if (!isRecord(parsed) || typeof parsed.seenAt !== 'string') return null
  const signal = toStatusSignal(parsed)
  if (!signal) return null
  const { enabled, pendingSince, lastKeptAt, tooLarge, appVersion, errors } = signal
  return {
    // 기기는 이름(64자 해시)의 앞 8자로만 보여 준다
    id: key.slice(STATUS_PREFIX.length, STATUS_PREFIX.length + 8),
    seenAt: parsed.seenAt,
    enabled,
    pendingSince,
    lastKeptAt,
    tooLarge,
    appVersion,
    errors: errors ?? [],
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

interface LastExport {
  lastAt: string
  count: number
}

// 마지막 내보내기 (SPEC-011 2절). 아직 없거나 모양이 틀리면 null
async function lastExportOf(store: KeepStore): Promise<LastExport | null> {
  const stored = await store.get(EXPORT_LAST_KEY)
  const parsed = stored === null ? undefined : parseJson(stored)
  if (!isRecord(parsed)) return null
  const { at, count } = parsed
  if (typeof at !== 'string' || !isIsoDate(at)) return null
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null
  return { lastAt: at, count }
}

// GitHub Actions 가 부르는 요약: 출처 검사·CORS 헤더 없이 토큰으로만 연다
async function handleReport(request: Request, env: Env, clock: Clock): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405 })
  if (!isAuthorized(request, env.REPORT_TOKEN)) return new Response(null, { status: 401 })

  // 본 자리만 본다: KV list 는 앞부분 일치라 미리보기 신호(preview:status:…)는 잡히지 않는다 (#128)
  const { keys } = await env.KEEP.list({ prefix: STATUS_PREFIX })
  const [summaries, lastExport] = await Promise.all([
    Promise.all(keys.map(async ({ name }) => toDeviceSummary(name, await env.KEEP.get(name)))),
    lastExportOf(env.KEEP),
  ])
  const devices = summaries.filter((summary) => summary !== null)
  return jsonResponse({ now: clock().toISOString(), devices, export: lastExport })
}

interface ExportItem {
  id: string
  savedAt: string
  envelope: Record<string, unknown>
}

// 최신본 하나를 내보낼 줄로. 서버가 쓴 값이라 틀릴 일은 없지만, 이름·본문이 틀렸거나 그사이 지워졌으면 뺀다
async function exportItemOf(store: KeepStore, name: string): Promise<ExportItem | null> {
  const id = name.slice(LATEST_PREFIX.length)
  if (!KEEP_ID.test(id)) return null
  const { value, metadata } = await store.getWithMetadata(name)
  if (value === null) return null
  const savedAt = keptAtOf(value, metadata)
  const envelope = parseJson(value)
  if (savedAt === undefined || !isRecord(envelope)) return null
  return { id, savedAt, envelope }
}

// 비공개 백업 레포의 GitHub Actions 가 부르는 내보내기 (SPEC-011 2절): 요약처럼 출처 검사·CORS 헤더 없이 내보내기 토큰으로만 연다.
// 본 자리 최신본만 준다(KV list 는 앞부분 일치라 미리보기·날짜별·달별 사본은 잡히지 않는다). 순서는 KV list 의 이름순(= id 순).
// 목록이 한 장(1,000개)을 넘어 잘리면 503: 잘린 목록을 주면 백업 레포가 빠진 id 의 파일을 지운다. 이어 받기(cursor)는 하지 않는다 (#194 리뷰).
// 내보낸 때를 export:last 에 남기지 못해도 503: 요약(보관 지켜보기)이 모르는 내보내기가 성공으로 끝나지 않게
async function handleExport(request: Request, env: Env, clock: Clock): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405 })
  if (!isAuthorized(request, env.EXPORT_TOKEN)) return new Response(null, { status: 401 })

  const { keys, list_complete: complete } = await env.KEEP.list({ prefix: LATEST_PREFIX })
  if (!complete) return new Response(null, { status: 503 })
  const found = await Promise.all(keys.map(({ name }) => exportItemOf(env.KEEP, name)))
  const items = found.filter((item) => item !== null)
  const exportedAt = clock().toISOString()
  try {
    await env.KEEP.put(EXPORT_LAST_KEY, JSON.stringify({ at: exportedAt, count: items.length }))
  } catch {
    return new Response(null, { status: 503 })
  }
  return jsonResponse({ exportedAt, items })
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
  // 요약·내보내기는 출처 검사보다 먼저 (앱이 아니라 GitHub Actions 에서 부른다)
  if (pathname === REPORT_PATH) return handleReport(request, env, clock)
  if (pathname === EXPORT_PATH) return handleExport(request, env, clock)

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
