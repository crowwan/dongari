import './ui.css'

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

type MonthPickerProps = {
  // 고른 달 (1~12). 아직 없으면 null
  value: number | null
  // 이번 달 (테두리로 표시). 올해 장부가 아니면 주지 않는다
  currentMonth?: number
  onChange: (month: number) => void
}

// 열두 달 고르기: 3열 × 4행. 고른 달은 청록 채움 + 굵게, 이번 달은 청록 테두리 (선택 창 BottomSheet 안에 둔다)
export function MonthPicker({ value, currentMonth, onChange }: MonthPickerProps) {
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
            onClick={() => onChange(month)}
          >
            {month}월
          </button>
        )
      })}
    </div>
  )
}
