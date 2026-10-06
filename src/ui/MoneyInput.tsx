import { useId } from 'react'
import { formatMoney, parseMoney } from './money'
import './ui.css'

type MoneyInputProps = {
  label: string
  // 원 단위 금액. 0 이면 빈칸으로 보인다
  value: number
  onChange: (value: number) => void
  // 있으면 오류 상태로 보이고 입력칸 아래에 문장으로 알려준다
  error?: string
  disabled?: boolean
}

// 금액 입력칸: 숫자 키패드, 천 단위 콤마 자동, "원" 표기, 상한 999,999,999
export function MoneyInput({ label, value, onChange, error, disabled }: MoneyInputProps) {
  const inputId = useId()
  const errorId = useId()

  return (
    <div className="ui-money" data-testid="money-input" data-state={error ? 'error' : 'default'}>
      <label className="ui-money__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="ui-money__box">
        <input
          id={inputId}
          className="ui-money__field"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={formatMoney(value)}
          onChange={(event) => onChange(parseMoney(event.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
        />
        <span className="ui-money__unit" aria-hidden="true">
          원
        </span>
      </div>
      {error && (
        <p className="ui-money__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}
