// 엑셀 불러오기 화면 자리 (SPEC-010 8절, #166). 읽은 내용 확인 화면과 엑셀 읽기 코드는 이 화면을 열 때 동적 import 로 받는다 —
// 정적으로 부르면 첫 화면 파일이 엑셀 읽기 규칙만큼 커진다. 받는 동안은 "읽는 중", 받지 못하면(오프라인인데 서비스 워커가 아직 못 받음 등)
// 엑셀 라이브러리를 받지 못한 것과 같은 안내를 보인다
import { useEffect, useState } from 'react'
import type { ExcelImportScreenProps } from './ExcelImportScreen'
import { EXCEL_PROBLEM_MESSAGES } from './excelMessages'
import { EXCEL_FILE_ACCEPT, ExcelProblem, ExcelReading } from './ExcelStatus'
import type { ExcelImportFlow } from './useExcelImport'

type ScreenModule = typeof import('./ExcelImportScreen')

export function ExcelImportSlot(props: ExcelImportScreenProps) {
  const [loaded, setLoaded] = useState<ScreenModule | 'failed'>()

  useEffect(() => {
    // 화면을 떠났으면 받은 결과를 버린다
    let alive = true
    import('./ExcelImportScreen').then(
      (module) => {
        if (alive) setLoaded(module)
      },
      () => {
        if (alive) setLoaded('failed')
      },
    )
    return () => {
      alive = false
    }
  }, [])

  if (loaded === 'failed') {
    return <ExcelProblem message={EXCEL_PROBLEM_MESSAGES['load-failed']} onBack={props.onBack} onPickAgain={props.onPickAgain} />
  }
  if (!loaded) return <ExcelReading fileName={props.file.name} onBack={props.onBack} />
  return <loaded.ExcelImportScreen {...props} />
}

// 엑셀 파일 고르기 숨은 칸 (입구 세 곳이 같이 쓴다)
export function ExcelFileInput({ flow: { attachFileInput, onFileChosen } }: { flow: ExcelImportFlow }) {
  return (
    <input
      ref={attachFileInput}
      type="file"
      accept={EXCEL_FILE_ACCEPT}
      hidden
      aria-label="엑셀 파일 고르기"
      data-testid="excel-file-input"
      onChange={onFileChosen}
    />
  )
}
