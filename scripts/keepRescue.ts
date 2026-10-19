// 보관본 꺼내기 (#154) — 개발자가 사용자에게 받은 복구 코드로 서버 보관본을 읽어 기록 파일을 만든다
//
// 사용자가 앱에서 [복구 코드로 불러오기]를 못 할 때(카톡 안 브라우저, 앱 오류 등) 대신 꺼내 주는 도구.
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
export const NOT_BACKUP = '풀었지만 기록 파일 형식이 아니에요'

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

// 서버를 부르는 함수 (테스트에서 가짜로 바꿔 넣는다)
export type FetchFn = (url: string, init: { method: 'GET'; headers: Record<string, string> }) => Promise<Response>

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

// 파일 이름 날짜는 보관한 날(한국 시간): 언제 기준의 기록인지 이름만 보고 알 수 있게. 앱이 만드는 이름과 같은 모양
export function rescueFileName(savedAt: string): string {
  return `우리장부-기록-${formatKst(savedAt).slice(0, 10)}.txt`
}

// 기록 파일을 둘 폴더. 파일에는 장부 전체와 복구 코드가 들어 있어 레포(공개) 안에 만들지 않는다:
// RESCUE_DIR 이 있으면 그곳, 없으면 ~/Downloads, 그것도 없으면 홈. 지금 폴더(레포 루트일 수 있음)는 기본값으로 쓰지 않는다
export function rescueDir(env: { RESCUE_DIR?: string }, home: string, hasDownloads: boolean): string {
  if (env.RESCUE_DIR) return env.RESCUE_DIR
  return hasDownloads ? `${home.replace(/\/+$/, '')}/Downloads` : home
}

// 복구 코드로 보관본을 GET 해서 풀고 요약까지 만든다
export async function rescueKeep(code: string, keepUrl: string, fetchFn: FetchFn): Promise<RescueResult> {
  const normalized = normalizeRecoveryCode(code)
  if (normalized === undefined) return { ok: false, message: INVALID_CODE }

  const url = `${keepUrl.replace(/\/+$/, '')}/v1/keep/${await keepIdOf(normalized)}`
  let response: Response
  try {
    response = await fetchFn(url, { method: 'GET', headers: { Origin: APP_ORIGIN } })
  } catch {
    return { ok: false, message: SERVER_DOWN }
  }
  if (response.status === 404) return { ok: false, message: NOT_FOUND }
  if (!response.ok) return { ok: false, message: `보관 서버가 오류로 답했어요 (HTTP ${response.status}). 잠시 뒤 다시 해 보세요` }

  const envelope = toEnvelope(await response.json().catch(() => undefined))
  if (envelope === undefined) return { ok: false, message: BROKEN_ENVELOPE }
  const plain = await openKeep(normalized, envelope)
  if (plain === undefined) return { ok: false, message: WRONG_CODE }
  const summary = summarizeBackup(plain)
  if (summary === undefined) return { ok: false, message: NOT_BACKUP }
  return { ok: true, savedAt: envelope.savedAt, plain, summary }
}

// 성공했을 때 찍을 요약 줄 (복구 코드는 넣지 않는다)
export function describeRescue(result: { savedAt: string; summary: RescueSummary }, filePath: string): string[] {
  return [
    `보관 시각: ${formatKst(result.savedAt)} (한국 시간)`,
    `장부: ${result.summary.bookNames.join(', ') || '(없음)'} — ${result.summary.bookNames.length}개`,
    `기록: ${result.summary.entryCount}건`,
    `저장한 파일: ${filePath}`,
    '이 파일을 카톡으로 보내고, 앱 설정의 [기록 파일 불러오기]로 열게 하세요',
    '다 보냈으면 이 파일을 지우세요 (복구 코드가 들어 있어요)',
  ]
}
