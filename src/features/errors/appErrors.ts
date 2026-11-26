// 앱 오류 기록 규칙 (SPEC-012 2절, ADR 011): 오류를 서버에 평문으로 남겨도 되는 모양으로 정리하고, 같은 오류를 묶어 둔다.
// 입출력 없는 순수 함수만 둔다. 기록·폰 저장은 AppErrorRecorder, 보내기는 AutoKeeper·keepServer.
// 장부 내용·복구 코드·주소(URL)·기기 정보(user agent)는 넣지 않는다: 글은 숫자·한글 같은 글자 덩어리를 지우고, 위치는 파일 이름만
import { isRecord } from '../../storage/schema'

export type AppErrorKind = 'render' | 'uncaught' | 'rejection' | 'save'

// 오류 한 줄 (서버 칸과 같은 이름·길이, worker/src/keep.ts toAppError). 때는 폰 시각
export interface AppError {
  kind: AppErrorKind
  name: string
  message: string
  screen: string
  where?: string
  count: number
  firstAt: string
  lastAt: string
}

// 묶기 전 오류 하나. 종류·이름·글·화면이 같으면 같은 오류다 (위치는 묶는 기준이 아니다)
export type SeenError = Pick<AppError, 'kind' | 'name' | 'message' | 'screen' | 'where'>

// 오류 값에서 읽은 것 (정리 전). 파일 이름·줄·칸은 window 의 error 이벤트만 준다
export interface RawError {
  name: string
  message: string
  stack?: string
  filename?: string
  line?: number
  column?: number
}

const DAY_MS = 24 * 60 * 60 * 1000
// 최근 7일만, 최대 5줄 둔다 (넘으면 마지막 때가 오래된 줄부터 버린다)
export const ERROR_KEEP_MS = 7 * DAY_MS
export const MAX_ERRORS = 5
export const UNKNOWN_SCREEN = 'unknown'

// 서버 칸 상한 (JS 글자 수): 이름 1~40, 글 0~120, 화면 1~32, 위치 0~80
const NAME_MAX = 40
const MESSAGE_MAX = 120
const SCREEN_MAX = 32
const WHERE_MAX = 80
const FILE_NAME_MAX = 60

const KINDS: readonly AppErrorKind[] = ['render', 'uncaught', 'rejection', 'save']
const ERROR_KEYS = new Set(['kind', 'name', 'message', 'screen', 'where', 'count', 'firstAt', 'lastAt'])
// 사용자가 취소한 것 (공유 창 닫기 등). 앱이 잡지 못했어도 오류가 아니다
const USER_CANCEL_NAMES = new Set(['AbortError'])
// 다른 출처 스크립트의 오류는 브라우저가 내용을 가려 이 글만 준다
const CROSS_ORIGIN_MESSAGE = 'Script error.'
const ELLIPSIS = '…'

const SPACES = /\s+/gu
// 주소(https://… , chrome-extension://…): 파일 이름만 남긴다
const URL_TEXT = /\b[a-z][a-z\d+.-]*:\/\/[^\s'"()<>]+/giu
// 복구 코드 모양 (4자 × 4 묶음, SPEC-006)
const CODE_TEXT = /\b[a-z\d]{4}(?:-[a-z\d]{4}){3}\b/giu
// 영문·숫자·기호(ASCII 보이는 글자)가 아닌 글자 덩어리. 그 사이 빈칸도 한 덩어리로 (낱말 수가 드러나지 않게)
const OUTSIDE_RUN = /[^\x20-\x7e]+(?: [^\x20-\x7e]+)*/gu
const DIGIT_RUN = /\d+/gu
// 스택·파일 이름 속 위치: 주소:줄:칸 (크롬 "at f (주소:1:2)", 사파리·파이어폭스 "f@주소:1:2")
const FRAME = /([a-z][a-z\d+.-]*:\/\/[^\s()'"]+?):(\d+):(\d+)/giu
const FILE_NAME = /^[\w.-]+$/u
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}${ELLIPSIS}` : text
}

// 주소의 마지막 경로 조각 (쿼리·해시 없이). 파일 이름 모양이 아니면 undefined
function fileNameOf(url: string): string | undefined {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return undefined
  }
  const name = pathname.split('/').at(-1) ?? ''
  return FILE_NAME.test(name) ? name.slice(0, FILE_NAME_MAX) : undefined
}

// 보내도 되는 글로 정리한다 (AC-7): 주소는 파일 이름만, 복구 코드 모양과 영문·숫자·기호 밖 글자 덩어리는 …,
// 숫자 덩어리는 #, 빈칸은 하나로, max 자까지(넘으면 끝을 … 로). 브라우저가 만드는 오류 글은 영어라 뜻은 남는다
export function cleanText(text: string, max: number): string {
  const cleaned = text
    .replace(SPACES, ' ')
    .trim()
    .replace(URL_TEXT, (url) => fileNameOf(url) ?? ELLIPSIS)
    .replace(CODE_TEXT, ELLIPSIS)
    .replace(OUTSIDE_RUN, ELLIPSIS)
    .replace(DIGIT_RUN, '#')
  return cut(cleaned, max)
}

// 앱 출처(location.origin)의 파일인가. 출처로 시작하기만 하는 다른 주소(…pages.dev.evil.com)는 아니다
function isAppUrl(url: string, origin: string): boolean {
  return url.startsWith(`${origin}/`)
}

function locationsOf(raw: RawError): { url: string; line: string; column: string }[] {
  const text = [raw.stack ?? '', raw.filename ? `${raw.filename}:${raw.line ?? 0}:${raw.column ?? 0}` : ''].join('\n')
  return [...text.matchAll(FRAME)].map(([, url, line, column]) => ({ url, line, column }))
}

// 위치: 스택(없으면 오류 이벤트의 파일 이름) 첫 앱 파일의 파일이름:줄:칸. 주소·경로는 뺀다
function whereOf(raw: RawError, origin: string): string | undefined {
  for (const { url, line, column } of locationsOf(raw)) {
    const name = isAppUrl(url, origin) ? fileNameOf(url) : undefined
    if (name !== undefined) return cut(`${name}:${line}:${column}`, WHERE_MAX)
  }
  return undefined
}

// 앱 파일이 아닌 곳에서 난 오류인가: 내용 없는 Script error., 또는 위치(파일 이름·스택 주소)가 있는데 앱 파일이 하나도 없음.
// 위치를 전혀 알 수 없으면 다른 출처라는 증거가 없으니 센다
function fromOutside(raw: RawError, origin: string): boolean {
  if (raw.message === CROSS_ORIGIN_MESSAGE) return true
  const urls = [...(raw.filename ? [raw.filename] : []), ...locationsOf(raw).map(({ url }) => url)]
  return urls.length > 0 && !urls.some((url) => isAppUrl(url, origin))
}

// 오류 하나를 보낼 모양으로 정리한다. 세지 않는 것(사용자 취소, 앱 밖 스크립트 오류)이면 undefined.
// 저장 실패(save)는 이름이 실패 이유(quota-exceeded 등)라 그대로 두고, 화면 그리기 오류(render)는 늘 앱 코드에서 난다
export function seenError(kind: AppErrorKind, raw: RawError, screen: string, origin: string): SeenError | undefined {
  if (kind !== 'save' && USER_CANCEL_NAMES.has(raw.name)) return undefined
  if ((kind === 'uncaught' || kind === 'rejection') && fromOutside(raw, origin)) return undefined
  const where = whereOf(raw, origin)
  return {
    kind,
    name: cleanText(raw.name, NAME_MAX) || 'Error',
    message: cleanText(raw.message, MESSAGE_MAX),
    screen: cleanText(screen, SCREEN_MAX) || UNKNOWN_SCREEN,
    ...(where !== undefined && { where }),
  }
}

// 던진 값에서 이름·글·스택을 읽는다 (Error·DOMException 은 이름이 프로토타입에 있다).
// Error 가 아닌 값(글자, undefined 등)을 던졌으면 이름은 NonError
export function rawErrorOf(value: unknown): RawError {
  if (isRecord(value)) {
    const { name, message, stack } = value
    if (typeof name === 'string' && typeof message === 'string') {
      return { name, message, ...(typeof stack === 'string' && { stack }) }
    }
  }
  return { name: 'NonError', message: typeof value === 'string' ? value : '' }
}

function sameError(a: SeenError, b: SeenError): boolean {
  return a.kind === b.kind && a.name === b.name && a.message === b.message && a.screen === b.screen
}

// 지금 둘 오류: 마지막 때가 7일 안인 줄을 마지막 때 순(오래된 것 먼저)으로, 5줄까지
export function recentErrors(list: readonly AppError[], now: Date): AppError[] {
  return list
    .filter((error) => now.getTime() - Date.parse(error.lastAt) <= ERROR_KEEP_MS)
    .sort((a, b) => Date.parse(a.lastAt) - Date.parse(b.lastAt))
    .slice(-MAX_ERRORS)
}

// 오류 하나를 더한다: 같은 오류가 있으면 횟수와 마지막 때(위치도 이번 것)를 올리고, 없으면 새 줄
export function addError(list: readonly AppError[], seen: SeenError, at: Date): AppError[] {
  const time = at.toISOString()
  const recent = recentErrors(list, at)
  const same = recent.find((error) => sameError(error, seen))
  const others = recent.filter((error) => error !== same)
  const added: AppError = same
    ? { ...same, ...(seen.where !== undefined && { where: seen.where }), count: same.count + 1, lastAt: time }
    : { ...seen, count: 1, firstAt: time, lastAt: time }
  return recentErrors([...others, added], at)
}

function isTextOfLength(value: unknown, min: number, max: number): boolean {
  return typeof value === 'string' && value.length >= min && value.length <= max
}

function isIsoText(value: unknown): boolean {
  return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
}

// 폰에 둔 줄이 서버가 받는 모양인가 (예전 앱·손댄 값이 섞여 서버가 신호를 통째로 400 으로 버리지 않게)
export function isAppError(value: unknown): value is AppError {
  if (!isRecord(value) || Object.keys(value).some((key) => !ERROR_KEYS.has(key))) return false
  const { kind, name, message, screen, where, count, firstAt, lastAt } = value
  return (
    KINDS.some((known) => known === kind) &&
    isTextOfLength(name, 1, NAME_MAX) &&
    isTextOfLength(message, 0, MESSAGE_MAX) &&
    isTextOfLength(screen, 1, SCREEN_MAX) &&
    (where === undefined || isTextOfLength(where, 0, WHERE_MAX)) &&
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= 1 &&
    isIsoText(firstAt) &&
    isIsoText(lastAt)
  )
}
