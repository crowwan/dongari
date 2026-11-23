// 엑셀 내보내기 선택 창 (SPEC-010 9절, #167): 만드는 중 / 엑셀 파일을 저장했어요 / 엑셀 기능을 받지 못했어요 / 만들지 못했어요.
// 만드는 중·받지 못함은 내보내기 조각을 받기 전에도 보여야 해서 첫 화면 쪽에 둔다
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { EXCEL_EXPORT_WORDS, EXCEL_FIRST_LOAD_NOTE, EXCEL_LOAD_FAILED } from './excelMessages'
import { ExcelFact, ExcelFactValue, ExcelFacts, ExcelNote } from './ExcelParts'
import type { ExcelExportFlow, ExcelExportState } from './useExcelExport'
import './excel.css'

type ExcelExportSheetProps = {
  flow: Pick<ExcelExportFlow, 'state' | 'open' | 'close'>
  onReload: () => void // [앱 다시 열기] (엑셀 기능을 받지 못했을 때)
  inline?: boolean // 카탈로그 견본
}

function titleOf(state: ExcelExportState): string {
  switch (state.step) {
    case 'making':
      return EXCEL_EXPORT_WORDS.making
    case 'saved':
      return EXCEL_EXPORT_WORDS.saved
    case 'load-failed':
      return EXCEL_LOAD_FAILED.title
    case 'failed':
      return EXCEL_EXPORT_WORDS.failed.title
  }
}

export function ExcelExportSheet({ flow: { state, open, close }, onReload, inline = false }: ExcelExportSheetProps) {
  if (!state) return null
  return (
    <BottomSheet open={open} title={titleOf(state)} onClose={close} inline={inline}>
      {/* 만드는 중(바쁨)이 끝나 저장 안내·받지 못함으로 바뀌면 화면 읽기가 바뀐 내용을 읽는다 (창 제목은 이름이 바뀌어도 다시 읽지 않아서) */}
      <div className="excel-export" data-testid="excel-export" data-state={state.step} aria-busy={state.step === 'making'} aria-live="polite">
        <ExcelExportBody state={state} onClose={close} onReload={onReload} />
      </div>
    </BottomSheet>
  )
}

function ExcelExportBody({ state, onClose, onReload }: { state: ExcelExportState; onClose: () => void; onReload: () => void }) {
  switch (state.step) {
    case 'making':
      return <p className="screen__note">{EXCEL_FIRST_LOAD_NOTE}</p>
    case 'saved':
      // 갤럭시처럼 .xlsx 를 보내기 창에 넣지 않는 폰: 다운로드 폴더에 저장했다고 알리고 카톡으로 보내는 길을 알린다 (시안 F)
      return (
        <>
          <ExcelFacts label="저장한 파일" variant="sheet">
            <ExcelFact label="어디에">
              <ExcelFactValue main={EXCEL_EXPORT_WORDS.where.main} sub={EXCEL_EXPORT_WORDS.where.sub} />
            </ExcelFact>
            <ExcelFact label="파일">
              <ExcelFactValue main={state.fileName} />
            </ExcelFact>
            <ExcelFact label="담긴 것">
              <ExcelFactValue main={state.years} sub={state.sheets} />
            </ExcelFact>
          </ExcelFacts>
          <ExcelNote tone="info" title={EXCEL_EXPORT_WORDS.kakao.title}>
            {EXCEL_EXPORT_WORDS.kakao.description}
          </ExcelNote>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </>
      )
    case 'load-failed':
      // 불러오기(#166)와 같은 안내. 실패한 동적 import 는 다시 불러도 남을 수 있어 앱을 다시 연다
      return (
        <>
          <p className="excel__lead">{EXCEL_LOAD_FAILED.description}</p>
          <Button icon="refresh" onClick={onReload}>
            앱 다시 열기
          </Button>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </>
      )
    case 'failed':
      return (
        <>
          <p className="excel__lead">{EXCEL_EXPORT_WORDS.failed.description}</p>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </>
      )
  }
}
