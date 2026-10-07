import { useId } from 'react'
import { addAmount, formatMoney, parseMoney } from './money'
import './ui.css'

// 빠른 더하기: 동아리 금액은 만 원 단위가 많다 (SPEC-001 AC-17)
const QUICK_STEPS = [
  { amount: 10_000, label: '+1만', name: '1만 원 더하기' },
  { amount: 50_000, label: '+5만', name: '5만 원 더하기' },
  { amount: 100_000, label: '+10만', name: '10만 원 더하기' },
]

type AmountDisplayProps = {
  // 칸 이름 (화면 읽기용, 보통 질문 제목 "얼마인가요?". 질문 제목은 화면이 따로 보인다)
  label: string
  // 원 단위 금액. 0 이면 빈칸
  value: number
  onChange: (value: number) => void
  // 나타나자마자 금액 칸에 포커스 (하나씩 채우기의 "얼마인가요?" — 숫자 키패드가 바로 뜬다)
  autoFocus?: boolean
}

// 금액 크게 보기 + 빠른 더하기: 흰 카드에 오른쪽 정렬 큰 숫자(잔액과 같은 Display) + 작은 "원", 아래 [+1만] [+5만] [+10만].
// 숫자는 폰 숫자 키패드로 적고(inputmode numeric) 콤마는 저절로, 상한 999,999,999
export function AmountDisplay({ label, value, onChange, autoFocus }: AmountDisplayProps) {
  const inputId = useId()

  return (
    <div className="ui-amount-display" data-testid="amount-display">
      <label className="ui-visually-hidden" htmlFor={inputId}>
        {label}
      </label>
      <div className="ui-amount-display__number">
        <input
          id={inputId}
          className="ui-amount-display__field"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0"
          value={formatMoney(value)}
          onChange={(event) => onChange(parseMoney(event.target.value))}
        />
        <span className="ui-amount-display__unit" aria-hidden="true">
          원
        </span>
      </div>
      <div className="ui-amount-display__quick">
        {QUICK_STEPS.map((step) => (
          <button
            key={step.amount}
            type="button"
            className="ui-amount-display__add"
            aria-label={step.name}
            // 눌러도 금액 칸 포커스를 뺏지 않는다: 키패드가 닫혔다 열리며 화면이 흔들리지 않게
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(addAmount(value, step.amount))}
          >
            {step.label}
          </button>
        ))}
      </div>
    </div>
  )
}
