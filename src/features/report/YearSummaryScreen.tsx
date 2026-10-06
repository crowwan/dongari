import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { yearReport } from '../../domain/report'
import type { Ledger } from '../../domain/types'
import { BackToLedger } from '../BackToLedger'
import { pictureSaver, yearPictureName, type PictureSaver } from './savePicture'
import { SavePictureBar } from './SavePictureBar'
import { SHEET_WIDTH } from './sheet/sheetStyles'
import { YearReportSheet } from './sheet/YearReportSheet'
import { useSavePicture } from './useSavePicture'
import './report.css'

type YearSummaryScreenProps = {
  year: number
  // 고른 연도 장부. 아직 없으면 기록 없음과 같다
  ledger: Ledger | undefined
  onBack: () => void
  // [사진으로 저장] 결과 알림
  onNotify: (message: string) => void
  // 사진 만들기·내려받기 (테스트는 가짜를 넣는다)
  saver?: PictureSaver
}

type FitStyle = CSSProperties & { '--fit-scale': string }

// 고정 폭(v1 360px) 양식을 화면 폭에 맞춰 줄이거나 키워 보인다. 가로로 넘치지 않고, 더 크게 보려면 두 손가락으로 확대(브라우저 기본).
// transform 은 자리를 줄이지 않으므로 바깥 높이를 줄인 높이로 맞춘다. 사진은 target 을 줄이지 않은 크기로 그린다 (report.css)
function FitToWidth({ targetRef, children }: { targetRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<{ scale: number; height?: number }>({ scale: 1 })

  useLayoutEffect(() => {
    const frame = frameRef.current
    const target = targetRef.current
    // ResizeObserver 가 없는 환경(테스트)에서는 원래 크기 그대로
    if (!frame || !target || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const scale = frame.clientWidth / SHEET_WIDTH
      setFit({ scale, height: target.offsetHeight * scale })
    })
    observer.observe(frame)
    observer.observe(target)
    return () => observer.disconnect()
  }, [targetRef])

  const targetStyle: FitStyle = { '--fit-scale': String(fit.scale) }
  return (
    <div className="year-fit" ref={frameRef} style={{ height: fit.height }}>
      <div className="year-fit__target" ref={targetRef} style={targetStyle} data-testid="year-report-capture">
        {children}
      </div>
    </div>
  )
}

// 올해 결산 (SPEC-003): v1 연말 양식 한 장을 화면 폭에 맞춰 보이고 아래 고정 [사진으로 저장]. 기록이 없으면 안내만, 저장 비활성 (AC-5)
export function YearSummaryScreen({ year, ledger, onBack, onNotify, saver = pictureSaver }: YearSummaryScreenProps) {
  const { targetRef, saving, save } = useSavePicture({ fileName: yearPictureName(year), saver, onNotify })
  // 기록이 하나라도 있어야 결산을 만든다
  const report = ledger && ledger.entries.length > 0 ? yearReport(ledger) : undefined

  return (
    <div className="screen report" data-testid="year-summary-screen">
      <BackToLedger onBack={onBack} />
      <h1 className="screen__title">{year}년 결산</h1>
      {report ? (
        <>
          <p className="screen__note">두 손가락으로 벌리면 크게 볼 수 있어요</p>
          <FitToWidth targetRef={targetRef}>
            <YearReportSheet report={report} />
          </FitToWidth>
        </>
      ) : (
        <p className="report__empty">적은 내역이 있어야 결산을 만들 수 있어요</p>
      )}
      <SavePictureBar saving={saving} onSave={save} disabled={!report} />
    </div>
  )
}
