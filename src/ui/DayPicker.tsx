import './ui.css'

// 한 줄 칸 수. 390px 폰에서 "지금 적는 내역" 카드 안에 들어가도 칸이 56px 이상이 되는 수 (docs/design.md)
const COLUMNS = 5

type DayPickerProps = {
  // 묶음 이름 (화면 읽기, 예: "10월 날짜")
  label: string
  // 그 달 마지막 날 (28~31). 1일부터 이 날까지만 칸을 그린다
  days: number
  // 고른 날. 아직 없으면 null
  value: number | null
  // 오늘 (테두리). 올해 장부의 이번 달이 아니면 주지 않는다
  today?: number
  // 방금 저장한 내역의 날 (옅은 바탕 + 작은 "방금"). 연달아 적을 때만, 미리 고르지는 않는다
  recent?: number
  onChange: (day: number) => void
}

// 날 격자: 5칸씩 줄, 칸은 숫자 하나("7", 화면 읽기는 "7일"). 고른 날 청록 채움 + 굵게, 오늘 청록 테두리, 방금 저장한 날 옅은 청록 면 + "방금".
// MonthPicker 와 같은 모양 규칙 (SPEC-001 v2.2 "며칠인가요?")
export function DayPicker({ label, days, value, today, recent, onChange }: DayPickerProps) {
  return (
    <div className="ui-days" role="group" aria-label={label} data-testid="day-picker" data-columns={COLUMNS}>
      {Array.from({ length: days }, (_, index) => {
        const day = index + 1
        const selected = day === value
        const current = day === today
        const justSaved = day === recent
        return (
          <button
            key={day}
            type="button"
            className="ui-days__day"
            aria-pressed={selected}
            aria-current={current ? 'date' : undefined}
            data-state={selected ? 'selected' : 'idle'}
            data-current={current}
            data-recent={justSaved}
            onClick={() => onChange(day)}
          >
            <span className="ui-days__number">
              {day}
              <span className="ui-visually-hidden">일</span>
            </span>
            {justSaved && <> <span className="ui-days__recent">방금</span></>}
          </button>
        )
      })}
    </div>
  )
}
