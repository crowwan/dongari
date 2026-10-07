import { useId } from 'react'
import type { FieldLabelRole } from './fieldLabel'
import './ui.css'

type TextFieldProps = {
  label: string
  // 이름 글자 역할. 기본은 질문 제목 급, 질문 아래 딸린 칸·카드 안 칸은 보조 이름(label)으로 낮춘다
  labelRole?: FieldLabelRole
  value: string
  onChange: (value: string) => void
  placeholder?: string
  // 있으면 오류 상태로 보이고 입력칸 아래에 문장으로 알려준다
  error?: string
  disabled?: boolean
  // 나타나자마자 포커스 (하나씩 채우기의 "직접 적기" — 키패드가 바로 뜬다)
  autoFocus?: boolean
}

// 글자 입력칸 (동아리 이름, 항목 직접 적기). 큰 제목 + 큰 글자, 오류는 색과 문장으로 함께 알린다
export function TextField({
  label,
  labelRole = 'heading',
  value,
  onChange,
  placeholder,
  error,
  disabled,
  autoFocus,
}: TextFieldProps) {
  const inputId = useId()
  const errorId = useId()

  return (
    <div className="ui-field" data-testid="text-field" data-label-role={labelRole} data-state={error ? 'error' : 'default'}>
      <label className="ui-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="ui-field__input"
        type="text"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
      />
      {error && (
        <p className="ui-field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}
