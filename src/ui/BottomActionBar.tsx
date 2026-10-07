import { useId } from 'react'
import { Button, type ButtonVariant } from './Button'
import type { IconName } from './Icon'
import './ui.css'

type BottomActionBarProps = {
  label: string
  // 글자 앞 아이콘 (예: 더하기 + "내역 적기")
  icon?: IconName
  onClick: () => void
  disabled?: boolean
  // 버튼 바로 위 한 줄 안내 (누를 수 없는 이유 등). 버튼 설명으로도 읽힌다
  note?: string
  // 기본은 주 버튼. 할 일이 위 목록 고르기이고 아래는 끝내기뿐이면 보조 (연달아 적기 [다 적었어요])
  variant?: Extract<ButtonVariant, 'primary' | 'secondary'>
}

// 화면 아래 고정 영역 + 버튼 하나 ([+ 내역 적기], [저장], [사진으로 저장], 보조 [다 적었어요]).
// 목록을 내려도 사라지지 않고 엄지가 닿는 자리 (ADR 003). 홈 표시줄(safe-area) 만큼 띄운다
export function BottomActionBar({ label, icon, onClick, disabled, note, variant }: BottomActionBarProps) {
  const noteId = useId()

  return (
    <div className="ui-bottom-bar" data-testid="bottom-action-bar">
      <div className="ui-bottom-bar__inner">
        {note && (
          <p className="ui-bottom-bar__note" id={noteId} data-testid="bottom-action-bar-note">
            {note}
          </p>
        )}
        <Button variant={variant} icon={icon} onClick={onClick} disabled={disabled} aria-describedby={note ? noteId : undefined}>
          {label}
        </Button>
      </div>
    </div>
  )
}
