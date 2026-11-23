import { useState } from 'react'
import { Icon } from './Icon'
import { MonthPicker } from './MonthPicker'
import './ui.css'

type YearAndMonth = { year: number; month: number }

type YearMonthPickerProps = {
  // 고른 해·달. 아직 없으면 null
  value: YearAndMonth | null
  onChange: (year: number, month: number) => void
  // 넘겨 볼 수 있는 해 (처음·마지막)
  firstYear: number
  lastYear: number
  // 이번 달 (그 해를 볼 때 테두리). 고른 값이 없으면 이 해부터 보여 준다
  current?: YearAndMonth
}

// 해·달 고르기 (선택 창 BottomSheet 안): 해 넘기기 [‹] 2026년 [›] + 열두 달. 달을 누르면 보고 있는 해의 그 달.
// 들어온 달·그만둔 달·회비 표 시작 달 (SPEC-010 6절). 해 넘기기는 MonthStepper 와 같은 모양(창 안이라 화살표는 회색 면)
export function YearMonthPicker({ value, onChange, firstYear, lastYear, current }: YearMonthPickerProps) {
  const startYear = value?.year ?? current?.year ?? lastYear
  const [shownYear, setShownYear] = useState(Math.min(Math.max(startYear, firstYear), lastYear))

  return (
    <div className="ui-year-month" data-testid="year-month-picker">
      <div className="ui-stepper">
        <button
          type="button"
          className="ui-stepper__arrow"
          aria-label="이전 해"
          disabled={shownYear <= firstYear}
          onClick={() => setShownYear(shownYear - 1)}
        >
          <Icon name="left" />
        </button>
        <span className="ui-stepper__label" aria-live="polite" data-testid="year-month-picker-year">
          {shownYear}년
        </span>
        <button
          type="button"
          className="ui-stepper__arrow"
          aria-label="다음 해"
          disabled={shownYear >= lastYear}
          onClick={() => setShownYear(shownYear + 1)}
        >
          <Icon name="right" />
        </button>
      </div>
      <MonthPicker
        value={value?.year === shownYear ? value.month : null}
        currentMonth={current?.year === shownYear ? current.month : undefined}
        onChange={(month) => onChange(shownYear, month)}
      />
    </div>
  )
}
