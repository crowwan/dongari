import type { ReactNode } from 'react'
import './ui.css'

type ChoiceChipProps = {
  selected: boolean
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}

// 여러 개 중 하나를 고르는 선택 버튼 (월 선택, 자주 쓰는 항목 선택)
export function ChoiceChip({ selected, disabled, onClick, children }: ChoiceChipProps) {
  return (
    <button
      type="button"
      className="ui-chip"
      aria-pressed={selected}
      data-testid="choice-chip"
      data-state={selected ? 'selected' : 'idle'}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
