import { BackToLedger } from '../BackToLedger'
import '../screens.css'

type YearSummaryScreenProps = {
  year: number
  onBack: () => void
}

// 올해 결산 자리 (SPEC-003). v1 연말 양식과 [사진으로 보내기] 는 #16 에서 채운다
export function YearSummaryScreen({ year, onBack }: YearSummaryScreenProps) {
  return (
    <div className="screen" data-testid="year-summary-screen">
      <BackToLedger onBack={onBack} />
      <h1 className="screen__title">{year}년 결산</h1>
      <p className="screen__lead">1년 수입·지출 결산은 곧 볼 수 있어요.</p>
    </div>
  )
}
