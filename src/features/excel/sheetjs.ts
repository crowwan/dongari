// SheetJS 어댑터 (ADR 009). 앱에서 SheetJS 를 부르는 곳은 여기 하나다.
// 엑셀을 누를 때 동적 import 로 받아 첫 화면 번들에 들어가지 않는다(서비스 워커가 미리 받아 둔다, SPEC-010 AC-35).
// 파일 ↔ "시트 이름 + 2차원 칸 + 병합"(sheet.ts)만 바꾸고, 엑셀을 장부로 읽는 규칙은 SheetJS 를 모르는 순수 함수가 맡는다
import type { CellObject, WorkSheet } from 'xlsx'
import { isRecord } from '../../storage/schema'
import type { ExcelWorkbook, SheetCell, SheetData, SheetMerge, WriteCell, WriteSheet } from './sheet'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// 엑셀 라이브러리 조각을 받지 못함: 오프라인인데 서비스 워커가 아직 못 받았거나, 배포 뒤 옛 조각 주소가 사라짐.
// 파일 탓이 아니라서 "엑셀이 아니에요"와 다르게 안내한다 (#166 "엑셀 기능을 받지 못했어요" + [앱 다시 열기], excelMessages)
export class SheetJsLoadError extends Error {
  constructor(cause: unknown) {
    super('엑셀 라이브러리를 받지 못했어요', { cause })
    this.name = 'SheetJsLoadError'
  }
}

async function loadSheetJs() {
  try {
    return await import('xlsx')
  } catch (error) {
    throw new SheetJsLoadError(error)
  }
}

// 칸 하나: 수식 칸은 계산된 값, 오류 칸은 글자("#REF!" — 금액으로 쓰이지 않게), 참·거짓은 글자, 빈칸은 null.
// 날짜 서식 칸은 엑셀이 날짜를 담는 숫자(일련번호) 그대로다 (cellDates 를 켜지 않음)
function cellValue(cell: unknown): SheetCell {
  if (!isRecord(cell)) return null
  const { t, v, w } = cell
  if (t === 'e') return typeof w === 'string' ? w : '#ERROR'
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return null
}

// 줄 하나. 빈칸이 많은 줄은 뒤쪽 빈칸을 두지 않는다(SheetJS 의 dense 줄 배열은 빈칸 자리가 비어 있다)
function rowValues(row: unknown): SheetCell[] {
  if (!Array.isArray(row)) return []
  const cells: unknown[] = row
  return Array.from(cells, cellValue)
}

function isCellAddress(value: unknown): value is { r: number; c: number } {
  return isRecord(value) && typeof value.r === 'number' && typeof value.c === 'number'
}

function mergesOf(value: unknown): SheetMerge[] {
  if (!Array.isArray(value)) return []
  const ranges: unknown[] = value
  return ranges.flatMap((range) =>
    isRecord(range) && isCellAddress(range.s) && isCellAddress(range.e)
      ? [{ s: { r: range.s.r, c: range.s.c }, e: { r: range.e.r, c: range.e.c } }]
      : [],
  )
}

function sheetData(name: string, sheet: WorkSheet | undefined): SheetData {
  const data: unknown = sheet?.['!data']
  const rows: unknown[] = Array.isArray(data) ? data : []
  return { name, rows: Array.from(rows, rowValues), merges: mergesOf(sheet?.['!merges']) }
}

// 파일 바이트(.xlsx·.xls) → 시트들. 라이브러리를 받지 못하면 SheetJsLoadError,
// 엑셀이 아니거나 깨졌으면 SheetJS 오류를 그대로 던진다
export async function readWorkbook(bytes: ArrayBuffer): Promise<ExcelWorkbook> {
  const XLSX = await loadSheetJs()
  // dense: 줄 배열로 받는다(병합 좌표와 같은 0부터 센 줄·열). 수식 글·HTML 은 쓰지 않아 받지 않는다
  const book = XLSX.read(new Uint8Array(bytes), { type: 'array', dense: true, cellFormula: false, cellHTML: false })
  return { sheets: book.SheetNames.map((name) => sheetData(name, book.Sheets[name])) }
}

function writeCell(cell: WriteCell): CellObject | SheetCell {
  if (cell === null || typeof cell !== 'object') return cell
  return { t: 'n', v: cell.value, f: cell.formula }
}

// 시트들 → .xlsx 파일 (#167 내보내기). 서식 없이 값·수식과 계산한 값·병합·열 너비만 (ADR 009)
export async function writeWorkbook(sheets: readonly WriteSheet[]): Promise<Blob> {
  const XLSX = await loadSheetJs()
  const book = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const written = XLSX.utils.aoa_to_sheet(sheet.rows.map((row) => row.map(writeCell)))
    written['!merges'] = sheet.merges.map(({ s, e }) => ({ s: { ...s }, e: { ...e } }))
    written['!cols'] = sheet.columnWidths.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(book, written, sheet.name)
  }
  const out: unknown = XLSX.write(book, { bookType: 'xlsx', type: 'array', compression: true })
  if (!(out instanceof ArrayBuffer)) throw new Error('엑셀 파일을 만들지 못했어요')
  return new Blob([out], { type: XLSX_MIME })
}
