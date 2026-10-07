// 월 정리·올해 결산 계산 순수 함수 (SPEC-003). 화면은 이 결과를 그대로 그리기만 한다
import { byDate } from './entryDate'
import { calculateTotals, InvalidLedgerInputError, type LedgerTotals } from './ledger'
import type { Entry, EntryType, Ledger } from './types'

const MONTHS: readonly number[] = Array.from({ length: 12 }, (_, index) => index + 1)
// 지출내역 표는 1월↔7월 … 6월↔12월을 한 짝으로 나란히 둔다 (v1 PLANS.md 6.2·6.3)
const LEFT_MONTHS = MONTHS.slice(0, 6)
const RIGHT_MONTH_OFFSET = 6

// 월별 수입·지출 표 한 줄
export interface MonthTotal {
  month: number
  income: number
  expense: number
}

// 지출내역 표 한쪽(왼쪽 1~6월 / 오른쪽 7~12월)의 한 칸 묶음(월·지출내역·금액)
export interface ExpenseTableCell {
  month: number
  // 짝 첫 줄이면 달 칸이 세로로 차지할 줄 수(rowSpan = 짝 높이), 같은 짝 다음 줄이면 0 (달 칸을 그리지 않는다)
  monthRowSpan: number
  // 내용 없는 줄이면 null (지출이 없는 달, 또는 짝 높이를 맞추려고 채운 줄)
  item: { name: string; amount: number } | null
}

// 지출내역 표 한 줄. 모든 줄이 좌우 각각 어느 달에 속한다
export interface ExpenseTableRow {
  left: ExpenseTableCell
  right: ExpenseTableCell
}

// 수입내역 한 줄 (같은 이름은 합친 값)
export interface IncomeItemTotal {
  name: string
  amount: number
}

// v1 연말 양식(PLANS.md 6장) 한 장에 들어가는 값 전부
export interface YearReport {
  year: number
  clubName: string
  carryover: number
  months: MonthTotal[] // 1~12월 순서, 항상 12개
  totals: LedgerTotals // 연간 수입·지출 합계와 잔액. 수입내역 합계 = totals.income
  expenseRows: ExpenseTableRow[]
  incomeItems: IncomeItemTotal[] // 처음 등장한 순
}

// 월 정리의 "전달까지 잔액" 자리. 1월은 작년 이월금이라 표시 문구가 다르다
export type OpeningBalance =
  | { kind: 'carryover'; year: number; amount: number } // 작년(year) 이월금
  | { kind: 'previousMonth'; month: number; amount: number } // month 월까지 잔액

export interface MonthSummary {
  month: number
  incomeEntries: Entry[] // 날짜순(장부와 같게), 이름이 같아도 합치지 않는다
  expenseEntries: Entry[]
  income: number
  expense: number
  opening: OpeningBalance
  net: number // 그 달 수입 − 지출
  closing: number // 월말 잔액
}

// 그 달 그 종류 기록, 장부와 같은 날짜순 (같은 날은 적은 순, 날짜 없는 예전 기록은 맨 뒤)
function entriesOf(entries: readonly Entry[], type: EntryType, month: number): Entry[] {
  return byDate(entries.filter((entry) => entry.type === type && entry.month === month))
}

function sum(entries: readonly Entry[]): number {
  return entries.reduce((total, entry) => total + entry.amount, 0)
}

// 짝 높이(height)만큼 한 달의 칸을 만든다. 지출 기록은 날짜순으로 위부터(양식에 날짜 칸은 없다, v2.2), 남는 줄은 내용 없는 줄
function monthCells(entries: readonly Entry[], month: number, height: number): ExpenseTableCell[] {
  const expenses = entriesOf(entries, 'expense', month)
  return Array.from({ length: height }, (_, index) => {
    const expense = expenses[index]
    return {
      month,
      monthRowSpan: index === 0 ? height : 0,
      item: expense === undefined ? null : { name: expense.name, amount: expense.amount },
    }
  })
}

// 짝마다 높이 = max(왼쪽 달 지출 수, 오른쪽 달 지출 수, 1). 그래서 좌우 행 수가 같고 월이 바뀌는 줄도 좌우가 같다
function expenseTableRows(entries: readonly Entry[]): ExpenseTableRow[] {
  return LEFT_MONTHS.flatMap((leftMonth) => {
    const rightMonth = leftMonth + RIGHT_MONTH_OFFSET
    const height = Math.max(
      entriesOf(entries, 'expense', leftMonth).length,
      entriesOf(entries, 'expense', rightMonth).length,
      1,
    )
    const left = monthCells(entries, leftMonth, height)
    const right = monthCells(entries, rightMonth, height)
    return left.map((cell, index) => ({ left: cell, right: right[index] }))
  })
}

function sumIncomeByName(entries: readonly Entry[]): IncomeItemTotal[] {
  const byName = new Map<string, number>()
  for (const entry of entries) {
    if (entry.type === 'income') byName.set(entry.name, (byName.get(entry.name) ?? 0) + entry.amount)
  }
  return [...byName].map(([name, amount]) => ({ name, amount }))
}

export function yearReport(ledger: Ledger): YearReport {
  const { entries } = ledger
  return {
    year: ledger.year,
    clubName: ledger.clubName,
    carryover: ledger.carryover,
    months: MONTHS.map((month) => ({
      month,
      income: sum(entriesOf(entries, 'income', month)),
      expense: sum(entriesOf(entries, 'expense', month)),
    })),
    totals: calculateTotals(ledger),
    expenseRows: expenseTableRows(entries),
    incomeItems: sumIncomeByName(entries),
  }
}

// 전달까지 잔액 = 이월금 + 1월~전달 수입 − 1월~전달 지출
function openingBalance(ledger: Ledger, month: number): OpeningBalance {
  if (month === 1) return { kind: 'carryover', year: ledger.year - 1, amount: ledger.carryover }
  const before = ledger.entries.filter((entry) => entry.month < month)
  const { balance } = calculateTotals({ ...ledger, entries: before })
  return { kind: 'previousMonth', month: month - 1, amount: balance }
}

export function monthSummary(ledger: Ledger, month: number): MonthSummary {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new InvalidLedgerInputError(`월은 1~12 사이여야 한다: ${month}`)
  }
  const incomeEntries = entriesOf(ledger.entries, 'income', month)
  const expenseEntries = entriesOf(ledger.entries, 'expense', month)
  const income = sum(incomeEntries)
  const expense = sum(expenseEntries)
  const opening = openingBalance(ledger, month)
  const net = income - expense
  return { month, incomeEntries, expenseEntries, income, expense, opening, net, closing: opening.amount + net }
}
