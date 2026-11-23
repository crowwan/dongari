// 저장 데이터 런타임 검증. 외부에서 들어온 값(localStorage, 백업 파일)은 이 가드를 통과해야 타입을 얻는다
import { isDayInMonth } from '../domain/entryDate'
import {
  CURRENT_SCHEMA_VERSION,
  ENTRY_AMOUNT_MAX,
  type Book,
  type BookDues,
  type Entry,
  type Ledger,
  type Member,
  type Payer,
  type Settings,
  type StoredData,
  type YearMonth,
} from '../domain/types'

// 장부가 하나도 없는 처음 상태 (첫 실행 화면)
export function createEmptyData(): StoredData {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, books: [], settings: {} }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

// 날짜(일)는 없어도 된다(v2.2 전 예전 기록). 있으면 1~31 정수 — 그 달 마지막 날은 장부 연도를 아는 isLedger 가 본다
function isOptionalDay(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31)
}

// 돈 한 칸: 1 ~ ENTRY_AMOUNT_MAX 정수 (기록 금액, 낸 분 몫, 월 회비)
function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= ENTRY_AMOUNT_MAX
}

// 겹치는 값이 없다 (장부 id, 회원 번호, 한 기록의 낸 분)
function allDifferent(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

// 'YYYY-MM' 달 (SPEC-010 1절). 한 자리 달·13월·날짜까지 붙은 글은 아니다
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

function isYearMonth(value: unknown): value is YearMonth {
  return typeof value === 'string' && YEAR_MONTH.test(value)
}

function isPayer(value: unknown): value is Payer {
  return isRecord(value) && typeof value.memberId === 'string' && isAmount(value.amount)
}

// 낸 분 (SPEC-010 1절): 금액 합 = 기록 금액(기록 금액이 1원 이상이라 빈 목록도 여기서 걸린다), 같은 회원 두 번 없음.
// 그 장부 명단에 있는 회원인지는 명단을 아는 isBook 이 본다
function isPayerList(value: unknown, entryAmount: number): value is Payer[] {
  if (!Array.isArray(value)) return false
  const items: unknown[] = value
  return (
    items.every(isPayer) &&
    items.reduce((sum, payer) => sum + payer.amount, 0) === entryAmount &&
    allDifferent(items.map((payer) => payer.memberId))
  )
}

export function isEntry(value: unknown): value is Entry {
  if (!isRecord(value)) return false
  const { id, month, day, type, name, amount, createdAt, batchId, payers, sourceText } = value
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof month === 'number' &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    isOptionalDay(day) &&
    (type === 'income' || type === 'expense') &&
    typeof name === 'string' &&
    isAmount(amount) &&
    typeof createdAt === 'string' &&
    isOptionalString(batchId) &&
    (payers === undefined || isPayerList(payers, amount)) &&
    isOptionalString(sourceText)
  )
}

// 기록의 날짜가 장부 연도의 그 달 안인가 (4월 31일, 윤년이 아닌 해 2월 29일은 없는 날)
function isEntryOfYear(year: number) {
  return (value: unknown): value is Entry =>
    isEntry(value) && (value.day === undefined || isDayInMonth(year, value.month, value.day))
}

export function isLedger(value: unknown): value is Ledger {
  if (!isRecord(value)) return false
  const { year, carryover, entries, monthlyFee } = value
  return (
    typeof year === 'number' &&
    Number.isInteger(year) &&
    typeof carryover === 'number' &&
    Number.isFinite(carryover) &&
    Array.isArray(entries) &&
    entries.every(isEntryOfYear(year)) &&
    (monthlyFee === undefined || isAmount(monthlyFee))
  )
}

// 마지막에 본 장부 id 는 없는 장부를 가리켜도 된다 (그때는 첫 장부를 연다, domain/book.currentBook).
// 복구 코드는 글자면 된다 — 형식이 틀리면 깨진 데이터로 보지 않고 새 코드로 바꾼다 (features/keep/recoveryCode)
export function isSettings(value: unknown): value is Settings {
  return (
    isRecord(value) &&
    isOptionalString(value.lastBackupAt) &&
    isOptionalString(value.lastChangedAt) &&
    isOptionalString(value.lastBookId) &&
    isOptionalString(value.recoveryCode)
  )
}

// 장부 키는 연도 문자열이고, 안의 year 와 같아야 한다
export function isLedgerMap(value: unknown): value is Record<string, Ledger> {
  return isRecord(value) && Object.entries(value).every(([key, ledger]) => isLedger(ledger) && key === String(ledger.year))
}

// 시작할 때 남은 돈: 정수, 미리 낸 돈(양수)·덜 낸 돈(음수) 모두 이월금과 같은 ±ENTRY_AMOUNT_MAX 안
function isOpening(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= ENTRY_AMOUNT_MAX
}

// 회원 한 분 (SPEC-010 1절). 들어온 달·그만둔 달·쉬는 달의 앞뒤가 맞는지는 보지 않는다 — 회비 표 계산이 칸 없음으로 다룬다
function isMember(value: unknown): value is Member {
  if (!isRecord(value)) return false
  const { id, name, joined, left, off, opening } = value
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof name === 'string' &&
    isYearMonth(joined) &&
    (left === undefined || isYearMonth(left)) &&
    Array.isArray(off) &&
    off.every(isYearMonth) &&
    (opening === undefined || isOpening(opening))
  )
}

// 회원 번호는 장부 안에서 겹치지 않아야 한다 (낸 분이 번호로 회원을 가리킨다)
function isMemberList(value: unknown): value is Member[] {
  if (!Array.isArray(value)) return false
  const items: unknown[] = value
  return items.every(isMember) && allDifferent(items.map((member) => member.id))
}

function isBookDues(value: unknown): value is BookDues {
  return (
    isRecord(value) &&
    isYearMonth(value.startMonth) &&
    (value.hideUnassigned === undefined || typeof value.hideUnassigned === 'boolean')
  )
}

// 낸 분은 그 장부 명단에 있는 회원만 (SPEC-010 1절). 명단이 없으면 낸 분이 있는 기록도 없어야 한다
function payersInRoster(ledgers: Record<string, Ledger>, members: readonly Member[] = []): boolean {
  const memberIds = new Set(members.map((member) => member.id))
  return Object.values(ledgers).every((ledger) =>
    ledger.entries.every((entry) => (entry.payers ?? []).every((payer) => memberIds.has(payer.memberId))),
  )
}

// 회원 명단·회비 값은 장부 종류와 상관없이 받는다 — 가계부로 바꿔도 지우지 않고 숨긴다 (SPEC-010 6절)
export function isBook(value: unknown): value is Book {
  if (!isRecord(value)) return false
  const { id, name, kind, ledgers, createdAt, members, dues } = value
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof name === 'string' &&
    (kind === 'club' || kind === 'household') &&
    isLedgerMap(ledgers) &&
    typeof createdAt === 'string' &&
    (members === undefined || isMemberList(members)) &&
    (dues === undefined || isBookDues(dues)) &&
    payersInRoster(ledgers, members)
  )
}

// 장부 id 는 겹치지 않아야 한다 (지금 장부를 id 로 고른다)
function isBookList(value: unknown): value is Book[] {
  if (!Array.isArray(value)) return false
  const items: unknown[] = value
  return items.every(isBook) && allDifferent(items.map((book) => book.id))
}

export function isStoredData(value: unknown): value is StoredData {
  return (
    isRecord(value) &&
    value.schemaVersion === CURRENT_SCHEMA_VERSION &&
    isBookList(value.books) &&
    isSettings(value.settings)
  )
}
