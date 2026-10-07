import { useId, useState } from 'react'
import { formatAmount, parseMoney, tidyMoneyText } from './money'
import type { FieldLabelRole } from './fieldLabel'
import './ui.css'

type MoneyInputProps = {
  label: string
  // 이름 글자 역할. 기본은 질문 제목 급, 질문 아래 딸린 칸·카드 안 칸은 보조 이름(label)으로 낮춘다
  labelRole?: FieldLabelRole
  // 원 단위 금액. 처음엔 0 도 그대로 보이고, 다 지우면 빈칸(값은 0)
  value: number
  onChange: (value: number) => void
  // 있으면 오류 상태로 보이고 입력칸 아래에 문장으로 알려준다
  error?: string
  disabled?: boolean
}

// 금액 입력칸: 숫자 키패드, 천 단위 콤마 자동, "원" 표기, 상한 999,999,999
// 0원도 적는 값인 칸(이월금)에 쓴다. 0원이 없는 내역 금액은 AmountDisplay
export function MoneyInput({ label, labelRole = 'heading', value, onChange, error, disabled }: MoneyInputProps) {
  const inputId = useId()
  const errorId = useId()
  // 빈칸과 직접 친 0 은 금액이 둘 다 0 이라 친 글자를 따로 든다 (#59)
  const [text, setText] = useState(() => formatAmount(value))
  // 부모가 값을 바꿨으면(친 글자와 금액이 다르면) 그 값을 보여 준다
  const shown = parseMoney(text) === value ? text : formatAmount(value)

  return (
    <div className="ui-money" data-testid="money-input" data-label-role={labelRole} data-state={error ? 'error' : 'default'}>
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
          value={shown}
          onChange={(event) => {
            const next = tidyMoneyText(event.target.value)
            setText(next)
            onChange(parseMoney(next))
          }}
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
