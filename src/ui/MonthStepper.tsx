import './ui.css'

type MonthStepperProps = {
  // 보고 있는 달 (1~12)
  month: number
  onPrevious: () => void
  onNext: () => void
  // 더 갈 곳이 없는 쪽 (예: 1월의 이전 달, 12월의 다음 달)
  previousDisabled?: boolean
  nextDisabled?: boolean
}

// 한 달씩 넘겨 보는 줄: [‹] 9월 [›] (ADR 003). 화살표는 글자 대신 "이전 달"/"다음 달" 이름으로 읽힌다
export function MonthStepper({ month, onPrevious, onNext, previousDisabled, nextDisabled }: MonthStepperProps) {
  return (
    <div className="ui-stepper" data-testid="month-stepper">
      <button
        type="button"
        className="ui-stepper__arrow"
        aria-label="이전 달"
        disabled={previousDisabled}
        onClick={onPrevious}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <p className="ui-stepper__label" aria-live="polite" data-testid="month-stepper-label">
        {month}월
      </p>
      <button type="button" className="ui-stepper__arrow" aria-label="다음 달" disabled={nextDisabled} onClick={onNext}>
        <span aria-hidden="true">›</span>
      </button>
    </div>
  )
}
