import { Icon } from './Icon'
import './ui.css'

type MonthStepperProps = {
  // 보고 있는 달 (1~12)
  month: number
  onPrevious: () => void
  onNext: () => void
  // 더 갈 곳이 없는 쪽 (예: 1월의 이전 달, 12월의 다음 달)
  previousDisabled?: boolean
  nextDisabled?: boolean
  // 주면 가운데 달(▾)이 버튼이 되어 열두 달 선택 창을 연다
  onPickMonth?: () => void
}

// 한 달씩 넘겨 보는 줄: [‹] 9월 ▾ [›] (ADR 003·004). 화살표는 글자 대신 "이전 달"/"다음 달" 이름으로 읽힌다
export function MonthStepper({ month, onPrevious, onNext, previousDisabled, nextDisabled, onPickMonth }: MonthStepperProps) {
  const label = (
    <span className="ui-stepper__label" aria-live="polite" data-testid="month-stepper-label">
      {month}월
    </span>
  )

  return (
    <div className="ui-stepper" data-testid="month-stepper">
      <button
        type="button"
        className="ui-stepper__arrow"
        aria-label="이전 달"
        disabled={previousDisabled}
        onClick={onPrevious}
      >
        <Icon name="left" />
      </button>
      {onPickMonth ? (
        <button type="button" className="ui-stepper__pick" aria-haspopup="dialog" onClick={onPickMonth}>
          {label}
          {/* 달과 띄어 읽히게 ("10월 달 고르기") */}{' '}
          <span className="ui-visually-hidden">달 고르기</span>
          <Icon name="down" />
        </button>
      ) : (
        label
      )}
      <button type="button" className="ui-stepper__arrow" aria-label="다음 달" disabled={nextDisabled} onClick={onNext}>
        <Icon name="right" />
      </button>
    </div>
  )
}
