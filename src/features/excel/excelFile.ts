// 고른 파일 판별과 읽기 (SPEC-010 8절 "예외와 경계 상황", AC-29). 안내 문구는 excelMessages (#166)
import type { EntryDeps } from '../../domain/ledger'
import { readBackup } from '../../storage/backup'
import { practiceWorkbook } from '../practice/practiceExcel'
import { isExcelBytes } from './excelBytes'
import { readExcelBook, type ExcelImportSummary, type ImportedBook } from './readExcelBook'
import type { ExcelWorkbook } from './sheet'
import { readWorkbook, SheetJsLoadError } from './sheetjs'
import type { ExcelSource } from './useExcelImport'

// 엑셀 파일 크기 상한 (SPEC-010 "파일이 너무 커요(5MB 까지)")
export const EXCEL_FILE_MAX_BYTES = 5 * 1024 * 1024

// 읽지 못한 이유
// - too-large: 5MB 넘음 (읽기 전에 본다)
// - backup-file: 앱 기록 파일 (.txt 이거나 내용이 기록 파일) → 기록 파일 불러오기로 안내
// - not-excel: 엑셀이 아니거나 깨졌다
// - load-failed: 파일은 멀쩡할 수 있는데 엑셀 라이브러리를 받지 못했다(오프라인·서비스 워커가 아직 못 받음·배포 뒤 옛 조각)
//   → "인터넷에 연결된 뒤 [앱 다시 열기]를 눌러 주세요" (문구는 excelMessages)
// - no-sheets: 읽을 수 있는 입출금내역 시트(2013 이후 "YYYY년 입출금내역")가 없다
export type ExcelFileProblem = 'too-large' | 'backup-file' | 'not-excel' | 'load-failed' | 'no-sheets'

// 읽었으면 시트들도 같이 준다: 확인 화면에서 월 회비를 고치면 같은 시트로 다시 읽는다 (#166)
export type ExcelFileRead =
  | { ok: true; book: ImportedBook; summary: ExcelImportSummary; workbook: ExcelWorkbook }
  | { ok: false; problem: ExcelFileProblem }

// 폰 파일 고르기가 준 파일 (File 그대로, 테스트는 같은 모양의 객체)
export type PickedFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>

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

  const workbook = await workbookOf(bytes)
  if (typeof workbook === 'string') return { ok: false, problem: workbook }
  const read = readExcelBook(workbook, deps)
  return read.ok ? { ...read, workbook } : { ok: false, problem: read.problem }
}

// 고른 파일이나 연습용 엑셀을 읽는다. 연습용 엑셀(SPEC-010 10절)은 시트 배열이라 파일 판별·SheetJS 없이 읽는 규칙만 돈다
export async function readExcelSource(source: ExcelSource, deps: EntryDeps): Promise<ExcelFileRead> {
  if ('file' in source) return readExcelFile(source.file, deps)
  const workbook = practiceWorkbook(source.practice, deps.now())
  const read = readExcelBook(workbook, deps)
  return read.ok ? { ...read, workbook } : { ok: false, problem: read.problem }
}

// 라이브러리를 받지 못했으면 load-failed, 머리는 엑셀인데 SheetJS 가 못 읽으면 깨진 파일(not-excel)
async function workbookOf(bytes: ArrayBuffer): Promise<ExcelWorkbook | 'load-failed' | 'not-excel'> {
  try {
    return await readWorkbook(bytes)
  } catch (error) {
    return error instanceof SheetJsLoadError ? 'load-failed' : 'not-excel'
  }
}
