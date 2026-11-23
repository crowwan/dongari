import { useState } from 'react'
import { MonthPicker } from './MonthPicker'
import { YearStepper } from './YearStepper'
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
  // 고를 수 있는 첫 달: 그 해의 그 달 전은 누를 수 없다 ("언제까지 쉬나요?", SPEC-010 5절 #163). 고른 값이 없으면 이 해부터 보여 준다
  min?: YearAndMonth
}

// 해·달 고르기 (선택 창 BottomSheet 안): 해 넘기기 [‹] 2026년 [›] + 열두 달. 달을 누르면 보고 있는 해의 그 달.
// 들어온 달·그만둔 달·회비 표 시작 달 (SPEC-010 6절), 쉬는 끝 달 (5절). 해 넘기기는 YearStepper(창 안이라 화살표는 회색 면)
export function YearMonthPicker({ value, onChange, firstYear, lastYear, current, min }: YearMonthPickerProps) {
  // 넘겨 볼 수 있는 첫 해: min 이 있으면 그 해 전으로는 가지 않는다 (리뷰 #177)
  const lowestYear = Math.max(firstYear, min?.year ?? firstYear)
  const startYear = value?.year ?? min?.year ?? current?.year ?? lastYear
  const [shownYear, setShownYear] = useState(Math.min(Math.max(startYear, lowestYear), lastYear))
  // 보고 있는 해의 고를 수 있는 첫 달: min 의 해면 그 달, 그 전 해(마지막 해가 min 보다 이를 때)면 모두 막는다(13)
  const firstMonth = min === undefined || shownYear > min.year ? undefined : shownYear === min.year ? min.month : 13

  return (
    <div className="ui-year-month" data-testid="year-month-picker">
      <YearStepper
        label={`${shownYear}년`}
        onPrevious={() => setShownYear(shownYear - 1)}
        onNext={() => setShownYear(shownYear + 1)}
        previousDisabled={shownYear <= lowestYear}
        nextDisabled={shownYear >= lastYear}
      />
      <MonthPicker
        value={value?.year === shownYear ? value.month : null}
        currentMonth={current?.year === shownYear ? current.month : undefined}
        firstMonth={firstMonth}
        onChange={(month) => onChange(shownYear, month)}
      />
    </div>
  )
}
