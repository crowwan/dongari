import './ui.css'

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

type MonthPickerProps = {
  // 고른 달 (1~12). 아직 없으면 null
  value: number | null
  // 이번 달 (테두리로 표시). 올해 장부가 아니면 주지 않는다
  currentMonth?: number
  // 고를 수 있는 첫 달: 그 전 달은 누를 수 없다 (면 없이 점선, YearMonthPicker min)
  firstMonth?: number
  onChange: (month: number) => void
}

// 열두 달 고르기: 3열 × 4행. 고른 달은 청록 채움 + 굵게, 이번 달은 청록 테두리 (선택 창 BottomSheet 안에 둔다)
export function MonthPicker({ value, currentMonth, firstMonth, onChange }: MonthPickerProps) {
  return (
    <div className="ui-months" data-testid="month-picker">
      {MONTHS.map((month) => {
        const selected = month === value
        const current = month === currentMonth
        return (
          <button
            key={month}
            type="button"
            className="ui-months__month"
            aria-pressed={selected}
            aria-current={current ? 'date' : undefined}
            data-state={selected ? 'selected' : 'idle'}
            data-current={current}
            disabled={firstMonth !== undefined && month < firstMonth}
            onClick={() => onChange(month)}
          >
            {month}월
          </button>
        )
      })}
    </div>
  )
}
