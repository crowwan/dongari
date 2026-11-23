// 엑셀 읽기 테스트가 같이 쓰는 지어낸 표 (SPEC-010 8절). 이모 엑셀의 칸 배치만 흉내 낸다.
// 레포가 공개라 실제 엑셀·실제 이름은 넣지 않는다 — 이름은 모두 지어낸 것
import type { ExcelWorkbook, SheetCell, SheetData, SheetMerge } from '../features/excel/sheet'

// 입출금내역 한 줄: [월, 일, 입금, 내용, 출금] + 잔액(없으면 위에서부터 계산해 채움)
export type LedgerRow = readonly [SheetCell, SheetCell, SheetCell, SheetCell, SheetCell, SheetCell?]

export function merge(r1: number, c1: number, r2: number, c2: number): SheetMerge {
  return { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } }
}

function amountOf(cell: SheetCell): number {
  return typeof cell === 'number' ? cell : 0
}

// 입출금내역 시트: 1행 제목(A~F 병합) / 2행 머리 [월, 일, 입금, (빈칸), 출금, 잔액] / 3행 "YYYY−1년 이월금"(A~E 병합) + 잔액 /
// 4행부터 기록. 잔액 칸은 엑셀처럼 이월금 + 입금 − 출금을 줄마다 이어 계산한다(줄에 잔액을 주면 그 값을 쓴다)
export function ledgerSheet(
  year: number,
  carryover: SheetCell,
  records: readonly LedgerRow[],
  name = `${year}년 입출금내역`,
): SheetData {
  let balance = amountOf(carryover)
  const recordRows = records.map(([month, day, income, content, expense, written]): SheetCell[] => {
    balance += amountOf(income) - amountOf(expense)
    return [month, day, income, content, expense, written === undefined ? balance : written]
  })
  return {
    name,
    rows: [
      [`${year}년 지어낸모임 입출금 내역`, null, null, null, null, null],
      ['월', '일', '입금', null, '출금', '잔액'],
      [`${year - 1}년 이월금`, null, null, null, null, carryover],
      ...recordRows,
    ],
    merges: [merge(0, 0, 0, 5), merge(2, 0, 2, 4)],
  }
}

// 입출금내역 시트의 기록 줄 번호(0부터). 4행 = 2
export const FIRST_RECORD_ROW = 3

// 회비내역 한 줄: [번호, 이름, 1월 … 12월] + 12월 뒤 칸들(해별 미수 열 차례, 그다음 미수합계)
export type DuesRow = readonly SheetCell[]

export interface DuesSheetOptions {
  notice?: boolean // 제목 아래 안내 줄(자동이체 계좌 — 지어낸 값). 기본 있음, 2013년 모양은 없음
  pastYears?: readonly number[] // 12월 뒤 해별 미수 열 ("2016년", "2015년" …)
  unpaidColumn?: boolean // 맨 뒤 "미수합계" 열
  exported?: boolean // 앱이 내보낸 모양(SPEC-010 9절): 2행 머리 [번호, 이름, 1월 … 12월, 낸 돈, 덜 낸 돈]
}

const MONTH_HEADERS = Array.from({ length: 12 }, (_, index) => `${index + 1}월`)

// 회비내역 시트. ○ 는 숫자 0 에 "○" 모양 서식이 걸린 칸이라 숫자 0 으로 둔다
// - 이모 엑셀 모양(기본): 1행 제목(A~N 병합) / 2행 안내 글(병합, 해에 따라 없음) / 머리 [빈칸, 빈칸, 1월 … 12월, (해별 미수…), (미수합계)]
//   — 번호·이름 머리 글자가 없다 / 그 아래 회원 [번호, 이름, 달 칸…]
// - 앱이 내보낸 모양(exported): 1행 제목 / 2행 머리 [번호, 이름, 1월 … 12월, 낸 돈, 덜 낸 돈] / 3행부터 회원
export function duesSheet(year: number, rows: readonly DuesRow[], options: DuesSheetOptions = {}): SheetData {
  const { notice = true, pastYears = [], unpaidColumn = false, exported = false } = options
  const extraHeaders: SheetCell[] = exported ? ['낸 돈', '덜 낸 돈'] : [...pastYears.map((past) => `${past}년`), ...(unpaidColumn ? ['미수합계'] : [])]
  const header: SheetCell[] = [exported ? '번호' : null, exported ? '이름' : null, ...MONTH_HEADERS, ...extraHeaders]
  const members = rows.map((row) => {
    const [no, name, ...rest] = row
    const monthCells = Array.from({ length: 12 }, (_, index) => rest[index] ?? null)
    const extras = extraHeaders.map((_, index) => rest[12 + index] ?? null)
    return [no, name, ...monthCells, ...extras]
  })
  const title: SheetCell[] = [`${year}년 지어낸모임 회비 `]
  const noticeRows: SheetCell[][] = notice && !exported ? [[...Array<SheetCell>(9).fill(null), '자동이체 계좌 안내: 000-000-000000']] : []
  return {
    name: `${year}년 회비내역`,
    rows: [title, ...noticeRows, header, ...members],
    merges: [merge(0, 0, 0, 13), ...(noticeRows.length > 0 ? [merge(1, 9, 1, 13)] : [])],
  }
}

// 12칸을 한 값으로 채운 회비내역 달 칸
export function months(fill: SheetCell, overrides: Readonly<Record<number, SheetCell>> = {}): SheetCell[] {
  return Array.from({ length: 12 }, (_, index) => overrides[index + 1] ?? fill)
}

export function workbook(...sheets: SheetData[]): ExcelWorkbook {
  return { sheets }
}

// 다른 시트 (연락처 같은 것) — 읽지 않는다
export function otherSheet(name: string): SheetData {
  return { name, rows: [['이름', '전화'], ['강민지', '010-0000-0000']], merges: [] }
}
