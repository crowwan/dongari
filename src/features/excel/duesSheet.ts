// "YYYY년 회비내역" 시트에서 회원 모으기 (SPEC-010 8절 "회원"). 이름·쉬는 달·미수합계만 읽고 ○ 칸은 읽지 않는다
// (낸 돈은 입출금내역으로 다시 계산한다, 시안 결정 E-3)
import { ENTRY_AMOUNT_MAX, type Member, type YearMonth } from '../../domain/types'
import { cellAt, cellText, compactText, type SheetCell, type SheetData } from './sheet'
import { wonOf } from './won'

// 회비내역 달 칸 하나: "/" 쉬는 달, "-" 회원 아닌 달(앱이 내보낸 엑셀, 9절), 그 밖(○·금액·빈칸)은 읽지 않는다
export type DuesMark = 'off' | 'out' | 'other'

export interface DuesSheetRow {
  name: string
  marks: DuesMark[] // 1월 ~ 12월
  unpaid: SheetCell // "미수합계" 칸 (열이 없으면 빈칸)
}

// 새로 만들 회원 (번호는 readExcelBook 이 붙인다)
export type MemberDraft = Omit<Member, 'id'>

const MONTH_HEADER = /^(\d{1,2})월$/
const OFF_MARKS = new Set(['/', '／'])
const OUT_MARKS = new Set(['-', '－', '–', '—'])

function markOf(cell: SheetCell): DuesMark {
  const text = compactText(cell)
  if (OFF_MARKS.has(text)) return 'off'
  if (OUT_MARKS.has(text)) return 'out'
  return 'other'
}

// 번호 칸: 숫자, 또는 숫자만 적힌 글
function isNumberCell(cell: SheetCell): boolean {
  return typeof cell === 'number' || /^\d+$/.test(compactText(cell))
}

// 머리 줄로 보는 "N월" 머리 수 (제목·안내 줄과 가르는 기준)
const MIN_MONTH_HEADERS = 6

// 1월 ~ 12월 머리가 있는 열 (없으면 -1)
function monthColumnsOf(header: readonly string[]): number[] {
  return Array.from({ length: 12 }, (_, index) => header.findIndex((text) => Number(MONTH_HEADER.exec(text)?.[1]) === index + 1))
}

// 머리가 있으면 그 열, 없으면 대신 쓸 열
function columnOr(header: readonly string[], name: string, fallback: number): number {
  const index = header.indexOf(name)
  return index < 0 ? fallback : index
}

// 시트를 읽는다. 머리 줄 = "1월"~"12월" 머리가 여섯 개 이상인 줄(이모 엑셀은 번호·이름 머리 글자가 없다).
// 이름 열 = "이름" 머리, 없으면 1월 바로 왼쪽 / 번호 열 = "번호" 머리, 없으면 이름 왼쪽 / 미수합계 열 = "미수합계" 머리.
// 머리 줄이 없으면 모양이 다른 시트라 undefined
export function readDuesSheet(sheet: SheetData): DuesSheetRow[] | undefined {
  const headerRow = sheet.rows.findIndex(
    (row) => monthColumnsOf(row.map(compactText)).filter((c) => c >= 0).length >= MIN_MONTH_HEADERS,
  )
  if (headerRow < 0) return undefined
  const header = sheet.rows[headerRow].map(compactText)
  const monthColumns = monthColumnsOf(header)
  const nameColumn = columnOr(header, '이름', Math.min(...monthColumns.filter((c) => c >= 0)) - 1)
  const noColumn = columnOr(header, '번호', nameColumn - 1)
  if (nameColumn < 0 || noColumn < 0) return undefined
  const unpaidColumn = header.indexOf('미수합계')

  const rows: DuesSheetRow[] = []
  for (let r = headerRow + 1; r < sheet.rows.length; r += 1) {
    const name = cellText(cellAt(sheet, r, nameColumn))
    if (name === '' || !isNumberCell(cellAt(sheet, r, noColumn))) continue
    rows.push({
      name,
      marks: monthColumns.map((c) => (c < 0 ? 'other' : markOf(cellAt(sheet, r, c)))),
      unpaid: unpaidColumn < 0 ? null : cellAt(sheet, r, unpaidColumn),
    })
  }
  return rows
}

function yearMonth(year: number, month: number): YearMonth {
  return `${year}-${String(month).padStart(2, '0')}`
}

// 미수합계 → 시작할 때 남은 돈(덜 낸 돈이라 음수). 0·빈칸·읽을 수 없는 값은 없음
function openingOf(unpaid: SheetCell): number | undefined {
  const value = wonOf(unpaid)
  if (value === undefined || !Number.isInteger(value) || value === 0 || Math.abs(value) > ENTRY_AMOUNT_MAX) return undefined
  return -value
}

interface Appearance {
  year: number
  row: DuesSheetRow
}

// 그분이 나온 해들의 달 칸을 차례로 (해 오름차순, 1월 → 12월)
function timelineOf(appearances: readonly Appearance[]): { month: YearMonth; mark: DuesMark }[] {
  return appearances.flatMap(({ year, row }) => row.marks.map((mark, index) => ({ month: yearMonth(year, index + 1), mark })))
}

// 끝쪽에 이어진 "-" 칸이 시작되는 달 (해를 넘어 이어져도). 끝이 "-" 가 아니면 없음
function trailingOutMonth(timeline: readonly { month: YearMonth; mark: DuesMark }[]): YearMonth | undefined {
  let start = timeline.length
  while (start > 0 && timeline[start - 1].mark === 'out') start -= 1
  return timeline[start]?.month
}

// 회원 한 분: 들어온 달·그만둔 달·쉬는 달 (SPEC-010 8절)
// - 들어온 달 = 나온 해들을 차례로 보며 처음 "/"·"-"가 아닌 칸의 달. 그런 칸이 없으면 처음 나온 해 1월
// - 그만둔 달 = 끝쪽에 이어진 "-" 칸이 시작되는 달(마지막 해 줄이 모두 "-"면 그 해 1월),
//   없으면 마지막으로 나온 해의 다음 해 1월(마지막 해에 있으면 그만두지 않음)
// - 쉬는 달 = 들어온 달과 그만둔 달 사이의 "/" 칸
function memberOf(name: string, appearances: readonly Appearance[], lastYear: number, startYear: number): MemberDraft {
  const timeline = timelineOf(appearances)
  const last = appearances[appearances.length - 1]
  const joined = timeline.find(({ mark }) => mark === 'other')?.month ?? yearMonth(appearances[0].year, 1)
  const left = trailingOutMonth(timeline) ?? (last.year < lastYear ? yearMonth(last.year + 1, 1) : undefined)
  const off = timeline.flatMap(({ month, mark }) =>
    mark === 'off' && month >= joined && (left === undefined || month < left) ? [month] : [],
  )

  const member: MemberDraft = { name, joined, off }
  if (left !== undefined) member.left = left
  const startRow = appearances.find((appearance) => appearance.year === startYear)?.row
  const opening = startRow ? openingOf(startRow.unpaid) : undefined
  if (opening !== undefined) member.opening = opening
  return member
}

// 회비내역 시트들(해 오름차순)에서 회원을 모은다. 같은 이름 = 같은 회원, 처음 나온 순서.
// 미수합계는 회비 표 시작 해(startYear) 시트의 값만 쓴다
export function collectMembers(sheets: readonly { year: number; rows: readonly DuesSheetRow[] }[], startYear: number): MemberDraft[] {
  const byName = new Map<string, Appearance[]>()
  for (const { year, rows } of sheets) {
    for (const row of rows) {
      const appearances = byName.get(row.name) ?? []
      // 한 시트에 같은 이름이 두 줄이면 첫 줄만
      if (appearances.at(-1)?.year !== year) appearances.push({ year, row })
      byName.set(row.name, appearances)
    }
  }
  const lastYear = Math.max(...sheets.map((sheet) => sheet.year))
  return [...byName].map(([name, appearances]) => memberOf(name, appearances, lastYear, startYear))
}
