import { useId } from 'react'
import './ui.css'

type TextFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  // 있으면 오류 상태로 보이고 입력칸 아래에 문장으로 알려준다
  error?: string
  disabled?: boolean
}

// 글자 입력칸 (동아리 이름, 항목 직접 적기). 큰 제목 + 큰 글자, 오류는 색과 문장으로 함께 알린다
export function TextField({ label, value, onChange, placeholder, error, disabled }: TextFieldProps) {
  const inputId = useId()
  const errorId = useId()

  return (
    <div className="ui-field" data-testid="text-field" data-state={error ? 'error' : 'default'}>
      <label className="ui-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="ui-field__input"
        type="text"
        autoComplete="off"
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
