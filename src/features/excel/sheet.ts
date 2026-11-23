// 엑셀 시트를 SheetJS 없이 다루는 모양 (ADR 009). 어댑터(sheetjs.ts)가 파일을 이 모양으로 바꾸고,
// 읽는 규칙(readExcelBook)과 #167 의 쓰는 규칙은 이 모양만 안다

// 칸 하나의 값: 글자·숫자·빈칸
export type SheetCell = string | number | null

// 칸 위치: 0부터 센 줄(r)·열(c). A1 = { r: 0, c: 0 }
export interface CellAddress {
  r: number
  c: number
}

// 병합 범위: 왼쪽 위(s)부터 오른쪽 아래(e)까지, 끝 칸 포함
export interface SheetMerge {
  s: CellAddress
  e: CellAddress
}

// 읽은 시트 하나. rows[줄][열] 은 A1 부터 채운다(병합 위치와 같은 좌표)
export interface SheetData {
  name: string
  rows: SheetCell[][]
  merges: SheetMerge[]
}

export interface ExcelWorkbook {
  sheets: SheetData[]
}

// 쓰는 칸: 값, 또는 수식과 계산한 값 (미리보기는 수식을 계산하지 않아 값을 같이 쓴다, ADR 009)
export type WriteCell = SheetCell | { formula: string; value: number }

// 쓰는 시트 하나 (#167 내보내기). 열 너비는 글자 수
export interface WriteSheet {
  name: string
  rows: WriteCell[][]
  merges: SheetMerge[]
  columnWidths: number[]
}

export function cellAt(sheet: SheetData, r: number, c: number): SheetCell {
  return sheet.rows[r]?.[c] ?? null
}

// 칸의 글자 (앞뒤 공백 없이). 빈칸은 ''
export function cellText(cell: SheetCell): string {
  if (cell === null) return ''
  return typeof cell === 'number' ? String(cell) : cell.trim()
}

// 띄어쓰기를 모두 뺀 글자: 머리 칸("입 금")·시트 이름(" 2015 년 입출금내역")을 맞춰 볼 때
export function compactText(cell: SheetCell): string {
  return cellText(cell).replace(/\s+/g, '')
}

// 병합 범위 안이지만 왼쪽 위 칸이 아니다 = 값은 왼쪽 위 칸에 있다 (SPEC-010 8절 "병합이면 윗줄의 달")
export function isMergedAway(sheet: SheetData, r: number, c: number): boolean {
  return sheet.merges.some(
    ({ s, e }) => r >= s.r && r <= e.r && c >= s.c && c <= e.c && !(r === s.r && c === s.c),
  )
}

// 줄의 원래 글: 빈칸이 아닌 칸을 띄어 쓴 것 (확인 화면 "날짜를 바꾼 줄"·"읽지 못한 줄" 목록)
export function rowText(row: readonly SheetCell[]): string {
  return row
    .map(cellText)
    .filter((text) => text.length > 0)
    .join(' ')
}
