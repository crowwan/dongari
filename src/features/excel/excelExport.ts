// 엑셀 파일 만들기 (SPEC-010 9절, #167). 이 파일은 엑셀 조각이다: 설정 [엑셀 파일로 내보내기]를 누를 때 useExcelExport 가
// 동적 import 로 받는다 (내보내기 규칙이 첫 화면 파일에 들어가지 않게). SheetJS 는 그 안에서 어댑터가 또 동적 import 로 받는다
import type { Book } from '../../domain/types'
import { exportBook, exportContents } from './exportBook'
import { SheetJsLoadError, writeWorkbook, XLSX_MIME } from './sheetjs'

// load-failed: 엑셀 라이브러리를 받지 못함(파일 탓이 아님, 불러오기와 같은 안내) / failed: 그 밖에 파일을 만들지 못함
export type ExcelFileMade =
  | { ok: true; file: File; contents: { years: string; sheets: string } }
  | { ok: false; problem: 'load-failed' | 'failed' }

// 던지지 않는다: SheetJS 를 받지 못한 것만 load-failed, 시트 만들기·파일 쓰기 오류는 failed (#180 리뷰)
export async function makeExcelFile(book: Book, today: Date): Promise<ExcelFileMade> {
  try {
    const exported = exportBook(book, today)
    const blob = await writeWorkbook(exported.sheets)
    return { ok: true, file: new File([blob], exported.fileName, { type: XLSX_MIME }), contents: exportContents(exported) }
  } catch (error) {
    return { ok: false, problem: error instanceof SheetJsLoadError ? 'load-failed' : 'failed' }
  }
}
