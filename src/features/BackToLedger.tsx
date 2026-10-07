import { IconButton } from '../ui/IconButton'
import './screens.css'

// 장부 외 화면 맨 위 [‹ 장부로]. 화살표 아이콘은 꾸밈이라 화면 읽기에서는 "장부로" 만 읽는다
export function BackToLedger({ onBack }: { onBack: () => void }) {
  return <BackButton label="장부로" onBack={onBack} />
}

// 맨 위 되돌아가기 줄 하나 (설정 편집 화면의 [‹ 설정] 도 같은 모양)
export function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="screen__back">
      <IconButton icon="left" onClick={onBack}>
        {label}
      </IconButton>
    </div>
  )
}
