import { useId } from 'react'
import './ui.css'

// 빠른 칩 하나: "오늘 7일" / "방금 5일"
export type DayChip = { tag: string; day: number }

type DayInputProps = {
  // 칸 이름 (화면 읽기용, 보통 질문 제목 "며칠인가요?". 질문 제목은 화면이 따로 보인다)
  label: string
  // 친 글자 (숫자만 두 자리까지 거르는 것은 부르는 쪽)
  value: string
  onChange: (text: string) => void
  // 나타나자마자 칸에 포커스 (내역 적기 "며칠인가요?" — 숫자 키패드가 바로 뜬다)
  autoFocus?: boolean
  // 칸 아래 빠른 칩. 비었으면 칩 줄을 숨긴다
  chips?: DayChip[]
  onPick?: (day: number) => void
}

// 날 숫자 칸 (SPEC-001 v2.2 "며칠인가요?", #80): 금액 칸(AmountDisplay)과 같은 생김새 — 흰 카드에 오른쪽 정렬 큰 숫자 + 작은 "일",
// 아래 빠른 칩 [오늘 7일] [방금 5일]. 숫자는 폰 숫자 키패드로 적는다(inputmode numeric, 두 자리까지)
export function DayInput({ label, value, onChange, autoFocus, chips = [], onPick }: DayInputProps) {
  const inputId = useId()

  return (
    <div className="ui-amount-display ui-day-input" data-testid="day-input">
      <label className="ui-visually-hidden" htmlFor={inputId}>
        {label}
      </label>
      <div className="ui-amount-display__number">
        <input
          id={inputId}
          className="ui-amount-display__field"
          type="text"
          inputMode="numeric"
          maxLength={2}
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="ui-amount-display__unit" aria-hidden="true">
          일
        </span>
      </div>
      {chips.length > 0 && (
        <div className="ui-day-input__quick" role="group" aria-label="빠른 날짜">
          {chips.map((chip) => (
            <button
              key={chip.tag}
              type="button"
              className="ui-amount-display__add"
              // 눌러도 칸 포커스를 뺏지 않는다: 키패드가 닫혔다 열리며 화면이 흔들리지 않게 (누르면 바로 다음 질문으로 간다)
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick?.(chip.day)}
            >
              {chip.tag} {chip.day}일
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
