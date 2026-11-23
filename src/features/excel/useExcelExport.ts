// 엑셀 내보내기 흐름 (SPEC-010 9절 "넘기기", #167). 첫 화면 쪽이라 가볍게 두고, 파일을 만드는 코드(excelExport·SheetJS)는
// 누를 때 동적 import 로 받는다. 선택 창 하나가 만드는 중 → (내려받았으면) 저장 안내 / 받지 못함 / 만들지 못함으로 바뀐다.
// 파일 공유가 되는 폰은 보내기 창(그동안 이 창은 "만드는 중"), 안 되면 다운로드 폴더로 내려받는다(features/backup/sendFile)
import { useRef, useState } from 'react'
import type { Book } from '../../domain/types'
import { sendFile, type ShareApi } from '../backup/sendFile'
import type { SheetHistory } from '../useScreenHistory'
import type { ExcelFileMade } from './excelExport'
import { EXCEL_EXPORT_WORDS } from './excelMessages'

// 설정 위 선택 창 칸 이름 (뒤로 버튼은 창만 닫는다)
export const EXCEL_EXPORT_SHEET = 'settings-excel-export'

export type ExcelExportState =
  | { step: 'making' }
  | { step: 'saved'; fileName: string; years: string; sheets: string }
  | { step: 'load-failed' }
  | { step: 'failed' }

export interface ExcelExportFlow {
  start: () => void // [엑셀 파일로 내보내기]
  state: ExcelExportState | undefined
  open: boolean // 선택 창이 떠 있다
  close: () => void // [닫기]·바깥 누르기·Esc. 만드는 중이면 그만둔다(보내기·내려받기를 하지 않음)
}

interface ExcelExportOptions {
  book: Book | undefined // 지금 장부
  now: () => Date // 파일 이름 날짜·덜 낸 돈 기준 달
  sheets: Pick<SheetHistory, 'sheet' | 'openSheet' | 'closeSheet'>
  onSent: (message: string) => void // 보내기 창으로 보냈다 (알림 문구)
  // 브라우저 공유·내려받기 (기본은 지금 브라우저, 테스트에서 바꿔 넣는다)
  share?: ShareApi
  download?: (file: File) => void
}

async function makeFile(book: Book, today: Date): Promise<ExcelFileMade> {
  try {
    const { makeExcelFile } = await import('./excelExport')
    return await makeExcelFile(book, today)
  } catch {
    // 내보내기 조각을 받지 못함 (오프라인인데 서비스 워커가 아직 못 받음, 배포 뒤 옛 조각 주소가 사라짐)
    return { ok: false, problem: 'load-failed' }
  }
}

export function useExcelExport({ book, now, sheets, onSent, share, download }: ExcelExportOptions): ExcelExportFlow {
  const [state, setState] = useState<ExcelExportState>()
  // 지금 진행 중인 내보내기 번호. 창을 닫거나 다시 누르면 바뀌어, 늦게 끝난 앞의 내보내기는 아무것도 하지 않는다
  const run = useRef(0)

  function abandon() {
    run.current += 1
  }

  async function exportNow(target: Book, id: number) {
    const made = await makeFile(target, now())
    if (run.current !== id) return
    if (!made.ok) {
      setState({ step: made.problem })
      return
    }
    const result = await sendFile(made.file, share, download)
    if (run.current !== id) return
    if (result === 'downloaded') {
      setState({ step: 'saved', fileName: made.file.name, ...made.contents })
      return
    }
    // 보냈거나 보내기 창을 그냥 닫았으면 이 창도 닫는다 (그냥 닫았으면 알리지 않는다)
    abandon()
    sheets.closeSheet()
    if (result === 'shared') onSent(EXCEL_EXPORT_WORDS.sent)
  }

  return {
    start: () => {
      if (!book) return
      abandon()
      const id = run.current
      setState({ step: 'making' })
      sheets.openSheet(EXCEL_EXPORT_SHEET, abandon)
      void exportNow(book, id)
    },
    state,
    open: sheets.sheet === EXCEL_EXPORT_SHEET,
    close: () => {
      abandon()
      sheets.closeSheet()
    },
  }
}
