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
  return `백업 레포를 먼저 받아 오세요 (git pull) — 클론의 마지막 커밋이 ${days}일 전이에요`
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

// --port 만 받는다. 0 이면 빈 포트를 고른다(시험용)
export function parseViewArgs(args: readonly string[]): ViewArgs {
  let port = DEFAULT_PORT
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg !== '--port') return { ok: false, message: `모르는 인자예요: ${arg}\n${VIEW_USAGE}` }
    const value = args[++index] ?? ''
    if (!/^\d{1,5}$/.test(value) || Number(value) > 65_535) {
      return { ok: false, message: `--port 뒤에는 포트 번호(0~65535)를 적어요: "${value}"\n${VIEW_USAGE}` }
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

// devices.json { "aaa97843": "엄마 폰" } (SPEC-012 1절) → id 앞 8자별 이름. 모양이 틀리면 undefined
export function parseDeviceNames(text: string): Map<string, string> | undefined {
  const raw = parseJson(text)
  if (!isRecord(raw)) return undefined
  const names = new Map<string, string>()
  for (const [key, name] of Object.entries(raw)) {
    if (!NAME_KEY.test(key) || typeof name !== 'string') return undefined
    names.set(key, name)
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
  indexText?: string
  namesText?: string
}

// 클론의 마지막 커밋 시각과 index.json·devices.json (커밋된 것). 클론이 없으면 undefined. pull 하지 않는다
async function readClone(git: GitFn): Promise<CloneFiles | undefined> {
  const last = (await git(['log', '-1', '--format=%cI']))?.trim() ?? ''
  if (Number.isNaN(Date.parse(last))) return undefined
  const [indexText, namesText] = await Promise.all([git(['show', 'HEAD:index.json']), git(['show', 'HEAD:devices.json'])])
  return { lastCommitAt: last, indexText, namesText }
}

// /api/devices: 기기 목록은 백업 레포 index.json 에서, 사본은 서버 목록과 커밋 이력에서.
// 못 쓰는 출처는 빼고 위에 안내 한 줄씩 (서버 문제는 같은 문구를 한 번만)
export async function listDevices(sources: ViewSources, now: number): Promise<DevicesAnswer> {
  const notices: string[] = []
  if (sources.keepUrl === '') notices.push(NO_KEEP_URL)
  const clone = await readClone(sources.git)
  if (clone === undefined) {
    notices.push(noCloneNotice(sources.backupDir))
    return { notices, devices: [] }
  }
  const age = now - Date.parse(clone.lastCommitAt)
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

// 로컬 서버 요청 하나. Host 검사 → GET 만 → 페이지·모듈 → API. id·날·달·커밋은 형식을 본 뒤에만 git·서버에 쓴다
export async function handleRequest(request: ViewRequest, server: ViewServer, now: number): Promise<ViewResponse> {
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
  const listed = devices.find((device) => device.id === id)
  if (listed !== undefined) return { ok: true, device: listed, normalized }
  const answer = await getLocal(historyPath(id))
  if (!answer.ok) return answer
  if (answer.device.copies.length === 0) return { ok: false, message: answer.device.serverProblem ?? NOT_FOUND }
  return { ok: true, device: answer.device, normalized }
}

export type OpenedCopy =
  | { ok: true; schemaVersion?: number; bookNames: string[]; entryCount: number }
  | { ok: false; message: string }

// 풀어서 저장 형식·장부 이름·기록 건수까지. 옛 형식도 옮기지(migrate) 않고 그대로 센다
export async function openCopy(normalized: string, envelope: KeepEnvelope): Promise<OpenedCopy> {
  const plainText = await openKeep(normalized, envelope)
  if (plainText === undefined) return { ok: false, message: WRONG_CODE }
  const summary = summarizeBackup(plainText)
  if (summary === undefined) return { ok: false, message: NOT_BACKUP }
  const raw = parseJson(plainText)
  const schemaVersion = isRecord(raw) && typeof raw.schemaVersion === 'number' ? raw.schemaVersion : undefined
  return { ok: true, schemaVersion, ...summary }
}

function versionText(version: number | undefined): string {
  if (version === undefined) return '모름 (schemaVersion 없음)'
  if (version < CURRENT_SCHEMA_VERSION) return `v${version} (옛 형식 — 옮기지 않고 그대로 보여요)`
  return `v${version}`
}

// 풀린 내용 줄 (구조·표·비교 탭은 SPEC-013 #206)
export function openedInfo(opened: OpenedCopy): InfoRow[] {
  if (!opened.ok) return [{ label: '풀기', value: opened.message }]
  return [
    { label: '저장 형식', value: versionText(opened.schemaVersion) },
    { label: '장부', value: `${opened.bookNames.join(', ') || '(없음)'} — ${opened.bookNames.length}개` },
    { label: '기록', value: `${opened.entryCount}건` },
  ]
}
