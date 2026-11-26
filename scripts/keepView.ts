// 보관본 들여다보기 (SPEC-013, #205) — 개발자가 내 맥에서 기기별 보관본 사본을 DB 보듯 보는 도구의 순수 함수
//
// scripts/keep-view.mjs(로컬 서버)가 이 파일을 불러 요청을 처리하고(사본 목록 합치기·형식 검사·Host 검사),
// 같은 파일을 타입만 지워(node:module stripTypeScriptTypes) 페이지(scripts/keep-view/index.html)에도 보낸다.
// 페이지는 여기의 겉 정보·풀기·코드로 열기 함수와 keepRescue.ts 의 암호 함수를 브라우저 안에서 쓴다.
// 그래서 keepRescue.ts 처럼 타입 지우기로 없어지는 문법만 쓰고(erasableSyntaxOnly), keepRescue.ts 말고는 불러오지 않는다.
// 입출력(보관 서버 부르기·git)은 인자로 받는다. 보관 서버에는 GET 만 보낸다(keepRescue getJson, 본 주소 출처).
// 복구 코드는 페이지 안(그 탭 메모리)에서만 다루고, 로컬 서버로 가는 주소에는 코드에서 만든 id 만 쓴다.
import {
  BROKEN_ENVELOPE,
  BROKEN_HISTORY,
  copyUrl,
  formatKst,
  getJson,
  GONE_COPY,
  INVALID_CODE,
  isRecord,
  keepIdOf,
  NO_HISTORY_ROUTE,
  normalizeRecoveryCode,
  NOT_BACKUP,
  NOT_FOUND,
  openKeep,
  parseJson,
  summarizeBackup,
  toCopyStamps,
  toEnvelope,
  WRONG_CODE,
} from './keepRescue.ts'
import type { FetchFn, KeepEnvelope, RescueTarget } from './keepRescue.ts'

export const DEFAULT_PORT = 7788
// 보관 서버가 받는 보관본 크기 한도 (worker/src/keep.ts MAX_BODY_BYTES)
export const KEEP_LIMIT_BYTES = 1_048_576
// 클론 마지막 커밋이 이보다 오래면 git pull 안내 (주간 사본은 주 1회)
export const STALE_CLONE_DAYS = 8
// 앱의 지금 저장 형식 (src/domain/types.ts CURRENT_SCHEMA_VERSION). 이보다 낮으면 옛 형식이라고 적는다
export const CURRENT_SCHEMA_VERSION = 4
// 겉봉투 data 는 앞부분만 보인다
export const DATA_PREVIEW_CHARS = 48

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
// 서버 사본이 남는 날 수 (worker: 날짜별 TTL 31일, 달별 TTL 400일, SPEC-011 1절)
const DAY_COPY_DAYS = 31
const MONTH_COPY_DAYS = 400

export const VIEW_USAGE = '쓰는 법: node scripts/keep-view.mjs [--port 7788]'
export const NO_KEEP_URL =
  'KEEP_URL 이 없어 서버 사본(최신본·날짜별·달별) 없이 백업 레포만 봐요. 서버도 보려면 KEEP_URL=$(gh variable get KEEP_URL) node scripts/keep-view.mjs'
export const BROKEN_INDEX = '백업 레포 index.json 을 읽지 못했어요. 기기는 위 [코드로 열기]로 열어요'
export const NO_DEVICE_NAMES = '백업 레포에 devices.json 이 없어 기기 이름 없이 보여요 (SPEC-012 1절)'
export const BROKEN_DEVICE_NAMES = '기기 이름 파일(devices.json) 모양이 틀려요. 이름 없이 보여요'
export const NOT_THIS_DEVICE = '이 기기의 코드가 아니에요'
export const NO_SERVER_COPY = 'KEEP_URL 이 없어 서버 사본을 받지 못해요'
export const NO_WEEK_FILE = '백업 레포에서 그 커밋의 파일을 읽지 못했어요'
export const BROKEN_WEEK_FILE = '백업 레포 파일이 보관본 모양이 아니에요'
export const BAD_QUERY =
  '주소 형식이 틀렸어요 (id 64자 16진수, kind latest·day·month·week, key 날 YYYY-MM-DD·달 YYYY-MM·커밋 40자 16진수)'

export function noCloneNotice(backupDir: string): string {
  return `백업 레포 클론이 없어요 (${backupDir}). 주간 사본 없이 보고, 기기는 위 [코드로 열기]로만 열어요. 다른 곳에 있으면 KEEP_BACKUP_DIR 로 알려 주세요`
}

export function staleCloneNotice(days: number): string {
  return `백업 레포를 먼저 받아 오세요 (git pull) — 클론을 받아 온 지 ${days}일 지났어요`
}

// 도구 안에서 생각 못 한 오류 (요청 처리 중 던진 것)
export const SERVER_ERROR = '보관본 들여다보기 안에서 오류가 났어요. 터미널에서 도구를 다시 켜 보세요'

// 로컬 서버 답이 JSON 이 아닐 때 (도구가 아닌 다른 것이 그 포트에서 답했거나 도구가 망가짐)
export function strangeLocalAnswer(status: number): string {
  return `로컬 서버가 알 수 없는 답을 줬어요 (HTTP ${status}). 터미널에서 도구가 켜져 있는지 보세요`
}

// ---------- 형식 ----------

// git 인자·서버 주소에 쓰기 전에 모양을 본다 (아무 글자나 넘기지 않게)
const KEEP_ID = /^[0-9a-f]{64}$/
const DAY_KEY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/
const COMMIT_KEY = /^[0-9a-f]{40}$/
const NAME_KEY = /^[0-9a-f]{8}$/

export type CopyKind = 'latest' | 'day' | 'month' | 'week'

// 사본 하나를 가리키는 값. key: 최신본 '', 날짜별 YYYY-MM-DD, 달별 YYYY-MM, 주간 커밋 해시(40자)
export interface CopyRef {
  kind: CopyKind
  key: string
}

export function isKeepId(value: string): boolean {
  return KEEP_ID.test(value)
}

export function isCopyRef(kind: string, key: string): boolean {
  if (kind === 'latest') return key === ''
  if (kind === 'day') return DAY_KEY.test(key)
  if (kind === 'month') return MONTH_KEY.test(key)
  if (kind === 'week') return COMMIT_KEY.test(key)
  return false
}

function toCopyKind(kind: string): CopyKind | undefined {
  if (kind === 'latest' || kind === 'day' || kind === 'month' || kind === 'week') return kind
  return undefined
}

export type CopyQuery = { ok: true; id: string; copy: CopyRef } | { ok: false; message: string }

// /api/copy?id=&kind=&key= 를 검사한다. 하나라도 틀리면 git 도 서버도 부르지 않는다
export function parseCopyQuery(params: URLSearchParams): CopyQuery {
  const id = params.get('id') ?? ''
  const kind = toCopyKind(params.get('kind') ?? '')
  const key = params.get('key') ?? ''
  if (!isKeepId(id) || kind === undefined || !isCopyRef(kind, key)) return { ok: false, message: BAD_QUERY }
  return { ok: true, id, copy: { kind, key } }
}

// 페이지가 부르는 로컬 서버 주소. id 와 사본 자리만 들어가고 복구 코드는 들어가지 않는다
export const DEVICES_PATH = '/api/devices'

export function historyPath(id: string): string {
  return `/api/history?id=${id}`
}

export function copyPath(id: string, copy: CopyRef): string {
  return `/api/copy?id=${id}&kind=${copy.kind}&key=${encodeURIComponent(copy.key)}`
}

// ---------- 켜기·Host ----------

export type ViewArgs = { ok: true; port: number } | { ok: false; message: string }

// --port 만 받는다. 0 이면 빈 포트를 고른다(시험용).
// 1~1023 은 받지 않는다: 80 이면 브라우저가 Host 에서 포트를 빼서(127.0.0.1) 모든 요청이 Host 검사에 걸리고, 나머지는 관리자 권한이 필요하다
export function parseViewArgs(args: readonly string[]): ViewArgs {
  let port = DEFAULT_PORT
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg !== '--port') return { ok: false, message: `모르는 인자예요: ${arg}\n${VIEW_USAGE}` }
    const value = args[++index] ?? ''
    const number = Number(value)
    if (!/^\d{1,5}$/.test(value) || number > 65_535 || (number > 0 && number < 1024)) {
      return { ok: false, message: `--port 뒤에는 1024~65535 포트 번호를 적어요: "${value}"\n${VIEW_USAGE}` }
    }
    port = Number(value)
  }
  return { ok: true, port }
}

// DNS rebinding 막기: 이 맥의 주소로 부른 요청만 받는다
export function isAllowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

// ---------- 출처 읽기 ----------

// 백업 레포 index.json [{ id, savedAt, bytes }] → 기기 id 들. 모양이 틀리면 undefined
export function parseBackupIndex(text: string): string[] | undefined {
  const raw = parseJson(text)
  if (!Array.isArray(raw)) return undefined
  return raw.flatMap((item) => (isRecord(item) && typeof item.id === 'string' && isKeepId(item.id) ? [item.id] : []))
}

// devices.json { "aaa97843": "엄마 폰" } (SPEC-012 1절) → id 앞 8자별 이름. 모양이 틀리면 undefined.
// 모양 규칙은 보관 지켜보기(ops/keep-backup/scripts/keepWatch.ts parseDeviceNames)와 같다: 키는 소문자 16진수 8자, 값은 빈칸 아닌 글자.
// 그 파일은 페이지로 보내지 않으므로 불러오지 않고 같은 규칙을 둔다
export function parseDeviceNames(text: string): Map<string, string> | undefined {
  const raw = parseJson(text)
  if (!isRecord(raw)) return undefined
  const names = new Map<string, string>()
  for (const [key, name] of Object.entries(raw)) {
    if (!NAME_KEY.test(key) || typeof name !== 'string' || name.trim() === '') return undefined
    names.set(key, name.trim())
  }
  return names
}

export interface WeekCommit {
  commit: string
  at: string
}

// git log --format=%H%x09%cI 출력 → 주간 사본 커밋들 (최신 것부터)
export function parseWeekLog(text: string): WeekCommit[] {
  return text.split('\n').flatMap((line) => {
    const [commit = '', at = ''] = line.split('\t')
    return COMMIT_KEY.test(commit) && !Number.isNaN(Date.parse(at)) ? [{ commit, at }] : []
  })
}

// git cat-file --batch-check 출력(넣은 순서대로 `<해시> blob <크기>` 또는 `<이름> missing`) → 크기들
export function parseBlobSizes(text: string): (number | undefined)[] {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const match = /^[0-9a-f]{40} blob (\d+)$/.exec(line)
      return match ? Number(match[1]) : undefined
    })
}

// ---------- 사본 목록 ----------

export interface CopyItem extends CopyRef {
  // 서버 사본은 서버가 받은 때, 주간 사본은 백업 레포에 넣은 커밋 시각
  at: string
  // 보관본 크기(바이트). 못 받았으면 없음
  bytes?: number
  // 사라진 사본 등 그 사본을 못 받은 이유
  problem?: string
}

export interface DeviceView {
  id: string
  // devices.json 이름 (없으면 "이름 없음"으로 보인다)
  name?: string
  // 최신본 → 날짜별 → 달별(서버가 준 순서, 최신 것부터) → 주간(최신 것부터)
  copies: CopyItem[]
  // 이 기기의 서버 사본 자리에 보일 문구 (닿지 못함·예전 서버 등, 꺼내기 스크립트와 같은 문구)
  serverProblem?: string
}

export interface DevicesAnswer {
  notices: string[]
  devices: DeviceView[]
}

export type HistoryAnswer = { ok: true; device: DeviceView } | { ok: false; message: string }

export type CopyAnswer = { ok: true; envelope: KeepEnvelope; bytes: number } | { ok: false; message: string }

// git 을 백업 레포 클론에서 돌린다. 실패하면 undefined. input 은 표준 입력
export type GitFn = (args: readonly string[], input?: string) => Promise<string | undefined>

export interface ViewSources {
  // 보관 서버 주소. '' 이면 서버 사본 없이
  keepUrl: string
  // 백업 레포 클론 자리 (안내 문구용, git 은 이미 그 자리에서 돈다)
  backupDir: string
  fetchFn: FetchFn
  git: GitFn
  // 클론을 마지막으로 받아 온 때(ISO, git fetch·pull 이 쓰는 FETCH_HEAD 의 수정 시각). 모르면 undefined
  fetchedAt: () => Promise<string | undefined>
}

function keepBase(keepUrl: string, id: string): string {
  return `${keepUrl.replace(/\/+$/, '')}/v1/keep/${id}`
}

function keyOf(target: RescueTarget): string {
  if (target.kind === 'day') return target.date
  if (target.kind === 'month') return target.month
  return ''
}

function targetOf(copy: CopyRef): RescueTarget | undefined {
  if (copy.kind === 'latest') return { kind: 'latest' }
  if (copy.kind === 'day') return { kind: 'day', date: copy.key }
  if (copy.kind === 'month') return { kind: 'month', month: copy.key }
  return undefined
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

// 서버의 사본 목록 + 사본마다 GET 하나로 크기 (꺼내기 --list 와 같은 방식). 404 인 사본은 그 줄에 GONE_COPY
async function serverCopies(id: string, sources: ViewSources): Promise<{ copies: CopyItem[]; problem?: string }> {
  if (sources.keepUrl === '') return { copies: [] }
  const base = keepBase(sources.keepUrl, id)
  const fetched = await getJson(`${base}/history`, sources.fetchFn, NO_HISTORY_ROUTE)
  if (!fetched.ok) return { copies: [], problem: fetched.message }
  const stamps = toCopyStamps(fetched.body)
  if (stamps === undefined || !stamps.every(({ target }) => isCopyRef(target.kind, keyOf(target)))) {
    return { copies: [], problem: BROKEN_HISTORY }
  }
  const copies = await Promise.all(
    stamps.map(async ({ target, savedAt }): Promise<CopyItem> => {
      const item = { kind: target.kind, key: keyOf(target), at: savedAt }
      const got = await getJson(copyUrl(base, target), sources.fetchFn, GONE_COPY)
      return got.ok ? { ...item, bytes: got.bytes } : { ...item, problem: got.message }
    }),
  )
  return { copies }
}

// 백업 레포에서 keep/<id>.json 이 생기거나 바뀐 커밋 = 주간 사본. 크기는 git cat-file 한 번으로
async function weekCopies(id: string, git: GitFn): Promise<CopyItem[]> {
  const path = `keep/${id}.json`
  const log = await git(['log', '--format=%H%x09%cI', '--diff-filter=AM', '--', path])
  const commits = log === undefined ? [] : parseWeekLog(log)
  if (commits.length === 0) return []
  const batch = commits.map(({ commit }) => `${commit}:${path}\n`).join('')
  const sizes = parseBlobSizes((await git(['cat-file', '--batch-check'], batch)) ?? '')
  return commits.map(({ commit, at }, index) => ({ kind: 'week', key: commit, at, bytes: sizes[index] }))
}

async function loadDevice(id: string, names: ReadonlyMap<string, string>, sources: ViewSources): Promise<DeviceView> {
  const [server, weeks] = await Promise.all([serverCopies(id, sources), weekCopies(id, sources.git)])
  return { id, name: names.get(id.slice(0, 8)), copies: [...server.copies, ...weeks], serverProblem: server.problem }
}

interface CloneFiles {
  lastCommitAt: string
  fetchedAt?: string
  indexText?: string
  namesText?: string
}

// 클론의 마지막 커밋 시각·마지막으로 받아 온 때와 index.json·devices.json (커밋된 것). 클론이 없으면 undefined. pull 하지 않는다
async function readClone({ git, fetchedAt }: ViewSources): Promise<CloneFiles | undefined> {
  const last = (await git(['log', '-1', '--format=%cI']))?.trim() ?? ''
  if (Number.isNaN(Date.parse(last))) return undefined
  const [indexText, namesText, fetched] = await Promise.all([git(['show', 'HEAD:index.json']), git(['show', 'HEAD:devices.json']), fetchedAt()])
  return { lastCommitAt: last, fetchedAt: fetched, indexText, namesText }
}

// 클론이 얼마나 오래됐는지의 기준: 마지막으로 받아 온 때, 모르면(받아 온 적 없는 새 클론) 마지막 커밋.
// 주간 워크플로는 바뀐 게 없으면 커밋하지 않아서, 커밋 시각만 보면 막 git pull 한 클론도 오래돼 보인다
function cloneTime(clone: CloneFiles): number {
  const fetched = clone.fetchedAt === undefined ? Number.NaN : Date.parse(clone.fetchedAt)
  return Number.isNaN(fetched) ? Date.parse(clone.lastCommitAt) : fetched
}

// /api/devices: 기기 목록은 백업 레포 index.json 에서, 사본은 서버 목록과 커밋 이력에서.
// 못 쓰는 출처는 빼고 위에 안내 한 줄씩 (서버 문제는 같은 문구를 한 번만)
export async function listDevices(sources: ViewSources, now: number): Promise<DevicesAnswer> {
  const notices: string[] = []
  if (sources.keepUrl === '') notices.push(NO_KEEP_URL)
  const clone = await readClone(sources)
  if (clone === undefined) {
    notices.push(noCloneNotice(sources.backupDir))
    return { notices, devices: [] }
  }
  const age = now - cloneTime(clone)
  if (age > STALE_CLONE_DAYS * DAY_MS) notices.push(staleCloneNotice(Math.floor(age / DAY_MS)))

  const ids = clone.indexText === undefined ? undefined : parseBackupIndex(clone.indexText)
  if (ids === undefined) notices.push(BROKEN_INDEX)
  const names = clone.namesText === undefined ? undefined : parseDeviceNames(clone.namesText)
  if (clone.namesText === undefined) notices.push(NO_DEVICE_NAMES)
  else if (names === undefined) notices.push(BROKEN_DEVICE_NAMES)

  const devices = await Promise.all((ids ?? []).map((id) => loadDevice(id, names ?? new Map(), sources)))
  const problems = new Set(devices.flatMap(({ serverProblem }) => (serverProblem === undefined ? [] : [serverProblem])))
  return { notices: [...notices, ...problems], devices }
}

// /api/history?id=: 코드로 열기. 목록에 없는 기기도 서버 사본(과 클론에 있으면 주간 사본)을 모은다
export async function historyOf(id: string, sources: ViewSources): Promise<DeviceView> {
  const namesText = await sources.git(['show', 'HEAD:devices.json'])
  const names = namesText === undefined ? undefined : parseDeviceNames(namesText)
  return loadDevice(id, names ?? new Map(), sources)
}

// /api/copy: 사본 하나의 겉봉투(암호문)와 크기. 서버 사본은 본 주소 출처 GET, 주간 사본은 git show
export async function readCopy(id: string, copy: CopyRef, sources: ViewSources): Promise<CopyAnswer> {
  const target = targetOf(copy)
  if (target === undefined) {
    const text = await sources.git(['show', `${copy.key}:keep/${id}.json`])
    if (text === undefined) return { ok: false, message: NO_WEEK_FILE }
    const envelope = toEnvelope(parseJson(text))
    return envelope === undefined ? { ok: false, message: BROKEN_WEEK_FILE } : { ok: true, envelope, bytes: byteLength(text) }
  }
  if (sources.keepUrl === '') return { ok: false, message: NO_SERVER_COPY }
  // 목록을 받은 뒤 고른 사본이라, 404 는 그사이 사라졌다는 문구로
  const fetched = await getJson(copyUrl(keepBase(sources.keepUrl, id), target), sources.fetchFn, GONE_COPY)
  if (!fetched.ok) return fetched
  const envelope = toEnvelope(fetched.body)
  return envelope === undefined ? { ok: false, message: BROKEN_ENVELOPE } : { ok: true, envelope, bytes: fetched.bytes }
}

// ---------- 로컬 서버 요청 ----------

export interface ViewRequest {
  method: string
  url: string
  host: string | undefined
}

export interface ViewResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface StaticFile {
  type: string
  body: string
}

export interface ViewServer {
  // 실제로 열린 포트 (Host 검사)
  port: number
  // 경로 → 페이지·모듈 (keep-view.mjs 가 켤 때 읽어 둔다)
  files: ReadonlyMap<string, StaticFile>
  sources: ViewSources
}

// 모든 응답: 캐시하지 않고, 페이지는 이 맥 밖으로 아무것도 보내지 못하게(connect-src 'self') 막는다
const COMMON_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
}

function respond(status: number, type: string, body: string): ViewResponse {
  return { status, headers: { ...COMMON_HEADERS, 'Content-Type': type }, body }
}

function json(status: number, value: unknown): ViewResponse {
  return respond(status, 'application/json; charset=utf-8', JSON.stringify(value))
}

function plain(status: number, text: string): ViewResponse {
  return respond(status, 'text/plain; charset=utf-8', text)
}

// 로컬 서버 요청 하나. Host 검사 → GET 만 → 페이지·모듈 → API. id·날·달·커밋은 형식을 본 뒤에만 git·서버에 쓴다.
// 던지지 않는다: 처리 중 오류는 다른 답과 같은 헤더를 붙인 500 JSON { ok: false, message } 로
export async function handleRequest(request: ViewRequest, server: ViewServer, now: number): Promise<ViewResponse> {
  try {
    return await answerRequest(request, server, now)
  } catch {
    return json(500, { ok: false, message: SERVER_ERROR })
  }
}

async function answerRequest(request: ViewRequest, server: ViewServer, now: number): Promise<ViewResponse> {
  if (!isAllowedHost(request.host, server.port)) return plain(403, `이 도구는 http://127.0.0.1:${server.port}/ 로만 열어요`)
  if (request.method !== 'GET') return plain(405, 'GET 만 받아요 (읽기만 하는 도구)')
  const url = new URL(request.url, 'http://127.0.0.1')
  const file = server.files.get(url.pathname)
  if (file !== undefined) return respond(200, file.type, file.body)

  if (url.pathname === DEVICES_PATH) return json(200, await listDevices(server.sources, now))
  if (url.pathname === '/api/history') {
    const id = url.searchParams.get('id') ?? ''
    if (!isKeepId(id)) return json(400, { ok: false, message: BAD_QUERY })
    const answer: HistoryAnswer = { ok: true, device: await historyOf(id, server.sources) }
    return json(200, answer)
  }
  if (url.pathname === '/api/copy') {
    const query = parseCopyQuery(url.searchParams)
    if (!query.ok) return json(400, query)
    return json(200, await readCopy(query.id, query.copy, server.sources))
  }
  return plain(404, '없는 주소예요')
}

// ---------- 페이지: 겉 정보 ----------

export interface InfoRow {
  label: string
  value: string
}

// 왼쪽 목록의 묶음 (보이는 순서)
export const COPY_GROUPS: readonly { kind: CopyKind; title: string }[] = [
  { kind: 'latest', title: '최신본' },
  { kind: 'day', title: `날짜별 · ${DAY_COPY_DAYS}일` },
  { kind: 'month', title: `달별 · ${MONTH_COPY_DAYS}일` },
  { kind: 'week', title: '주간 · 백업 레포' },
]

function kstDay(ms: number): string {
  return formatKst(new Date(ms).toISOString()).slice(0, 10)
}

export function deviceName(device: DeviceView): string {
  return device.name ?? '이름 없음'
}

export function copyLabel(copy: CopyItem): string {
  if (copy.kind === 'latest') return '최신본'
  if (copy.kind === 'day') return `날짜별 ${copy.key}`
  if (copy.kind === 'month') return `달별 ${copy.key}`
  return `주간 ${formatKst(copy.at).slice(0, 10)}`
}

// 왼쪽 목록 한 줄 (시각은 한국 시간)
export function copyListText(copy: CopyItem): string {
  const at = formatKst(copy.at)
  if (copy.kind === 'latest') return `최신본 ${at.slice(5)}`
  if (copy.kind === 'day') return `${copy.key.slice(5)} ${at.slice(11)}`
  if (copy.kind === 'month') return copy.key
  return `${at.slice(5, 10)} · ${copy.key.slice(0, 7)}`
}

export function sizeText(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

// 1MB 한도의 몇 %인지 (소수 한 자리)
export function limitShare(bytes: number): string {
  return `${((bytes / KEEP_LIMIT_BYTES) * 100).toFixed(1)}%`
}

// 있는 곳: 서버 KV 키 또는 백업 레포 <커밋>:keep/<id>.json
export function whereOf(id: string, copy: CopyRef): string {
  if (copy.kind === 'latest') return `서버 KV keep:${id}`
  if (copy.kind === 'day') return `서버 KV snap:${id}:${copy.key}`
  if (copy.kind === 'month') return `서버 KV month:${id}:${copy.key}`
  return `백업 레포 ${copy.key}:keep/${id}.json`
}

function untilText(days: number, earliest: number, now: number): string {
  const left = Math.floor((earliest - now) / DAY_MS)
  const rest = left > 0 ? `앞으로 ${left}일 이상` : '곧 사라질 수 있어요'
  return `만든 때부터 ${days}일 · 적어도 ${kstDay(earliest)} 0시까지 남아요 (${rest})`
}

// 남는 기간. 날짜별 사본은 그 날 다음 날 이후의 첫 보관 때, 달별은 다음 달 이후의 첫 보관 때 만들어지므로
// 가장 빨리 사라지는 때는 (그 날 다음 날 0시 + 31일)·(다음 달 1일 0시 + 400일), 한국 시간
export function lifeOf(copy: CopyRef, now: number): string {
  if (copy.kind === 'latest') return '다음 보관 때 바뀌어요'
  if (copy.kind === 'week') return '계속 남아요 (백업 레포 커밋 이력)'
  if (copy.kind === 'day') {
    const nextDay = Date.parse(`${copy.key}T00:00:00+09:00`) + DAY_MS
    return untilText(DAY_COPY_DAYS, nextDay + DAY_COPY_DAYS * DAY_MS, now)
  }
  const [year, month] = copy.key.split('-').map(Number)
  const nextMonth = Date.UTC(year, month, 1) - KST_OFFSET_MS
  return untilText(MONTH_COPY_DAYS, nextMonth + MONTH_COPY_DAYS * DAY_MS, now)
}

function countOf(device: DeviceView, kind: CopyKind): number {
  return device.copies.filter((copy) => copy.kind === kind).length
}

// 겉 정보 (복구 코드 없이 보이는 것). copy.bytes 는 사본을 받아 온 크기가 있으면 그것
export function outerInfo(device: DeviceView, copy: CopyItem, now: number): InfoRow[] {
  const name = device.name ?? `이름 없음 — devices.json 에 "${device.id.slice(0, 8)}" 이름을 붙이면 보여요`
  const size = copy.bytes === undefined ? (copy.problem ?? '모름') : `${sizeText(copy.bytes)} · 1MB 한도의 ${limitShare(copy.bytes)}`
  return [
    { label: '기기', value: name },
    { label: '보관 자리 id', value: device.id },
    { label: '사본', value: copyLabel(copy) },
    { label: '있는 곳', value: whereOf(device.id, copy) },
    { label: copy.kind === 'week' ? '백업 레포에 넣은 때' : '서버가 받은 때', value: `${formatKst(copy.at)} (한국 시간)` },
    { label: '크기', value: size },
    { label: '남는 기간', value: lifeOf(copy, now) },
    {
      label: '이 기기 사본',
      value: `최신본 ${countOf(device, 'latest')} · 날짜별 ${countOf(device, 'day')} · 달별 ${countOf(device, 'month')} · 주간 ${countOf(device, 'week')}`,
    },
  ]
}

// 겉봉투 { v, savedAt, iv, data } — data 는 앞부분만
export function envelopePreview(envelope: KeepEnvelope): string {
  const { data } = envelope
  const shown = data.length > DATA_PREVIEW_CHARS ? `${data.slice(0, DATA_PREVIEW_CHARS)}…(모두 ${data.length}자)` : data
  return JSON.stringify({ ...envelope, data: shown }, null, 2)
}

// ---------- 페이지: 풀기 ----------

export type Unlocked = { ok: true; normalized: string } | { ok: false; message: string }

// 코드에서 id 를 계산해 이 기기의 코드인지 본다. 서버를 부르지 않는다.
// 다르면 그 코드의 id 앞 8자를 보여, 목록의 어느 기기 코드인지 알 수 있게 한다
export async function unlockDevice(code: string, deviceId: string): Promise<Unlocked> {
  const normalized = normalizeRecoveryCode(code)
  if (normalized === undefined) return { ok: false, message: INVALID_CODE }
  const id = await keepIdOf(normalized)
  if (id !== deviceId) return { ok: false, message: `${NOT_THIS_DEVICE} (이 코드의 id 는 ${id.slice(0, 8)}…)` }
  return { ok: true, normalized }
}

export type OpenedByCode = { ok: true; device: DeviceView; normalized: string } | { ok: false; message: string }

// 코드로 열기: 페이지가 id 를 계산하고, 목록에 없으면 로컬 서버에 그 id 의 사본 목록만 묻는다 (코드는 보내지 않는다)
export async function openByCode(
  code: string,
  devices: readonly DeviceView[],
  getLocal: (path: string) => Promise<HistoryAnswer>,
): Promise<OpenedByCode> {
  const normalized = normalizeRecoveryCode(code)
  if (normalized === undefined) return { ok: false, message: INVALID_CODE }
  const id = await keepIdOf(normalized)
  let device = devices.find((item) => item.id === id)
  if (device === undefined) {
    const answer = await getLocal(historyPath(id))
    if (!answer.ok) return answer
    device = answer.device
  }
  // 목록에 있든 없든 열 사본이 없으면 열었다고 하지 않는다
  if (device.copies.length === 0) return { ok: false, message: device.serverProblem ?? NOT_FOUND }
  return { ok: true, device, normalized }
}

// 처음 목록을 받는 동안 [코드로 열기]로 먼저 연 기기는, 받은 목록에 없으면 뒤에 남긴다 (받은 목록이 덮어 지우지 않게)
export function mergeDevices(loaded: readonly DeviceView[], opened: readonly DeviceView[]): DeviceView[] {
  const loadedIds = new Set(loaded.map(({ id }) => id))
  return [...loaded, ...opened.filter(({ id }) => !loadedIds.has(id))]
}

// 페이지가 받은 로컬 서버 답(상태·글자) → JSON 객체. 200 이 아니면 서버가 준 { ok: false, message } 만 그대로 쓰고,
// JSON 객체가 아니면(다른 프로그램이 답함 등) { ok: false, message } 로 바꾼다
export function localAnswer(status: number, text: string): Record<string, unknown> {
  const body = parseJson(text)
  if (isRecord(body) && (status === 200 || (body.ok === false && typeof body.message === 'string'))) return body
  return { ok: false, message: strangeLocalAnswer(status) }
}

// 풀린 저장 데이터 (풀린 글자를 JSON.parse 한 객체 그대로 — 옛 형식도 옮기지 않는다). 구조·표·비교는 있는 칸만 읽는다
export type StoredView = Record<string, unknown>

export type OpenedCopy =
  | { ok: true; schemaVersion?: number; bookNames: string[]; entryCount: number; data: StoredView }
  | { ok: false; message: string }

// 풀어서 저장 형식·장부 이름·기록 건수와 저장 데이터까지. 옛 형식도 옮기지(migrate) 않고 그대로 센다
export async function openCopy(normalized: string, envelope: KeepEnvelope): Promise<OpenedCopy> {
  const plainText = await openKeep(normalized, envelope)
  if (plainText === undefined) return { ok: false, message: WRONG_CODE }
  const summary = summarizeBackup(plainText)
  const data = parseJson(plainText)
  if (summary === undefined || !isRecord(data)) return { ok: false, message: NOT_BACKUP }
  const schemaVersion = typeof data.schemaVersion === 'number' ? data.schemaVersion : undefined
  return { ok: true, schemaVersion, ...summary, data }
}

// 저장 형식 번호. 옛 형식이면 그렇다고 적는다 (겉 정보의 풀린 내용·구조·표 머리)
export function schemaText(version: number | undefined): string {
  if (version === undefined) return '모름 (schemaVersion 없음)'
  if (version < CURRENT_SCHEMA_VERSION) return `v${version} (옛 형식 — 옮기지 않고 그대로 보여요)`
  return `v${version}`
}

// 풀린 내용 줄 (겉 정보 탭)
export function openedInfo(opened: OpenedCopy): InfoRow[] {
  if (!opened.ok) return [{ label: '풀기', value: opened.message }]
  return [
    { label: '저장 형식', value: schemaText(opened.schemaVersion) },
    { label: '장부', value: `${opened.bookNames.join(', ') || '(없음)'} — ${opened.bookNames.length}개` },
    { label: '기록', value: `${opened.entryCount}건` },
  ]
}

// ---------- 페이지: 풀린 저장 데이터 읽기 (구조·표·비교, SPEC-013 기본 흐름 6~8, #206) ----------
//
// 저장 데이터 모양은 앱의 src/domain/types.ts(StoredData v4: books·ledgers·entries·members·dues·settings·Payer)를 따르지만,
// 옛 형식(v3 이하)이나 칸이 빠진 사본도 멈추지 않게 칸마다 모양을 보고 있는 칸만 읽는다 (src 는 불러오지 않는다)

type RawRecord = Record<string, unknown>

function recordsOf(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function textOf(record: RawRecord, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function numberOf(record: RawRecord, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

// 세 자리마다 쉼표 (브라우저·Node 의 지역 설정과 상관없이 같게)
export function won(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// 시각은 한국 시간 (시각 모양이 아니면 적힌 그대로)
function timeText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return Number.isNaN(Date.parse(value)) ? value : formatKst(value)
}

// 줄바꿈·들여쓰기 없이 잰 JSON 크기 (UTF-8 바이트)
function jsonBytes(value: unknown): number {
  return byteLength(JSON.stringify(value))
}

interface YearPart {
  key: string // ledgers 의 키 ("2026")
  year: number
  raw: RawRecord
  entries: RawRecord[]
}

interface BookPart {
  id: string
  name: string
  raw: RawRecord
  years: YearPart[] // 해 순 (해 키는 정수 모양이라 객체 키 순서가 곧 오름차순)
  members?: RawRecord[] // members 칸이 없으면(옛 형식·가계부) 없음
  memberNames: Map<string, string> // Member.id → 이름
}

function yearsOf(book: RawRecord): YearPart[] {
  if (!isRecord(book.ledgers)) return []
  return Object.entries(book.ledgers).flatMap(([key, raw]) => (isRecord(raw) ? [{ key, year: Number(key), raw, entries: recordsOf(raw.entries) }] : []))
}

function booksOf(data: StoredView): BookPart[] {
  return recordsOf(data.books).map((raw, index) => {
    const members = Array.isArray(raw.members) ? recordsOf(raw.members) : undefined
    const memberNames = new Map(
      (members ?? []).flatMap((member): [string, string][] => {
        const id = textOf(member, 'id')
        return id === undefined ? [] : [[id, textOf(member, 'name') ?? id]]
      }),
    )
    return { id: textOf(raw, 'id') ?? `(id 없음 ${index + 1})`, name: textOf(raw, 'name') ?? '(이름 없음)', raw, years: yearsOf(raw), members, memberNames }
  })
}

function entryCountOf(book: BookPart): number {
  return book.years.reduce((sum, year) => sum + year.entries.length, 0)
}

// 그 해 수입·지출 합 (금액 칸이 숫자인 줄만)
function sumsOf(year: YearPart): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const entry of year.entries) {
    const amount = numberOf(entry, 'amount') ?? 0
    if (entry.type === 'income') income += amount
    else if (entry.type === 'expense') expense += amount
  }
  return { income, expense }
}

// 해별 남은 돈 = 이월금 + 수입 − 지출 (그 해 내역, SPEC-013 기술 메모 "비교 기준")
function balanceOf(year: YearPart): number {
  const { income, expense } = sumsOf(year)
  return (numberOf(year.raw, 'carryover') ?? 0) + income - expense
}

function payerName(book: BookPart, payer: RawRecord): string {
  const id = textOf(payer, 'memberId')
  return id === undefined ? '(회원 번호 없음)' : (book.memberNames.get(id) ?? id)
}

// ---------- 구조 ----------

// 구조 탭의 나무 마디 하나
export interface TreeNode {
  label: string // 칸 이름, 장부 이름, 해
  value?: string // 값 하나 (schemaVersion: 4)
  kind?: string // 모양({ }·[3]·{2}) 또는 장부 종류(club)
  note?: string // 요약 (해 2 · 내역 112, 내역 52 · 이월금 410,000 · 월 회비 20,000)
  bytes?: number // 그 마디의 JSON 크기
  masked?: boolean // 값을 가림 (복구 코드)
  children: TreeNode[]
}

// 나무에 값을 보이지 않는 설정 칸
const MASKED_SETTINGS: ReadonlySet<string> = new Set(['recoveryCode'])

function leaf(label: string, value: string): TreeNode {
  return { label, value, children: [] }
}

// 값 하나를 글자로. ~At 칸의 시각은 한국 시간
function valueText(key: string, value: unknown): string {
  if (typeof value === 'string') return key.endsWith('At') ? (timeText(value) ?? value) : value
  return JSON.stringify(value)
}

function ledgerNode(year: YearPart): TreeNode {
  const parts = [`내역 ${won(year.entries.length)}`]
  const carryover = numberOf(year.raw, 'carryover')
  const fee = numberOf(year.raw, 'monthlyFee')
  if (carryover !== undefined) parts.push(`이월금 ${won(carryover)}`)
  if (fee !== undefined) parts.push(`월 회비 ${won(fee)}`)
  return { label: year.key, note: parts.join(' · '), bytes: jsonBytes(year.raw), children: [] }
}

// 장부 하나: id·만든 때·ledgers{해}·members[]·dues (있는 칸만)
function bookNode(book: BookPart): TreeNode {
  const { raw } = book
  const children = [leaf('id', book.id)]
  const createdAt = textOf(raw, 'createdAt')
  if (createdAt !== undefined) children.push(leaf('createdAt', valueText('createdAt', createdAt)))
  if (isRecord(raw.ledgers)) {
    children.push({ label: 'ledgers', kind: `{${book.years.length}}`, bytes: jsonBytes(raw.ledgers), children: book.years.map(ledgerNode) })
  }
  if (book.members !== undefined) children.push({ label: 'members', kind: `[${book.members.length}]`, bytes: jsonBytes(raw.members), children: [] })
  if (isRecord(raw.dues)) {
    const note = Object.entries(raw.dues)
      .map(([key, value]) => `${key}: ${valueText(key, value)}`)
      .join(' · ')
    children.push({ label: 'dues', kind: '{ }', note, bytes: jsonBytes(raw.dues), children: [] })
  }
  return { label: book.name, kind: textOf(raw, 'kind'), note: `해 ${book.years.length} · 내역 ${won(entryCountOf(book))}`, bytes: jsonBytes(raw), children }
}

// 구조 나무: StoredData → schemaVersion · books[] → 장부마다 ledgers{해}·members[]·dues → settings (복구 코드는 가림)
export function storedTree(data: StoredView): TreeNode {
  const books = booksOf(data)
  const children: TreeNode[] = []
  if (data.schemaVersion !== undefined) children.push(leaf('schemaVersion', valueText('schemaVersion', data.schemaVersion)))
  children.push({ label: 'books', kind: `[${books.length}]`, bytes: jsonBytes(data.books), children: books.map(bookNode) })
  if (isRecord(data.settings)) {
    const settings = Object.entries(data.settings).map(([key, value]): TreeNode =>
      MASKED_SETTINGS.has(key) ? { label: key, masked: true, children: [] } : leaf(key, valueText(key, value)),
    )
    children.push({ label: 'settings', kind: '{ }', bytes: jsonBytes(data.settings), children: settings })
  }
  return { label: 'StoredData', kind: '{ }', bytes: jsonBytes(data), children }
}

export interface EntryField {
  field: string
  type: string
  required: boolean
  note?: string
  // 그 칸이 생긴 저장 형식. 이보다 옛 형식 사본에는 그 줄을 보이지 않는다
  since?: number
}

// 내역(Entry) 칸 — src/domain/types.ts Entry 와 같게 둔다 (scripts/keepView.test.ts 가 앱의 Entry 칸·필수/선택과 맞춰 본다)
export const ENTRY_FIELDS: readonly EntryField[] = [
  { field: 'id', type: 'string', required: true },
  { field: 'month', type: 'number 1~12', required: true },
  { field: 'day', type: 'number 1~31', required: false, note: 'v2.2 전 기록엔 없음' },
  { field: 'type', type: "'income' | 'expense'", required: true },
  { field: 'name', type: 'string', required: true },
  { field: 'amount', type: 'number', required: true },
  { field: 'createdAt', type: 'ISO 시각', required: true },
  { field: 'batchId', type: 'string', required: false, note: '사진으로 함께 넣은 묶음' },
  { field: 'payers', type: 'Payer[]', required: false, note: '낸 분, v4', since: 4 },
  { field: 'sourceText', type: 'string', required: false, note: '엑셀 글, v4', since: 4 },
]

export interface FieldFill {
  field: string
  type: string
  need: string // 필수 / 선택 (…)
  filled: number // 그 칸이 있는 줄 수
  share: string // 모든 내역 중 비율 (내역이 없으면 —)
}

export interface EntryFill {
  total: number
  fields: FieldFill[]
}

// 내역 칸 채움: 모든 장부·해의 내역에서 칸마다 몇 줄에 있는지 (옛 형식이면 그 형식에 없던 칸은 빼고)
export function entryFill(data: StoredView): EntryFill {
  const entries = booksOf(data).flatMap((book) => book.years.flatMap((year) => year.entries))
  const version = typeof data.schemaVersion === 'number' ? data.schemaVersion : undefined
  const fields = ENTRY_FIELDS.filter(({ since }) => version === undefined || since === undefined || since <= version).map(
    ({ field, type, required, note }): FieldFill => {
      const filled = entries.filter((entry) => Object.hasOwn(entry, field)).length
      return {
        field,
        type,
        need: required ? '필수' : note === undefined ? '선택' : `선택 (${note})`,
        filled,
        share: entries.length === 0 ? '—' : `${((filled / entries.length) * 100).toFixed(1)}%`,
      }
    },
  )
  return { total: entries.length, fields }
}

// ---------- 표 ----------

export type TableKey = 'books' | 'ledgers' | 'entries' | 'members' | 'payers'
export type CellValue = string | number | undefined
// text: 글자 그대로, number: 숫자 그대로(해·월·개수), won: 세 자리 쉼표(돈), long: 긴 글(줄 바꿈 허용)
export type CellFormat = 'text' | 'number' | 'won' | 'long'

export interface TableColumn {
  key: string
  label: string
  format: CellFormat
}

export interface TableRow {
  bookId: string // 장부로 거르기
  year?: number // 해로 거르기 (해 칸이 없는 표는 없음)
  cells: Record<string, CellValue>
  raw: unknown // 줄을 누르면 보일 원본 JSON
}

export interface ViewTable {
  key: TableKey
  label: string
  columns: readonly TableColumn[]
  rows: TableRow[]
}

function column(key: string, label: string, format: CellFormat = 'text'): TableColumn {
  return { key, label, format }
}

// 다섯 표와 칸 (SPEC-013 기본 흐름 7 표)
const TABLES: readonly { key: TableKey; label: string; columns: readonly TableColumn[] }[] = [
  {
    key: 'books',
    label: '장부',
    columns: [column('name', '이름'), column('kind', '종류'), column('years', '해 범위'), column('entries', '내역 수', 'number'), column('members', '회원 수', 'number'), column('createdAt', '만든 때')],
  },
  {
    key: 'ledgers',
    label: '해',
    columns: [
      column('book', '장부'),
      column('year', '해', 'number'),
      column('carryover', '이월금', 'won'),
      column('monthlyFee', '월 회비', 'won'),
      column('count', '내역 수', 'number'),
      column('income', '수입', 'won'),
      column('expense', '지출', 'won'),
      column('balance', '남은 돈', 'won'),
    ],
  },
  {
    key: 'entries',
    label: '내역',
    columns: [
      column('book', '장부'),
      column('year', '해', 'number'),
      column('month', '월', 'number'),
      column('day', '일', 'number'),
      column('type', '종류'),
      column('name', '이름'),
      column('amount', '금액', 'won'),
      column('payers', '낸 분'),
      column('sourceText', '엑셀 글', 'long'),
      column('createdAt', '적은 때'),
    ],
  },
  {
    key: 'members',
    label: '회원',
    columns: [column('book', '장부'), column('name', '이름'), column('joined', '들어온 달'), column('left', '그만둔 달'), column('off', '쉬는 달'), column('opening', '시작 남은 돈', 'won')],
  },
  {
    key: 'payers',
    label: '낸 분',
    columns: [column('book', '장부'), column('year', '해', 'number'), column('month', '월', 'number'), column('entry', '내역 이름'), column('member', '회원'), column('amount', '몫', 'won')],
  },
]

const BOOK_KINDS: Readonly<Record<string, string>> = { club: '동아리', household: '가계부' }
const ENTRY_TYPES: Readonly<Record<string, string>> = { income: '수입', expense: '지출' }

// 아는 값은 화면 말로, 모르는 값은 적힌 그대로
function wordOf(words: Readonly<Record<string, string>>, value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return Object.hasOwn(words, value) ? words[value] : value
}

function rangeText(keys: readonly string[]): string | undefined {
  if (keys.length === 0) return undefined
  return keys.length === 1 ? keys[0] : `${keys[0]}~${keys[keys.length - 1]}`
}

// 장부 줄의 원본: 안의 해·회원 목록은 줄여 보인다 (그 줄은 해·회원 표에서)
function shortBook(book: BookPart): RawRecord {
  const members = book.members === undefined ? {} : { members: `[… ${book.members.length}명]` }
  return { ...book.raw, ledgers: `{… ${book.years.length}개 해}`, ...members }
}

// 다섯 표 (장부 순 → 해 순 → 저장된 내역 순). 옛 형식은 있는 칸만 채우고, 회원·낸 분 칸이 없으면 그 표는 빈다
export function buildTables(data: StoredView): ViewTable[] {
  const rows: Record<TableKey, TableRow[]> = { books: [], ledgers: [], entries: [], members: [], payers: [] }
  for (const book of booksOf(data)) {
    const bookId = book.id
    rows.books.push({
      bookId,
      cells: {
        name: book.name,
        kind: wordOf(BOOK_KINDS, textOf(book.raw, 'kind')),
        years: rangeText(book.years.map(({ key }) => key)),
        entries: entryCountOf(book),
        members: book.members?.length,
        createdAt: timeText(textOf(book.raw, 'createdAt')),
      },
      raw: shortBook(book),
    })
    for (const part of book.years) {
      const { year } = part
      const { income, expense } = sumsOf(part)
      rows.ledgers.push({
        bookId,
        year,
        cells: {
          book: book.name,
          year,
          carryover: numberOf(part.raw, 'carryover'),
          monthlyFee: numberOf(part.raw, 'monthlyFee'),
          count: part.entries.length,
          income,
          expense,
          balance: balanceOf(part),
        },
        raw: { ...part.raw, entries: `[… ${part.entries.length}줄]` },
      })
      for (const entry of part.entries) {
        const payers = recordsOf(entry.payers)
        const month = numberOf(entry, 'month')
        const name = textOf(entry, 'name')
        rows.entries.push({
          bookId,
          year,
          cells: {
            book: book.name,
            year,
            month,
            day: numberOf(entry, 'day'),
            type: wordOf(ENTRY_TYPES, textOf(entry, 'type')),
            name,
            amount: numberOf(entry, 'amount'),
            payers: Array.isArray(entry.payers) ? payers.map((payer) => payerName(book, payer)).join(', ') : undefined,
            sourceText: textOf(entry, 'sourceText'),
            createdAt: timeText(textOf(entry, 'createdAt')),
          },
          raw: entry,
        })
        for (const payer of payers) {
          rows.payers.push({
            bookId,
            year,
            cells: { book: book.name, year, month, entry: name, member: payerName(book, payer), amount: numberOf(payer, 'amount') },
            raw: payer,
          })
        }
      }
    }
    for (const member of book.members ?? []) {
      const off = Array.isArray(member.off) && member.off.length > 0 ? member.off.map(String).join(', ') : undefined
      rows.members.push({
        bookId,
        cells: {
          book: book.name,
          name: textOf(member, 'name'),
          joined: textOf(member, 'joined'),
          left: textOf(member, 'left'),
          off,
          opening: numberOf(member, 'opening'),
        },
        raw: member,
      })
    }
  }
  return TABLES.map(({ key, label, columns }) => ({ key, label, columns, rows: rows[key] }))
}

// 장부·해 고르기 칸에 넣을 것
export function tableChoices(data: StoredView): { books: { id: string; name: string }[]; years: string[] } {
  const books = booksOf(data)
  const years = new Set(books.flatMap((book) => book.years.map(({ key }) => key)))
  return { books: books.map(({ id, name }) => ({ id, name })), years: [...years].sort() }
}

// 한 번에 그리는 줄 수 (SPEC-013 기본 흐름 7)
export const TABLE_LIMIT = 300

export interface TableSort {
  column: string
  descending: boolean
}

export interface TableQuery {
  book: string // 장부 id ('' = 모든 장부)
  year: string // 해 ('' = 모든 해, 해 칸이 없는 표는 거르지 않는다)
  search: string // 찾을 글 (앞뒤 빈칸은 빼고, 대소문자 없이)
  sort?: TableSort
}

export interface TableView {
  rows: TableRow[] // 앞 TABLE_LIMIT 줄
  matched: number
  total: number
  countText: string // "N / 모두 M줄"
}

// 칸에 보일 글자. 빈 칸은 undefined (페이지가 —)
export function cellText(column: TableColumn, value: CellValue): string | undefined {
  if (value === undefined || typeof value === 'string') return value
  return column.format === 'won' ? won(value) : String(value)
}

// 찾기: 칸마다 보이는 글자와 숫자 그대로(쉼표 없이) 둘 다에서
function rowMatches(table: ViewTable, row: TableRow, search: string): boolean {
  return table.columns.some((item) => {
    const value = row.cells[item.key]
    return value !== undefined && `${value}\n${cellText(item, value)}`.toLowerCase().includes(search)
  })
}

// 숫자는 크기 순, 글자는 글자 순(유니코드, 한글은 가나다 순)
function compareCells(left: string | number, right: string | number): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  const [a, b] = [String(left), String(right)]
  if (a === b) return 0
  return a < b ? -1 : 1
}

function sortRows(rows: TableRow[], sort: TableSort): TableRow[] {
  return rows.sort((first, second) => {
    const [a, b] = [first.cells[sort.column], second.cells[sort.column]]
    // 빈 칸은 오름·내림 어느 쪽이든 뒤에
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1
    return sort.descending ? compareCells(b, a) : compareCells(a, b)
  })
}

// 표 하나를 거르고(장부·해·찾기) 정렬해 앞 300줄과 줄 수 글자를 만든다. 정렬은 같은 값끼리 원래 순서를 지킨다
export function queryTable(table: ViewTable, query: TableQuery): TableView {
  const search = query.search.trim().toLowerCase()
  const matched = table.rows.filter(
    (row) =>
      (query.book === '' || row.bookId === query.book) &&
      (query.year === '' || row.year === undefined || String(row.year) === query.year) &&
      (search === '' || rowMatches(table, row, search)),
  )
  const { sort } = query
  const ordered = sort !== undefined && table.columns.some(({ key }) => key === sort.column) ? sortRows(matched, sort) : matched
  const more = ordered.length > TABLE_LIMIT ? ` · 앞 ${won(TABLE_LIMIT)}줄만` : ''
  return {
    rows: ordered.slice(0, TABLE_LIMIT),
    matched: ordered.length,
    total: table.rows.length,
    countText: `${won(ordered.length)} / 모두 ${won(table.rows.length)}줄${more}`,
  }
}

// ---------- 비교 ----------

// 한 번에 그리는 바뀐 줄 수 (SPEC-013 기본 흐름 8)
export const COMPARE_LIMIT = 120

// 바뀐 칸으로 보는 것 (SPEC-013 기술 메모 "비교 기준"). 적은 때·사진 묶음은 보지 않는다
const COMPARED_FIELDS: readonly { field: string; label: string }[] = [
  { field: 'month', label: '월' },
  { field: 'day', label: '일' },
  { field: 'type', label: '종류' },
  { field: 'name', label: '이름' },
  { field: 'amount', label: '금액' },
  { field: 'payers', label: '낸 분' },
  { field: 'sourceText', label: '엑셀 글' },
]

export type ChangeStatus = 'removed' | 'changed' | 'added'

export interface FieldChange {
  label: string
  before: string
  after: string
}

export interface EntryChange {
  status: ChangeStatus
  book: string // 장부 이름
  date: string // 해-월-일 (일이 없으면 해-월)
  type?: string
  name?: string
  amount?: number
  changes: FieldChange[] // 바뀐 줄의 바뀐 칸 (앞 → 뒤)
}

export interface MemberChange {
  book: string
  name: string
  joined?: string
}

export interface BalanceChange {
  book: string
  year: string
  before?: number // 앞 사본에 그 해가 없으면 없음
  after?: number
  diff?: number // 뒤 − 앞 (한쪽에 없으면 없음)
}

export interface Comparison {
  removed: number
  changed: number
  added: number
  total: number
  rows: EntryChange[] // 앞 COMPARE_LIMIT 줄: 빠짐 → 바뀜 → 더해짐, 그 안에서는 날짜가 늦은 것부터
  membersAdded: MemberChange[]
  membersRemoved: MemberChange[]
  balances: BalanceChange[] // 남은 돈이 달라진 해만
}

interface EntrySpot {
  book: BookPart
  year: YearPart
  entry: RawRecord
}

// 내역은 Entry.id 로 맞춘다 (id 가 없는 줄은 맞출 수 없어 뺀다)
function entriesById(data: StoredView): Map<string, EntrySpot> {
  const found = new Map<string, EntrySpot>()
  for (const book of booksOf(data)) {
    for (const year of book.years) {
      for (const entry of year.entries) {
        const id = textOf(entry, 'id')
        if (id !== undefined) found.set(id, { book, year, entry })
      }
    }
  }
  return found
}

function payersText(book: BookPart, payers: readonly RawRecord[]): string {
  if (payers.length === 0) return '(빈 목록)'
  return payers
    .map((payer) => {
      const amount = numberOf(payer, 'amount')
      return amount === undefined ? payerName(book, payer) : `${payerName(book, payer)} ${won(amount)}`
    })
    .join(', ')
}

// 바뀐 칸의 앞·뒤 글자. 낸 분은 그 사본의 회원 이름으로
function fieldText(field: string, spot: EntrySpot): string {
  const value = spot.entry[field]
  if (value === undefined) return '(없음)'
  if (field === 'amount' && typeof value === 'number') return won(value)
  if (field === 'type' && typeof value === 'string') return wordOf(ENTRY_TYPES, value) ?? value
  if (field === 'payers' && Array.isArray(value)) return payersText(spot.book, recordsOf(value))
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function fieldChanges(before: EntrySpot, after: EntrySpot): FieldChange[] {
  return COMPARED_FIELDS.flatMap(({ field, label }) =>
    JSON.stringify(before.entry[field]) === JSON.stringify(after.entry[field]) ? [] : [{ label, before: fieldText(field, before), after: fieldText(field, after) }],
  )
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function dateOf({ year, entry }: EntrySpot): string {
  const month = numberOf(entry, 'month')
  const day = numberOf(entry, 'day')
  if (month === undefined) return year.key
  return day === undefined ? `${year.key}-${twoDigits(month)}` : `${year.key}-${twoDigits(month)}-${twoDigits(day)}`
}

// 날짜 순서를 재는 값 (해·월·일, 없는 칸은 0)
function dayOrder({ year, entry }: EntrySpot): number {
  return year.year * 10_000 + (numberOf(entry, 'month') ?? 0) * 100 + (numberOf(entry, 'day') ?? 0)
}

const STATUS_ORDER: Readonly<Record<ChangeStatus, number>> = { removed: 0, changed: 1, added: 2 }

function changeRow(status: ChangeStatus, spot: EntrySpot, changes: FieldChange[]): EntryChange {
  const { entry } = spot
  return {
    status,
    book: spot.book.name,
    date: dateOf(spot),
    type: wordOf(ENTRY_TYPES, textOf(entry, 'type')),
    name: textOf(entry, 'name'),
    amount: numberOf(entry, 'amount'),
    changes,
  }
}

// 회원은 장부 id + Member.id 로 맞춘다
function membersByKey(data: StoredView): Map<string, MemberChange> {
  const found = new Map<string, MemberChange>()
  for (const book of booksOf(data)) {
    for (const member of book.members ?? []) {
      const id = textOf(member, 'id')
      if (id !== undefined) found.set(JSON.stringify([book.id, id]), { book: book.name, name: textOf(member, 'name') ?? id, joined: textOf(member, 'joined') })
    }
  }
  return found
}

function onlyIn(first: ReadonlyMap<string, MemberChange>, second: ReadonlyMap<string, MemberChange>): MemberChange[] {
  return [...first].flatMap(([key, member]) => (second.has(key) ? [] : [member]))
}

interface YearBalance {
  book: string
  year: string
  balance: number
}

// 해별 남은 돈 (장부 id + 해로 맞춘다)
function balancesOf(data: StoredView): Map<string, YearBalance> {
  const found = new Map<string, YearBalance>()
  for (const book of booksOf(data)) {
    for (const year of book.years) found.set(JSON.stringify([book.id, year.key]), { book: book.name, year: year.key, balance: balanceOf(year) })
  }
  return found
}

function balanceChanges(before: StoredView, after: StoredView): BalanceChange[] {
  const [first, second] = [balancesOf(before), balancesOf(after)]
  const keys = new Set([...first.keys(), ...second.keys()])
  return [...keys].flatMap((key): BalanceChange[] => {
    const [a, b] = [first.get(key), second.get(key)]
    const named = b ?? a
    if (named === undefined || a?.balance === b?.balance) return []
    const diff = a === undefined || b === undefined ? undefined : b.balance - a.balance
    return [{ book: named.book, year: named.year, before: a?.balance, after: b?.balance, diff }]
  })
}

// 같은 기기의 두 사본(앞·뒤) 비교: 내역은 Entry.id, 회원은 장부 id + Member.id 로 맞추고, 해별 남은 돈이 달라진 해를 모은다
export function compareCopies(before: StoredView, after: StoredView): Comparison {
  const [first, second] = [entriesById(before), entriesById(after)]
  const found: { status: ChangeStatus; spot: EntrySpot; changes: FieldChange[] }[] = []
  for (const [id, spot] of first) if (!second.has(id)) found.push({ status: 'removed', spot, changes: [] })
  for (const [id, spot] of second) {
    const old = first.get(id)
    if (old === undefined) found.push({ status: 'added', spot, changes: [] })
    else {
      const changes = fieldChanges(old, spot)
      if (changes.length > 0) found.push({ status: 'changed', spot, changes })
    }
  }
  found.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || dayOrder(b.spot) - dayOrder(a.spot))
  const count = (status: ChangeStatus) => found.filter((item) => item.status === status).length
  const [membersBefore, membersAfter] = [membersByKey(before), membersByKey(after)]
  return {
    removed: count('removed'),
    changed: count('changed'),
    added: count('added'),
    total: found.length,
    rows: found.slice(0, COMPARE_LIMIT).map(({ status, spot, changes }) => changeRow(status, spot, changes)),
    membersAdded: onlyIn(membersAfter, membersBefore),
    membersRemoved: onlyIn(membersBefore, membersAfter),
    balances: balanceChanges(before, after),
  }
}

// 바뀐 줄이 많아 잘랐을 때 한 줄
export function compareMoreText(comparison: Comparison): string | undefined {
  return comparison.total > comparison.rows.length ? `앞 ${won(COMPARE_LIMIT)}줄만 보여요 (모두 ${won(comparison.total)}줄)` : undefined
}

export interface CopyPair {
  before: number // 그 기기 사본 목록의 자리
  after: number
}

// 비교 탭의 처음 앞·뒤. 뒤는 고른 사본, 앞은 그보다 먼저 받은 사본 중 가장 가까운 것(받지 못한 사본은 빼고).
// 고른 사본이 가장 먼저 받은 것이면 고른 사본을 앞에, 그다음에 받은 사본을 뒤에. 같은 때 받은 사본은 같은 모습이라 고르지 않는다.
// 비교할 사본이 없으면 undefined (페이지는 목록의 첫 두 사본으로)
export function defaultPair(copies: readonly CopyItem[], picked: number): CopyPair | undefined {
  const chosen = copies.at(picked)
  const at = chosen === undefined ? Number.NaN : Date.parse(chosen.at)
  if (Number.isNaN(at)) return undefined
  const others = copies.flatMap((copy, index) => {
    const time = Date.parse(copy.at)
    return index === picked || copy.problem !== undefined || Number.isNaN(time) ? [] : [{ index, time }]
  })
  const closest = others.filter(({ time }) => time < at).sort((a, b) => b.time - a.time).at(0)
  if (closest !== undefined) return { before: closest.index, after: picked }
  const next = others.filter(({ time }) => time > at).sort((a, b) => a.time - b.time).at(0)
  return next === undefined ? undefined : { before: picked, after: next.index }
}
