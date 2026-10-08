// 장부 계산·변경 순수 함수 (SPEC-001). 화면·저장소와 무관하게 Ledger 만 다룬다
import { byDate, isDayInMonth } from './entryDate'
import { ENTRY_AMOUNT_MAX, type Book, type Entry, type EntryType, type Ledger } from './types'

// 사용자가 입력하는 기록 내용. id·createdAt 은 앱이 붙인다. 날짜(일)는 새로 적을 때 꼭 있고, 날짜 없는 예전 기록을 고칠 때만 빠진다
export type EntryInput = Pick<Entry, 'month' | 'day' | 'type' | 'name' | 'amount' | 'batchId'>

// 장부를 시작하거나 고칠 때 입력하는 장부 이름(Book)과 그 해 이월금(Ledger)
export interface LedgerInfo {
  name: string
  carryover: number
}

// 기록을 만들 때 바깥에서 받는 것 (테스트에서 고정값을 넣을 수 있게)
export interface EntryDeps {
  createId: () => string
  now: () => Date
}

export interface LedgerTotals {
  income: number
  expense: number
  balance: number
}

export interface MonthGroup {
  month: number
  income: number
  expense: number
  entries: Entry[] // 날짜순 (entryDate.byDate)
}

// 자주 쓴 항목 버튼 하나: 이름과, 누르면 함께 고를 종류
export interface FrequentChoice {
  name: string
  type: EntryType
}

// 자주 쓴 항목 버튼 최대 개수 (SPEC-001 결정)
export const FREQUENT_CHOICES_LIMIT = 6

// 기록이 적을 때 채워 넣는 기본 항목 (대관료·간식비 = 지출, 회비 = 수입)
const DEFAULT_CHOICES: readonly FrequentChoice[] = [
  { name: '대관료', type: 'expense' },
  { name: '간식비', type: 'expense' },
  { name: '회비', type: 'income' },
]

// 저장 데이터 형식(schema.ts)에 맞지 않는 입력. 화면은 이런 값으로 저장 버튼을 누를 수 없어야 한다
export class InvalidLedgerInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidLedgerInputError'
  }
}

function sumAmounts(entries: readonly Entry[], type: EntryType): number {
  return entries.reduce((sum, entry) => (entry.type === type ? sum + entry.amount : sum), 0)
}

// 잔액 = 이월금 + 수입 합 − 지출 합
export function calculateTotals(ledger: Ledger): LedgerTotals {
  const income = sumAmounts(ledger.entries, 'income')
  const expense = sumAmounts(ledger.entries, 'expense')
  return { income, expense, balance: ledger.carryover + income - expense }
}

// 한 달 보기 (AC-9): 그 달 기록(날짜순)과 수입·지출 소계. 기록이 없는 달은 빈 목록
export function monthGroup(entries: readonly Entry[], month: number): MonthGroup {
  const monthEntries = byDate(entries.filter((entry) => entry.month === month))
  return {
    month,
    income: sumAmounts(monthEntries, 'income'),
    expense: sumAmounts(monthEntries, 'expense'),
    entries: monthEntries,
  }
}

// 장부 화면에 처음 보이는 달: 올해 장부면 이번 달, 지난 연도 장부면 12월
export function firstVisibleMonth(year: number, today: Date): number {
  return year === today.getFullYear() ? today.getMonth() + 1 : 12
}

// 입력을 다듬고 저장 형식 범위를 확인한다. 범위 밖 값이 저장되면 다음 실행 때 데이터 전체가 깨진 것으로 처리되므로 막는다.
// 날짜(일)는 장부 연도의 그 달 안이어야 한다 (2월은 윤년 반영)
function normalizeEntryInput(year: number, input: EntryInput): EntryInput {
  const name = input.name.trim()
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    throw new InvalidLedgerInputError(`월은 1~12 사이여야 한다: ${input.month}`)
  }
  if (input.day !== undefined && !isDayInMonth(year, input.month, input.day)) {
    throw new InvalidLedgerInputError(`${year}년 ${input.month}월에 없는 날이다: ${input.day}`)
  }
  if (name.length === 0) throw new InvalidLedgerInputError('항목 이름이 비어 있다')
  if (!Number.isInteger(input.amount) || input.amount < 1 || input.amount > ENTRY_AMOUNT_MAX) {
    throw new InvalidLedgerInputError(`금액은 1 ~ ${ENTRY_AMOUNT_MAX} 정수여야 한다: ${input.amount}`)
  }
  // 없는 값은 키째 빼서 저장 데이터에 `day: undefined` 같은 빈 칸이 남지 않게 한다
  const normalized: EntryInput = { month: input.month, type: input.type, name, amount: input.amount }
  const dated = input.day === undefined ? normalized : { ...normalized, day: input.day }
  return input.batchId === undefined ? dated : { ...dated, batchId: input.batchId }
}

// 새로 적는 내역은 날짜(일)가 꼭 있다 (AC-24). 날짜 없는 기록은 v2.2 전에 적은 예전 기록뿐이다
export function addEntry(ledger: Ledger, input: EntryInput, deps: EntryDeps): Ledger {
  if (input.day === undefined) throw new InvalidLedgerInputError('새로 적는 내역에 날짜(일)가 없다')
  const entry: Entry = { id: deps.createId(), ...normalizeEntryInput(ledger.year, input), createdAt: deps.now().toISOString() }
  return { ...ledger, entries: [...ledger.entries, entry] }
}

// id·입력 시각·순서는 그대로 두고 내용만 바꾼다. 입력에 묶음이 없으면 원래 묶음(사진으로 함께 넣은 것)도 그대로.
// 날짜는 입력 그대로: 날짜 없는 예전 기록은 날짜 없이도 저장된다 (AC-25)
export function updateEntry(ledger: Ledger, id: string, input: EntryInput): Ledger {
  const content = normalizeEntryInput(ledger.year, input)
  return {
    ...ledger,
    entries: ledger.entries.map((entry) => {
      if (entry.id !== id) return entry
      const updated: Entry = { id, ...content, createdAt: entry.createdAt }
      return content.batchId === undefined && entry.batchId !== undefined ? { ...updated, batchId: entry.batchId } : updated
    }),
  }
}

export function deleteEntry(ledger: Ledger, id: string): Ledger {
  return { ...ledger, entries: ledger.entries.filter((entry) => entry.id !== id) }
}

// 자주 쓴 항목 버튼 (AC-4). entries 는 오래된 것부터 입력 순
// - type 을 주면(종류를 고른 뒤) 그 종류로 쓴 이름만, 없으면(고르기 전) 두 종류를 섞는다
// - 최근에 쓴 이름부터 중복 없이, 각 이름의 종류는 그 이름을 마지막으로 쓴 기록의 종류
// - 모자라면 기본 항목으로 채운다
export function frequentChoices(
  entries: readonly Entry[],
  type?: EntryType,
  limit: number = FREQUENT_CHOICES_LIMIT,
): FrequentChoice[] {
  const ofType = (choice: FrequentChoice) => type === undefined || choice.type === type
  const recentFirst = [...entries].reverse().map((entry) => ({ name: entry.name, type: entry.type }))
  const byName = new Map<string, FrequentChoice>()
  for (const choice of [...recentFirst.filter(ofType), ...DEFAULT_CHOICES.filter(ofType)]) {
    if (!byName.has(choice.name)) byName.set(choice.name, choice)
  }
  return [...byName.values()].slice(0, limit)
}

// 직접 적은 이름을 예전에 썼으면 그 이름을 마지막으로 쓴 기록의 종류, 처음 쓰는 이름이면 undefined (AC-15)
// entries 는 오래된 것부터 입력 순
export function lastUsedType(entries: readonly Entry[], name: string): EntryType | undefined {
  const trimmed = name.trim()
  return [...entries].reverse().find((entry) => entry.name === trimmed)?.type
}

function checkCarryover(carryover: number): number {
  if (!Number.isInteger(carryover) || Math.abs(carryover) > ENTRY_AMOUNT_MAX) {
    throw new InvalidLedgerInputError(`이월금은 ±${ENTRY_AMOUNT_MAX} 이내 정수여야 한다: ${carryover}`)
  }
  return carryover
}

export function createLedger(year: number, carryover: number): Ledger {
  return { year, carryover: checkCarryover(carryover), entries: [] }
}

export function updateCarryover(ledger: Ledger, carryover: number): Ledger {
  return { ...ledger, carryover: checkCarryover(carryover) }
}

// 새 연도 장부의 입력 기본값 (AC-8)
// - 이월금: 그 장부의 전년도 장부가 있으면 그 잔액, 없으면 0
// - 이름: 장부 이름 그대로 (장부가 아직 없으면 빈 이름)
export function newLedgerDefaults(book: Book | undefined, year: number): LedgerInfo {
  const previous = book?.ledgers[String(year - 1)]
  return {
    name: book?.name ?? '',
    carryover: previous ? calculateTotals(previous).balance : 0,
  }
}
