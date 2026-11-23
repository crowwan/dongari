// 엑셀 불러오기 화면의 "읽는 중"·"읽지 못함" 모습 (SPEC-010 8절, #166).
// 엑셀 조각(ExcelImportScreen)을 받는 동안·받지 못했을 때도 보여야 해서 첫 화면 쪽에 둔다 (엑셀 읽기 코드를 부르지 않는다)
import { BottomActionBar } from '../../ui/BottomActionBar'
import { BackToLedger } from '../BackToLedger'
import type { ExcelFileProblem } from './excelFile'
import { EXCEL_READING_TITLE, excelProblemMessage, type BackupFileRoute } from './excelMessages'
import './excel.css'

// 엑셀 파일 고르기 칸에서 받는 형식 (폰 파일 고르기가 이 형식만 보여 준다)
export const EXCEL_FILE_ACCEPT =
  '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'

type ExcelReadingProps = {
  fileName: string
  onBack: () => void
}

// 읽는 중 (라이브러리를 처음 받는 시간 포함). [‹ 장부로] 로 떠나면 읽기를 버린다
export function ExcelReading({ fileName, onBack }: ExcelReadingProps) {
  return (
    <div className="screen screen--stack excel" data-testid="excel-reading" aria-busy="true">
      <div className="excel__head">
        <BackToLedger onBack={onBack} />
        <h1 className="screen__title">{EXCEL_READING_TITLE}</h1>
      </div>
      <p className="excel__file">{fileName}</p>
      <p className="screen__note">처음 한 번은 엑셀 기능을 받느라 조금 더 걸려요</p>
    </div>
  )
}

type ExcelProblemProps = {
  problem: ExcelFileProblem
  route: BackupFileRoute // 기록 파일을 골랐을 때 안내할 [기록 파일 불러오기] 자리
  onBack: () => void
  onPickAgain: () => void // [파일 다시 고르기]
  onReload: () => void // [앱 다시 열기] (엑셀 기능을 받지 못했을 때)
}

// 읽지 못함: 제목에 무슨 일인지, 아래 한 줄에 다음에 할 일. 장부는 그대로다 (AC-29).
// 주 버튼은 [파일 다시 고르기]. 엑셀 기능을 받지 못했으면 같은 주소로 다시 받아도 실패가 남을 수 있어(브라우저가 실패한
// 동적 import 를 기억) 파일을 다시 고르는 대신 [앱 다시 열기](새로고침)를 준다 (#178 리뷰)
export function ExcelProblem({ problem, route, onBack, onPickAgain, onReload }: ExcelProblemProps) {
  const message = excelProblemMessage(problem, route)
  return (
    <div className="screen screen--stack excel" data-testid="excel-problem" data-state={problem}>
      <div className="excel__head">
        <BackToLedger onBack={onBack} />
        <h1 className="screen__title">{message.title}</h1>
      </div>
      <p className="excel__lead">{message.description}</p>
      {problem === 'load-failed' ? (
        <BottomActionBar label="앱 다시 열기" icon="refresh" onClick={onReload} />
      ) : (
        <BottomActionBar label="파일 다시 고르기" icon="excel" onClick={onPickAgain} />
      )}
    </div>
  )
}
