// 장부 계산·변경 순수 함수 (SPEC-001). 화면·저장소와 무관하게 Ledger 만 다룬다
import { ENTRY_AMOUNT_MAX, type Entry, type EntryType, type Ledger } from './types'

// 사용자가 입력하는 기록 내용. id·createdAt 은 앱이 붙인다
export type EntryInput = Pick<Entry, 'month' | 'type' | 'name' | 'amount' | 'batchId'>

// 장부를 시작하거나 고칠 때 입력하는 동아리 정보
export type LedgerInfo = Pick<Ledger, 'clubName' | 'carryover'>

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
  entries: Entry[] // 입력 순
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

// 한 달 보기 (AC-9): 그 달 기록(입력 순)과 수입·지출 소계. 기록이 없는 달은 빈 목록
export function monthGroup(entries: readonly Entry[], month: number): MonthGroup {
  const monthEntries = entries.filter((entry) => entry.month === month)
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

// 입력을 다듬고 저장 형식 범위를 확인한다. 범위 밖 값이 저장되면 다음 실행 때 데이터 전체가 깨진 것으로 처리되므로 막는다
function normalizeEntryInput(input: EntryInput): EntryInput {
  const name = input.name.trim()
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    throw new InvalidLedgerInputError(`월은 1~12 사이여야 한다: ${input.month}`)
  }
  if (name.length === 0) throw new InvalidLedgerInputError('항목 이름이 비어 있다')
  if (!Number.isInteger(input.amount) || input.amount < 1 || input.amount > ENTRY_AMOUNT_MAX) {
    throw new InvalidLedgerInputError(`금액은 1 ~ ${ENTRY_AMOUNT_MAX} 정수여야 한다: ${input.amount}`)
  }
  const normalized: EntryInput = { month: input.month, type: input.type, name, amount: input.amount }
  return input.batchId === undefined ? normalized : { ...normalized, batchId: input.batchId }
}

export function addEntry(ledger: Ledger, input: EntryInput, deps: EntryDeps): Ledger {
  const entry: Entry = { id: deps.createId(), ...normalizeEntryInput(input), createdAt: deps.now().toISOString() }
  return { ...ledger, entries: [...ledger.entries, entry] }
}

// id·입력 시각·순서는 그대로 두고 내용만 바꾼다. 입력에 묶음이 없으면 원래 묶음(사진으로 함께 넣은 것)도 그대로
export function updateEntry(ledger: Ledger, id: string, input: EntryInput): Ledger {
  const content = normalizeEntryInput(input)
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

function normalizeLedgerInfo(info: LedgerInfo): LedgerInfo {
  if (!Number.isInteger(info.carryover) || Math.abs(info.carryover) > ENTRY_AMOUNT_MAX) {
    throw new InvalidLedgerInputError(`이월금은 ±${ENTRY_AMOUNT_MAX} 이내 정수여야 한다: ${info.carryover}`)
  }
  return { clubName: info.clubName.trim(), carryover: info.carryover }
}

export function createLedger(year: number, info: LedgerInfo): Ledger {
  return { year, ...normalizeLedgerInfo(info), entries: [] }
}

export function updateLedgerInfo(ledger: Ledger, info: LedgerInfo): Ledger {
  return { ...ledger, ...normalizeLedgerInfo(info) }
}

// 새 연도 장부의 입력 기본값 (AC-8)
// - 이월금: 전년도 장부가 있으면 그 잔액, 없으면 0
// - 동아리 이름: 그 해보다 앞선 가장 가까운 장부, 없으면 가장 최근 장부에서 이어받는다
export function newLedgerDefaults(ledgers: Readonly<Record<string, Ledger>>, year: number): LedgerInfo {
  const previous = ledgers[String(year - 1)]
  const byYearDesc = Object.values(ledgers).sort((a, b) => b.year - a.year)
  const nameSource = byYearDesc.find((item) => item.year < year) ?? byYearDesc[0]
  return {
    clubName: nameSource?.clubName ?? '',
    carryover: previous ? calculateTotals(previous).balance : 0,
  }
}
