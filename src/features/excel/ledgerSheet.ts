// "YYYY년 입출금내역" 시트 한 장 읽기 (SPEC-010 8절 "읽는 규칙": 열·날짜·금액·이월금). SheetJS 를 모르는 순수 함수
import { daysInMonth } from '../../domain/entryDate'
import { ENTRY_AMOUNT_MAX } from '../../domain/types'
import { cellAt, cellText, compactText, isMergedAway, rowText, type SheetCell, type SheetData } from './sheet'
import { wonOf } from './won'

// 기록이 될 줄 하나. 수입·지출이 한 줄에 둘 다 있으면 두 기록이 된다
export interface LedgerLine {
  month: number
  day?: number // 없으면 날짜 없는 기록
  income?: number
  expense?: number
  content: string // 입금과 출금 사이 칸의 글
}

// 확인 화면 목록 한 줄: 해·달·원래 글 ("날짜를 바꾼 줄", "읽지 못한 줄")
export interface LineNote {
  year: number
  month?: number
  text: string
}

export interface LedgerSheetRead {
  carryover: number
  lines: LedgerLine[]
  unreadLines: LineNote[]
  changedDates: LineNote[]
  lastBalance?: number // 검산용: 잔액 열의 마지막 숫자
}

interface Columns {
  month: number
  day: number
  income: number
  expense: number
  balance: number
  content: number[] // 입금과 출금 사이
}

const HEADER_NAMES = ['월', '일', '입금', '출금', '잔액'] as const
// "2024년 이월금" (띄어쓰기 무시, "2024년도 이월금"도)
const CARRYOVER_LABEL = /^\d{4}년도?이월금$/

function findColumns(row: readonly SheetCell[]): Columns | undefined {
  const texts = row.map(compactText)
  const [month, day, income, expense, balance] = HEADER_NAMES.map((name) => texts.indexOf(name))
  if ([month, day, income, expense, balance].some((index) => index < 0)) return undefined
  const content: number[] = []
  for (let c = Math.min(income, expense) + 1; c < Math.max(income, expense); c += 1) content.push(c)
  return { month, day, income, expense, balance, content }
}

function findHeader(sheet: SheetData): { row: number; columns: Columns } | undefined {
  for (let row = 0; row < sheet.rows.length; row += 1) {
    const columns = findColumns(sheet.rows[row])
    if (columns) return { row, columns }
  }
  return undefined
}

function findCarryoverRow(sheet: SheetData, headerRow: number): number | undefined {
  const index = sheet.rows.findIndex((row, r) => r !== headerRow && row.some((cell) => CARRYOVER_LABEL.test(compactText(cell))))
  return index < 0 ? undefined : index
}

// 월: 숫자 또는 "N월" (1~12)
function parseMonth(cell: SheetCell): number | undefined {
  const match = /^(\d{1,2})월?$/.exec(compactText(cell))
  const month = match ? Number(match[1]) : NaN
  return month >= 1 && month <= 12 ? month : undefined
}

// 일: 숫자 또는 "N일", "N일~M일"은 N (1~31. 그 달에 없는 날은 부르는 쪽이 마지막 날로 바꾼다)
function parseDay(cell: SheetCell): number | undefined {
  const match = /^(\d{1,2})일?(?:[~～∼-]\d{1,2}일?)?$/.exec(compactText(cell))
  const day = match ? Number(match[1]) : NaN
  return day >= 1 && day <= 31 ? day : undefined
}

type AmountCell = { kind: 'none' } | { kind: 'amount'; value: number } | { kind: 'unreadable' }

// 금액 칸: 비었으면 없음, 1 ~ 상한 정수면 금액(글자로 적힌 "30,000원"도), 그 밖의 글자·0·음수·소수·상한 넘음은 읽지 못함
function parseAmount(cell: SheetCell): AmountCell {
  if (cellText(cell) === '') return { kind: 'none' }
  const value = wonOf(cell)
  if (value !== undefined && Number.isInteger(value) && value > 0 && value <= ENTRY_AMOUNT_MAX) {
    return { kind: 'amount', value }
  }
  return { kind: 'unreadable' }
}

// 병합 범위 안 칸(왼쪽 위가 아닌 칸)은 빈칸과 같이 윗줄 값을 이어받는다
function ownCell(sheet: SheetData, r: number, c: number): SheetCell {
  return isMergedAway(sheet, r, c) ? null : cellAt(sheet, r, c)
}

// 시트를 읽는다. 머리 줄이나 이월금 줄이 없으면 모양이 다른 시트라 undefined (AC-27)
export function readLedgerSheet(sheet: SheetData, year: number): LedgerSheetRead | undefined {
  const header = findHeader(sheet)
  if (!header) return undefined
  const carryoverRow = findCarryoverRow(sheet, header.row)
  if (carryoverRow === undefined) return undefined
  const { columns } = header

  const unreadLines: LineNote[] = []
  const changedDates: LineNote[] = []
  const lines: LedgerLine[] = []

  // 이월금: 잔액 칸의 정수(글자로 적힌 "370,482"도, 반올림하지 않는다). 아니면 0 으로 두고 읽지 못한 줄로 센다
  const carryoverCell = cellAt(sheet, carryoverRow, columns.balance)
  const carryover = wonOf(carryoverCell)
  const carryoverOk = carryover !== undefined && Number.isInteger(carryover)
  if (!carryoverOk) unreadLines.push({ year, text: rowText(sheet.rows[carryoverRow]) })
  let lastBalance = typeof carryoverCell === 'number' ? carryoverCell : undefined

  let month: number | undefined
  let day: number | undefined
  // 지금 날이 날로 읽을 수 없는 일 칸에서 온 것인가 (이어받은 줄도 "날짜를 바꾼 줄"로 센다)
  let dayUnreadable = false
  for (let r = header.row + 1; r < sheet.rows.length; r += 1) {
    if (r === carryoverRow) continue
    const row = sheet.rows[r]
    const balanceCell = cellAt(sheet, r, columns.balance)
    if (typeof balanceCell === 'number') lastBalance = balanceCell

    // 날짜: 월 칸이 비면 윗줄의 달, 일 칸이 비면 윗줄의 날 (달이 바뀐 줄에서 일이 비면 날짜 없음)
    const monthCell = ownCell(sheet, r, columns.month)
    const writtenMonth = cellText(monthCell) === '' ? undefined : parseMonth(monthCell)
    const monthUnreadable = cellText(monthCell) !== '' && writtenMonth === undefined
    const monthChanged = writtenMonth !== undefined && writtenMonth !== month
    if (writtenMonth !== undefined) month = writtenMonth

    // 달을 읽을 수 없는 줄("합계")의 일 칸은 다음 줄에 넘기지 않는다
    const dayCell = ownCell(sheet, r, columns.day)
    if (!monthUnreadable && cellText(dayCell) !== '') {
      day = parseDay(dayCell)
      dayUnreadable = day === undefined
    } else if (monthChanged) {
      day = undefined
      dayUnreadable = false
    }

    const income = parseAmount(cellAt(sheet, r, columns.income))
    const expense = parseAmount(cellAt(sheet, r, columns.expense))
    if (income.kind === 'none' && expense.kind === 'none') continue

    const text = rowText(row)
    if (month === undefined || monthUnreadable || income.kind === 'unreadable' || expense.kind === 'unreadable') {
      unreadLines.push(monthUnreadable || month === undefined ? { year, text } : { year, month, text })
      continue
    }

    // 그 달에 없는 날(2월 31일)은 그 달 마지막 날로, 읽을 수 없는 일 칸은 날짜 없이 넣고 "날짜를 바꾼 줄"로 센다
    const lastDay = daysInMonth(year, month)
    const lineDay = day !== undefined && day > lastDay ? lastDay : day
    if (dayUnreadable || lineDay !== day) changedDates.push({ year, month, text })

    const content = columns.content.map((c) => cellText(cellAt(sheet, r, c))).filter((part) => part !== '').join(' ')
    const line: LedgerLine = { month, content }
    if (lineDay !== undefined) line.day = lineDay
    if (income.kind === 'amount') line.income = income.value
    if (expense.kind === 'amount') line.expense = expense.value
    lines.push(line)
  }

  const read: LedgerSheetRead = { carryover: carryoverOk ? carryover : 0, lines, unreadLines, changedDates }
  if (lastBalance !== undefined) read.lastBalance = lastBalance
  return read
}
