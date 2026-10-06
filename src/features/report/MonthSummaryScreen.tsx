import { BackToLedger } from '../BackToLedger'
import '../screens.css'

type MonthSummaryScreenProps = {
  year: number
  month: number
  onBack: () => void
}

// 월 정리 자리 (SPEC-003). 그 달 수입·지출 정리와 [사진으로 보내기] 는 #16 에서 채운다
export function MonthSummaryScreen({ year, month, onBack }: MonthSummaryScreenProps) {
  return (
    <div className="screen" data-testid="month-summary-screen" data-month={month}>
      <BackToLedger onBack={onBack} />
      <h1 className="screen__title">
        {year}년 {month}월 정리
      </h1>
      <p className="screen__lead">{month}월 수입·지출 정리는 곧 볼 수 있어요.</p>
    </div>
  )
}
