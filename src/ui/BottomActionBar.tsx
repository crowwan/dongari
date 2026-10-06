import { Button } from './Button'
import './ui.css'

type BottomActionBarProps = {
  label: string
  onClick: () => void
  disabled?: boolean
}

// 화면 아래 고정 영역 + 주 버튼 하나 ([+ 내역 적기], [사진으로 보내기]).
// 목록을 내려도 사라지지 않고 엄지가 닿는 자리 (ADR 003). 홈 표시줄(safe-area) 만큼 띄운다
export function BottomActionBar({ label, onClick, disabled }: BottomActionBarProps) {
  return (
    <div className="ui-bottom-bar" data-testid="bottom-action-bar">
      <div className="ui-bottom-bar__inner">
        <Button onClick={onClick} disabled={disabled}>
          {label}
        </Button>
      </div>
    </div>
  )
}
