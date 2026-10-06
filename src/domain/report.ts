// 월 정리·올해 결산 계산 순수 함수 (SPEC-003). 화면은 이 결과를 그대로 그리기만 한다
import { calculateTotals, InvalidLedgerInputError, type LedgerTotals } from './ledger'
import type { Entry, EntryType, Ledger } from './types'

const MONTHS: readonly number[] = Array.from({ length: 12 }, (_, index) => index + 1)
const LEFT_MONTHS = MONTHS.slice(0, 6)
const RIGHT_MONTHS = MONTHS.slice(6)

// 월별 수입·지출 표 한 줄
export interface MonthTotal {
  month: number
  income: number
  expense: number
}

// 지출내역 표 한쪽(왼쪽 1~6월 / 오른쪽 7~12월)의 한 칸 묶음(월·지출내역·금액)
export interface ExpenseTableCell {
  month: number
  // 그 달 첫 줄이면 달 칸이 세로로 차지할 줄 수(rowSpan), 같은 달 다음 줄이면 0 (달 칸을 그리지 않는다)
  monthRowSpan: number
  // 지출이 없는 달의 빈 한 줄이면 null
  item: { name: string; amount: number } | null
}

// 지출내역 표 한 줄. 한쪽이 null 이면 좌우 행 수를 맞추려고 아래에 채운 빈 줄
export interface ExpenseTableRow {
  left: ExpenseTableCell | null
  right: ExpenseTableCell | null
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
  incomeEntries: Entry[] // 입력 순, 이름이 같아도 합치지 않는다
  expenseEntries: Entry[]
  income: number
  expense: number
  opening: OpeningBalance
  net: number // 그 달 수입 − 지출
  closing: number // 월말 잔액
}

function entriesOf(entries: readonly Entry[], type: EntryType, month: number): Entry[] {
  return entries.filter((entry) => entry.type === type && entry.month === month)
}

function sum(entries: readonly Entry[]): number {
  return entries.reduce((total, entry) => total + entry.amount, 0)
}

// 한쪽 달들을 위에서부터 쌓는다. 지출이 없는 달도 달 칸이 보이도록 빈 한 줄을 차지한다 (v1 ExpenseDetailTable 과 같음)
function stackExpenseCells(entries: readonly Entry[], months: readonly number[]): ExpenseTableCell[] {
  return months.flatMap((month): ExpenseTableCell[] => {
    const expenses = entriesOf(entries, 'expense', month)
    if (expenses.length === 0) return [{ month, monthRowSpan: 1, item: null }]
    return expenses.map((entry, index) => ({
      month,
      monthRowSpan: index === 0 ? expenses.length : 0,
      item: { name: entry.name, amount: entry.amount },
    }))
  })
}

// 좌우 중 긴 쪽에 맞춰 짧은 쪽 아래를 빈 줄로 채운다
function pairRows(left: readonly ExpenseTableCell[], right: readonly ExpenseTableCell[]): ExpenseTableRow[] {
  const rowCount = Math.max(left.length, right.length)
  return Array.from({ length: rowCount }, (_, index) => ({ left: left[index] ?? null, right: right[index] ?? null }))
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
    expenseRows: pairRows(stackExpenseCells(entries, LEFT_MONTHS), stackExpenseCells(entries, RIGHT_MONTHS)),
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
