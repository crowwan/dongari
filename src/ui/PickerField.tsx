import { useId } from 'react'
import { Icon } from './Icon'
import './ui.css'

type PickerFieldProps = {
  // 칸 이름 (보조 이름 크기, 설정 편집 화면 칸과 같다)
  label: string
  // 지금 값 ("2026년 7월")
  value: string
  // 선택 창 열기
  onClick: () => void
}

// 고르는 칸: 이름 + 입력칸 모양 버튼(지금 값 + ▾). 누르면 선택 창이 올라온다. 화면 읽기는 "들어온 달 2026년 7월".
// 회원 넣기·회원 정보의 들어온 달·그만둔 달 (SPEC-010 6절)
export function PickerField({ label, value, onClick }: PickerFieldProps) {
  const labelId = useId()
  const valueId = useId()
  return (
    <div className="ui-field" data-testid="picker-field" data-label-role="label">
      <span className="ui-field__label" id={labelId}>
        {label}
      </span>
      <button
        type="button"
        className="ui-picker-field"
        aria-haspopup="dialog"
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={onClick}
      >
        <span id={valueId}>{value}</span>
        <Icon name="down" />
      </button>
    </div>
  )
}
