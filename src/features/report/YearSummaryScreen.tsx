import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref, type RefObject } from 'react'
import type { CarryoverWords } from '../../domain/book'
import { yearReport } from '../../domain/report'
import type { Ledger } from '../../domain/types'
import { SegmentedControl, type SegmentOptions } from '../../ui/SegmentedControl'
import { BackToLedger } from '../BackToLedger'
import { YEAR_GUIDE_TARGET } from '../guide/guideMessages'
import { pictureSaver, yearPictureName, yearSummaryPictureName, type PictureSaver } from './savePicture'
import { SavePictureBar } from './SavePictureBar'
import { SHEET_WIDTH } from './sheet/sheetStyles'
import { YearReportSheet } from './sheet/YearReportSheet'
import { usePictureActions } from './usePictureActions'
import { YearShareSummary } from './YearShareSummary'
import './report.css'

type YearSummaryScreenProps = {
  bookName: string // 요약·결산표 제목의 장부 이름 (SPEC-005)
  carryoverWords: CarryoverWords // 요약 보조 줄·결산표 이월금 자리 이름 (장부 종류별)
  year: number
  // 고른 연도 장부. 아직 없으면 기록 없음과 같다
  ledger: Ledger | undefined
  onBack: () => void
  // [사진으로 저장]·[사진 보내기] 결과 알림
  onNotify: (message: string) => void
  // 사진 만들기·내려받기·공유 창 (테스트는 가짜를 넣는다)
  saver?: PictureSaver
  // 처음 쓰는 분 안내 3번 말풍선이 가리키는 아래 버튼 (SPEC-008, 지금은 [사진으로 저장] — guideMessages YEAR_GUIDE_TARGET)
  guideTargetRef?: Ref<HTMLButtonElement>
}

// 결산 화면에서 볼 것 (v2.6): 단톡방용 요약(큰 글씨 카드 셋) / 결산표(제출용, v1 양식). 둘 다 그대로 사진 한 장이 된다
type YearView = 'summary' | 'sheet'

const YEAR_VIEWS: SegmentOptions<YearView> = [
  { value: 'summary', label: '단톡방용 요약' },
  { value: 'sheet', label: '결산표(제출용)' },
]

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

// 올해 결산 (SPEC-003): 제목 아래 [단톡방용 요약 | 결산표(제출용)] 전환(처음은 요약, v2.6).
// 요약 = 수입·지출·잔액 큰 숫자 + 항목별 합계 카드, 결산표 = v1 연말 양식 한 장을 화면 폭에 맞춰 보인다.
// 두 쪽 모두 아래 고정 [사진으로 저장](+ 공유 창을 쓸 수 있으면 [사진 보내기]) — 지금 보고 있는 쪽을 사진으로.
// 전환은 화면 안 상태라 방문 기록에 쌓지 않는다 — 안드로이드 뒤로 버튼은 어느 쪽에서든 바로 장부로.
// 기록이 없으면 전환 없이 안내만, 아래 버튼 비활성 (AC-5, AC-13)
export function YearSummaryScreen({
  bookName,
  year,
  ledger,
  carryoverWords,
  onBack,
  onNotify,
  saver = pictureSaver,
  guideTargetRef,
}: YearSummaryScreenProps) {
  const [view, setView] = useState<YearView>('summary')
  // 기록이 하나라도 있어야 결산을 만든다
  const report = ledger && ledger.entries.length > 0 ? yearReport(ledger) : undefined
  const { targetRef, busy, saveReady, sendReady, sharesToPhotos, canSend, save, send } = usePictureActions({
    fileName: view === 'summary' ? yearSummaryPictureName(year) : yearPictureName(year),
    saver,
    onNotify,
    enabled: report !== undefined,
  })

  return (
    <div className="screen report" data-testid="year-summary-screen" data-view={view}>
      <BackToLedger onBack={onBack} />
      <h1 className="screen__title">{year}년 결산</h1>
      {report ? (
        <>
          <SegmentedControl label="무엇을 볼까요?" options={YEAR_VIEWS} value={view} onChange={setView} />
          {view === 'summary' ? (
            <>
              <YearShareSummary report={report} bookName={bookName} carryoverWords={carryoverWords} targetRef={targetRef} />
              <p className="screen__note report__photo-note">이 화면 그대로 사진 한 장이 돼요</p>
            </>
          ) : (
            <>
              <p className="screen__note">두 손가락으로 벌리면 크게 볼 수 있어요</p>
              <FitToWidth targetRef={targetRef}>
                <YearReportSheet report={report} bookName={bookName} carryoverLabel={carryoverWords.sheet} />
              </FitToWidth>
            </>
          )}
        </>
      ) : (
        <p className="report__empty">적은 내역이 있어야 결산을 만들 수 있어요</p>
      )}
      <SavePictureBar
        busy={busy}
        saveReady={saveReady}
        sendReady={sendReady}
        sharesToPhotos={sharesToPhotos}
        canSend={canSend}
        onSave={save}
        onSend={send}
        disabled={!report}
        buttonRef={YEAR_GUIDE_TARGET === 'save-picture' ? guideTargetRef : undefined}
      />
    </div>
  )
}
