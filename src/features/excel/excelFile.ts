// 고른 파일 판별과 읽기 (SPEC-010 8절 "예외와 경계 상황", AC-29). 안내 문구는 #166 확인 화면이 정한다
import type { EntryDeps } from '../../domain/ledger'
import { readBackup } from '../../storage/backup'
import { readExcelBook, type ExcelImportSummary, type ImportedBook } from './readExcelBook'
import { readWorkbook } from './sheetjs'

// 엑셀 파일 크기 상한 (SPEC-010 "파일이 너무 커요(5MB 까지)")
export const EXCEL_FILE_MAX_BYTES = 5 * 1024 * 1024

// 읽지 못한 이유
// - too-large: 5MB 넘음 (읽기 전에 본다)
// - backup-file: 앱 기록 파일 (.txt 이거나 내용이 기록 파일) → 기록 파일 불러오기로 안내
// - not-excel: 엑셀이 아니거나 깨졌다
// - no-sheets: 읽을 수 있는 입출금내역 시트(2013 이후 "YYYY년 입출금내역")가 없다
export type ExcelFileProblem = 'too-large' | 'backup-file' | 'not-excel' | 'no-sheets'

export type ExcelFileRead = { ok: true; book: ImportedBook; summary: ExcelImportSummary } | { ok: false; problem: ExcelFileProblem }

// 폰 파일 고르기가 준 파일 (File 그대로, 테스트는 같은 모양의 객체)
export type PickedFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>

// .xlsx(zip) / .xls(옛 형식, 복합 문서) 파일 머리
const EXCEL_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
]

export function isExcelBytes(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 8))
  return EXCEL_SIGNATURES.some((signature) => signature.every((byte, index) => head[index] === byte))
}

// 내용이 기록 파일인가: 읽히거나, 새 버전 앱이 만든 기록 파일
function isBackupText(bytes: ArrayBuffer): boolean {
  const result = readBackup(new TextDecoder().decode(bytes))
  return result.ok || result.reason === 'newer-version'
}

// 고른 파일을 판별하고 엑셀이면 읽는다. 크기 → 기록 파일 → 엑셀 머리 → SheetJS 읽기 → 읽을 시트 순서.
// 아무것도 저장하지 않는다 (저장은 확인 화면의 [새 장부 만들기], #166)
export async function readExcelFile(file: PickedFile, deps: EntryDeps): Promise<ExcelFileRead> {
  if (file.size > EXCEL_FILE_MAX_BYTES) return { ok: false, problem: 'too-large' }
  if (file.name.toLowerCase().endsWith('.txt')) return { ok: false, problem: 'backup-file' }
  const bytes = await file.arrayBuffer()
  if (!isExcelBytes(bytes)) return { ok: false, problem: isBackupText(bytes) ? 'backup-file' : 'not-excel' }

  // 머리는 엑셀인데 SheetJS 가 못 읽으면 깨진 파일
  const workbook = await readWorkbook(bytes).catch(() => undefined)
  if (!workbook) return { ok: false, problem: 'not-excel' }
  const read = readExcelBook(workbook, deps)
  return read.ok ? read : { ok: false, problem: read.problem }
}
