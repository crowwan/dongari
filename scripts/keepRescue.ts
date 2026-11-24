// 보관본 꺼내기 (#154) — 개발자가 사용자에게 받은 복구 코드로 서버 보관본을 읽어 기록 파일을 만든다
//
// 사용자가 앱에서 [복구 코드로 불러오기]를 못 할 때(카톡 안 브라우저, 앱 오류 등) 대신 꺼내 주는 도구.
// SPEC-011(#185): 최신본 말고 서버의 날짜별·달별 사본도 목록(--list)으로 보고 골라(--day·--month) 꺼낸다.
// 서버에는 GET 만 보낸다(쓰기·지우기 없음). 복구 코드는 결과·문구 어디에도 담지 않는다.
//
// scripts/keep-rescue.mjs 가 이 파일을 그대로 불러 쓴다(Node 24 가 타입만 지우고 실행, 빌드 없음).
// 그래서 타입 지우기로 없어지는 문법만 쓰고(erasableSyntaxOnly), 다른 패키지·src 를 불러오지 않는다.
// 암호 방식·코드 정규화는 src/features/keep/keepCrypto.ts·recoveryCode.ts 를 옮긴 것이다.
// 어긋나면 scripts/keepRescue.test.ts(앱의 sealKeep·keepIdOf 로 만든 값을 여기서 푸는 테스트)가 깨진다.

// 앱 본 주소. 서버는 이 출처의 요청만 받고, 미리보기 출처는 다른 자리(preview:)를 보므로 본 주소로 고정한다
export const APP_ORIGIN = 'https://crowwan.github.io'

export const INVALID_CODE = '복구 코드 형식이 아니에요 (헷갈리는 글자 0·O·1·I·L 을 뺀 영문·숫자 16자)'
export const NOT_FOUND = '이 코드로 보관된 기록이 서버에 없어요 (404). 코드를 다시 확인하거나, 자동 보관이 켜져 있었는지 물어보세요'
export const WRONG_CODE = '보관본은 있지만 이 코드로 풀리지 않아요. 코드가 맞는지 확인하세요'
export const SERVER_DOWN = '보관 서버에 닿지 못했어요 (연결 실패). 인터넷과 KEEP_URL 을 확인하세요'
export const BROKEN_ENVELOPE = '서버 답이 보관본 모양이 아니에요'
export const BROKEN_HISTORY = '서버 답이 사본 목록 모양이 아니에요'
export const NOT_BACKUP = '풀었지만 기록 파일 형식이 아니에요'
export const RESCUE_USAGE = '쓰는 법: node scripts/keep-rescue.mjs [--list | --day YYYY-MM-DD | --month YYYY-MM] [복구 코드]'

// 앱과 같은 코드 글자 (recoveryCode.ts RECOVERY_CODE_ALPHABET)
const RECOVERY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LENGTH = 16
const GROUP_LENGTH = 4

// 앱과 같은 소금·용도 이름 (keepCrypto.ts)
const SALT = new TextEncoder().encode('dongari-keep-v1')
const ID_INFO = new TextEncoder().encode('keep-id')
const KEY_INFO = new TextEncoder().encode('keep-key')

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export interface KeepEnvelope {
  v: 1
  savedAt: string
  iv: string
  data: string
}

export interface RescueSummary {
  bookNames: string[]
  entryCount: number
}

// 꺼내기 결과. 실패마다 문구가 다르다
export type RescueResult =
  | { ok: true; savedAt: string; plain: string; summary: RescueSummary }
  | { ok: false; message: string }

// 꺼낼 사본: 최신본 / 날짜별 사본(한국 시간 날, 31일 남음) / 달별 사본(400일 남음) — SPEC-011 1절
export type RescueTarget = { kind: 'latest' } | { kind: 'day'; date: string } | { kind: 'month'; month: string }

const LATEST: RescueTarget = { kind: 'latest' }

// 명령줄로 고른 일. code 는 인자로 준 복구 코드(없으면 표준 입력으로 묻는다)
export type RescueCommand = { action: 'list'; code?: string } | { action: 'rescue'; target: RescueTarget; code?: string }

export type ParsedArgs = { ok: true; command: RescueCommand } | { ok: false; message: string }

// --list 의 한 줄: 어떤 사본인지, 서버가 적어 둔 보관 시각, 풀어 본 요약(못 풀면 이유)
export interface CopyRow {
  target: RescueTarget
  savedAt: string
  opened: { ok: true; summary: RescueSummary } | { ok: false; message: string }
}

export type ListResult = { ok: true; rows: CopyRow[] } | { ok: false; message: string }

// 서버를 부르는 함수 (테스트에서 가짜로 바꿔 넣는다)
export type FetchFn = (url: string, init: { method: 'GET'; headers: Record<string, string> }) => Promise<Response>

const DAY_ARG = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const MONTH_ARG = /^\d{4}-(0[1-9]|1[0-2])$/

function usageError(problem: string): ParsedArgs {
  return { ok: false, message: `${problem}\n${RESCUE_USAGE}` }
}

// 옵션 없음 = 최신본, --list = 사본 목록, --day YYYY-MM-DD / --month YYYY-MM = 그 사본. 옵션이 아닌 인자 하나는 복구 코드
export function parseRescueArgs(args: readonly string[]): ParsedArgs {
  const picks: RescueCommand[] = []
  const codes: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--list') {
      picks.push({ action: 'list' })
    } else if (arg === '--day' || arg === '--month') {
      const value = args[++index] ?? ''
      if (arg === '--day' && !DAY_ARG.test(value)) return usageError(`--day 뒤에는 날짜(YYYY-MM-DD)를 적어요: "${value}"`)
      if (arg === '--month' && !MONTH_ARG.test(value)) return usageError(`--month 뒤에는 달(YYYY-MM)을 적어요: "${value}"`)
      const target: RescueTarget = arg === '--day' ? { kind: 'day', date: value } : { kind: 'month', month: value }
      picks.push({ action: 'rescue', target })
    } else if (arg.startsWith('-')) {
      return usageError(`모르는 옵션이에요: ${arg}`)
    } else {
      codes.push(arg)
    }
  }
  if (picks.length > 1) return usageError('--list·--day·--month 는 하나만 써요')
  if (codes.length > 1) return usageError('복구 코드 말고 다른 인자가 있어요 (코드는 띄어 쓰지 말고 한 덩어리로, 또는 인자 없이 물을 때 넣어요)')
  const command = picks[0] ?? { action: 'rescue', target: LATEST }
  return { ok: true, command: { ...command, code: codes[0] } }
}

// 띄어쓰기·소문자·줄표는 무시하고 4자씩 줄표로. 16자가 아니거나 쓰지 않는 글자가 있으면 undefined (recoveryCode.ts 와 같다)
export function normalizeRecoveryCode(input: string): string | undefined {
  const chars = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (chars.length !== CODE_LENGTH) return undefined
  if ([...chars].some((char) => !RECOVERY_CODE_ALPHABET.includes(char))) return undefined
  return (chars.match(new RegExp(`.{1,${GROUP_LENGTH}}`, 'g')) ?? []).join('-')
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// 정규화한 코드 → HKDF 원재료
// 반환 타입은 적지 않는다: 이 파일은 Node 타입(tsconfig.node)과 브라우저 타입(테스트) 양쪽에서 검사된다
function codeMaterial(normalized: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(normalized), 'HKDF', false, ['deriveBits', 'deriveKey'])
}

function hkdf(info: Uint8Array<ArrayBuffer>) {
  return { name: 'HKDF', hash: 'SHA-256', salt: SALT, info }
}

// 서버 주소에 쓰는 이름 (keepCrypto.ts keepIdOf 와 같은 값)
export async function keepIdOf(normalized: string): Promise<string> {
  return toHex(await crypto.subtle.deriveBits(hkdf(ID_INFO), await codeMaterial(normalized), 256))
}

// 보관본을 푼다. 코드가 틀렸거나 본문이 망가졌으면 undefined (keepCrypto.ts openKeep 과 같다)
export async function openKeep(normalized: string, envelope: KeepEnvelope): Promise<string | undefined> {
  try {
    const key = await crypto.subtle.deriveKey(hkdf(KEY_INFO), await codeMaterial(normalized), { name: 'AES-GCM', length: 256 }, false, [
      'decrypt',
    ])
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.data))
    return new TextDecoder().decode(plain)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toEnvelope(value: unknown): KeepEnvelope | undefined {
  if (!isRecord(value) || value.v !== 1) return undefined
  const { savedAt, iv, data } = value
  if (typeof savedAt !== 'string' || typeof iv !== 'string' || typeof data !== 'string') return undefined
  return { v: 1, savedAt, iv, data }
}

function entryCountOf(book: Record<string, unknown>): number {
  if (!isRecord(book.ledgers)) return 0
  return Object.values(book.ledgers).reduce<number>(
    (sum, ledger) => sum + (isRecord(ledger) && Array.isArray(ledger.entries) ? ledger.entries.length : 0),
    0,
  )
}

// 출력할 요약(장부 이름들·기록 건수). 꼼꼼한 검증은 앱의 [기록 파일 불러오기](readBackup)가 한다
export function summarizeBackup(plain: string): RescueSummary | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(plain)
  } catch {
    return undefined
  }
  if (!isRecord(raw) || !Array.isArray(raw.books)) return undefined
  const books = raw.books.filter(isRecord)
  return {
    bookNames: books.map((book) => (typeof book.name === 'string' ? book.name : '(이름 없음)')),
    entryCount: books.reduce((sum, book) => sum + entryCountOf(book), 0),
  }
}

// 한국 시간 `2026-10-12 09:30`
export function formatKst(iso: string): string {
  return new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')
}

// 파일 이름 날짜: 언제 기준의 기록인지 이름만 보고 알 수 있게. 앱이 만드는 이름과 같은 모양
// 최신본은 보관한 날(한국 시간), 날짜별·달별 사본은 고른 그 날·달 (`우리장부-기록-2026-11-21.txt`·`우리장부-기록-2026-10.txt`)
export function rescueFileName(savedAt: string, target: RescueTarget = LATEST): string {
  return `우리장부-기록-${stampOf(target) ?? formatKst(savedAt).slice(0, 10)}.txt`
}

// 날짜별·달별 사본의 날·달 (최신본은 undefined)
function stampOf(target: RescueTarget): string | undefined {
  if (target.kind === 'day') return target.date
  if (target.kind === 'month') return target.month
  return undefined
}

function targetName(target: RescueTarget): string {
  if (target.kind === 'day') return `${target.date} 날짜별 사본`
  if (target.kind === 'month') return `${target.month} 달별 사본`
  return '최신본'
}

// 기록 파일을 둘 폴더. 파일에는 장부 전체와 복구 코드가 들어 있어 레포(공개) 안에 만들지 않는다:
// RESCUE_DIR 이 있으면 그곳, 없으면 ~/Downloads, 그것도 없으면 홈. 지금 폴더(레포 루트일 수 있음)는 기본값으로 쓰지 않는다
export function rescueDir(env: { RESCUE_DIR?: string }, home: string, hasDownloads: boolean): string {
  if (env.RESCUE_DIR) return env.RESCUE_DIR
  return hasDownloads ? `${home.replace(/\/+$/, '')}/Downloads` : home
}

// 서버 목록 경로가 없는(이 기능 전) 서버
export const NO_HISTORY_ROUTE = '보관 서버가 사본 목록을 모르는 예전 버전이에요 (404). 보관 서버 배포를 확인하세요'

// 복구 코드에서 만든 서버 주소 /v1/keep/<이름> (코드가 아니라 코드에서 만든 이름을 쓴다)
async function keepBaseOf(normalized: string, keepUrl: string): Promise<string> {
  return `${keepUrl.replace(/\/+$/, '')}/v1/keep/${await keepIdOf(normalized)}`
}

function copyUrl(base: string, target: RescueTarget): string {
  if (target.kind === 'day') return `${base}?day=${target.date}`
  if (target.kind === 'month') return `${base}?month=${target.month}`
  return base
}

function copyNotFound(target: RescueTarget): string {
  if (target.kind === 'latest') return NOT_FOUND
  return `${targetName(target)}이 서버에 없어요 (404). --list 로 있는 날·달을 보세요`
}

type Fetched = { ok: true; body: unknown } | { ok: false; message: string }

// 본 주소 출처로 GET 하나. 닿지 못함 / 404 / 그 밖 오류를 나누고, 되면 JSON 본문(아니면 undefined)
async function getJson(url: string, fetchFn: FetchFn, notFound: string): Promise<Fetched> {
  let response: Response
  try {
    response = await fetchFn(url, { method: 'GET', headers: { Origin: APP_ORIGIN } })
  } catch {
    return { ok: false, message: SERVER_DOWN }
  }
  if (response.status === 404) return { ok: false, message: notFound }
  if (!response.ok) return { ok: false, message: `보관 서버가 오류로 답했어요 (HTTP ${response.status}). 잠시 뒤 다시 해 보세요` }
  return { ok: true, body: await response.json().catch(() => undefined) }
}

// 사본 하나를 받아 풀고 요약까지
async function openCopy(normalized: string, base: string, target: RescueTarget, fetchFn: FetchFn): Promise<RescueResult> {
  const fetched = await getJson(copyUrl(base, target), fetchFn, copyNotFound(target))
  if (!fetched.ok) return fetched
  const envelope = toEnvelope(fetched.body)
  if (envelope === undefined) return { ok: false, message: BROKEN_ENVELOPE }
  const plain = await openKeep(normalized, envelope)
  if (plain === undefined) return { ok: false, message: WRONG_CODE }
  const summary = summarizeBackup(plain)
  if (summary === undefined) return { ok: false, message: NOT_BACKUP }
  return { ok: true, savedAt: envelope.savedAt, plain, summary }
}

// 복구 코드로 보관본(기본은 최신본, --day·--month 면 그 사본)을 GET 해서 풀고 요약까지 만든다
export async function rescueKeep(code: string, keepUrl: string, fetchFn: FetchFn, target: RescueTarget = LATEST): Promise<RescueResult> {
  const normalized = normalizeRecoveryCode(code)
  if (normalized === undefined) return { ok: false, message: INVALID_CODE }
  return openCopy(normalized, await keepBaseOf(normalized, keepUrl), target, fetchFn)
}

function isTimeText(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

interface CopyStamp {
  target: RescueTarget
  savedAt: string
}

// 서버 목록 답 { latest?: { savedAt }, days: [{ date, savedAt }], months: [{ month, savedAt }] } → 꺼낼 사본들 (서버가 준 순서, 최신 것부터)
function toCopyStamps(value: unknown): CopyStamp[] | undefined {
  if (!isRecord(value)) return undefined
  const { latest, days, months } = value
  if (!Array.isArray(days) || !Array.isArray(months)) return undefined
  const stamps: CopyStamp[] = []
  if (latest !== undefined) {
    if (!isRecord(latest) || !isTimeText(latest.savedAt)) return undefined
    stamps.push({ target: LATEST, savedAt: latest.savedAt })
  }
  for (const day of days) {
    if (!isRecord(day) || typeof day.date !== 'string' || !isTimeText(day.savedAt)) return undefined
    stamps.push({ target: { kind: 'day', date: day.date }, savedAt: day.savedAt })
  }
  for (const month of months) {
    if (!isRecord(month) || typeof month.month !== 'string' || !isTimeText(month.savedAt)) return undefined
    stamps.push({ target: { kind: 'month', month: month.month }, savedAt: month.savedAt })
  }
  return stamps
}

// --list: 서버의 사본 목록을 받고, 사본마다 받아 풀어 장부 이름·기록 건수를 센다 (못 푼 사본은 그 줄에 이유)
export async function listKeep(code: string, keepUrl: string, fetchFn: FetchFn): Promise<ListResult> {
  const normalized = normalizeRecoveryCode(code)
  if (normalized === undefined) return { ok: false, message: INVALID_CODE }
  const base = await keepBaseOf(normalized, keepUrl)

  const fetched = await getJson(`${base}/history`, fetchFn, NO_HISTORY_ROUTE)
  if (!fetched.ok) return fetched
  const stamps = toCopyStamps(fetched.body)
  if (stamps === undefined) return { ok: false, message: BROKEN_HISTORY }
  if (stamps.length === 0) return { ok: false, message: NOT_FOUND }

  const rows = await Promise.all(
    stamps.map(async ({ target, savedAt }): Promise<CopyRow> => {
      const opened = await openCopy(normalized, base, target, fetchFn)
      return { target, savedAt, opened: opened.ok ? { ok: true, summary: opened.summary } : opened }
    }),
  )
  return { ok: true, rows }
}

// 목록 한 줄의 뒷부분: 보관 시각(한국 시간) · 장부 이름 · 기록 건수
function rowText(row: CopyRow): string {
  const { opened } = row
  const what = opened.ok
    ? `${opened.summary.bookNames.join(', ') || '(장부 없음)'} · 기록 ${opened.summary.entryCount}건`
    : `풀지 못했어요 (${opened.message})`
  return `${formatKst(row.savedAt)} 보관 · ${what}`
}

// --list 로 찍을 줄 (복구 코드는 넣지 않는다)
export function describeList(rows: readonly CopyRow[]): string[] {
  const latest = rows.find((row) => row.target.kind === 'latest')
  const section = (kind: 'day' | 'month') => {
    const items = rows.filter((row) => row.target.kind === kind)
    return items.length === 0 ? ['  (없어요)'] : items.map((row) => `  ${stampOf(row.target) ?? ''}: ${rowText(row)}`)
  }
  return [
    '서버에 있는 사본 (시각은 한국 시간)',
    `최신본: ${latest === undefined ? '없어요' : rowText(latest)}`,
    '날짜별 사본 — 만든 날부터 31일 남아요. 꺼내기: --day YYYY-MM-DD',
    ...section('day'),
    '달별 사본 — 만든 날부터 400일 남아요. 꺼내기: --month YYYY-MM',
    ...section('month'),
    '최신본은 옵션 없이 꺼내요',
  ]
}

// 성공했을 때 찍을 요약 줄 (복구 코드는 넣지 않는다)
export function describeRescue(
  result: { savedAt: string; summary: RescueSummary },
  filePath: string,
  target: RescueTarget = LATEST,
): string[] {
  return [
    `꺼낸 사본: ${targetName(target)}`,
    `보관 시각: ${formatKst(result.savedAt)} (한국 시간)`,
    `장부: ${result.summary.bookNames.join(', ') || '(없음)'} — ${result.summary.bookNames.length}개`,
    `기록: ${result.summary.entryCount}건`,
    `저장한 파일: ${filePath}`,
    '이 파일을 카톡으로 보내고, 앱 설정의 [기록 파일 불러오기]로 열게 하세요',
    '다 보냈으면 이 파일을 지우세요 (복구 코드가 들어 있어요)',
  ]
}
