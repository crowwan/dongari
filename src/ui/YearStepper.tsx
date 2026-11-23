import { Icon } from './Icon'
import './ui.css'

type YearStepperProps = {
  // 가운데 글자 (예: "2026년", 회비 표 "2026년 회비")
  label: string
  onPrevious: () => void
  onNext: () => void
  // 더 갈 해가 없는 쪽
  previousDisabled?: boolean
  nextDisabled?: boolean
  // 가운데 글자를 화면 제목(h1)으로 그린다 (회비 표, SPEC-010 4절)
  heading?: boolean
}

// 한 해씩 넘기기: [‹] 2026년 [›] — MonthStepper 와 같은 모양(ui-stepper). 화살표는 "이전 해"/"다음 해" 로 읽히고 가운데 글자는 바뀌면 읽어 준다.
// 쓰는 곳: 해·달 고르기(YearMonthPicker, 창 안이라 회색 화살표), 회비 표 해 넘기기(흰 화살표, 제목)
export function YearStepper({ label, onPrevious, onNext, previousDisabled, nextDisabled, heading = false }: YearStepperProps) {
  const Label = heading ? 'h1' : 'span'
  return (
    <div className="ui-stepper" data-testid="year-stepper">
      <button type="button" className="ui-stepper__arrow" aria-label="이전 해" disabled={previousDisabled} onClick={onPrevious}>
        <Icon name="left" />
      </button>
      <Label className="ui-stepper__label" aria-live="polite" data-heading={heading}>
        {label}
      </Label>
      <button type="button" className="ui-stepper__arrow" aria-label="다음 해" disabled={nextDisabled} onClick={onNext}>
        <Icon name="right" />
      </button>
    </div>
  )
}
