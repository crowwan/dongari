import { TopTextButton } from '../ui/TopTextButton'
import './screens.css'

// 장부 외 화면 맨 위 [← 장부로]. 화살표는 꾸밈이라 화면 읽기에서는 "장부로" 만 읽는다
export function BackToLedger({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen__back">
      <TopTextButton onClick={onBack}>
        <span aria-hidden="true">← </span>장부로
      </TopTextButton>
    </div>
  )
}
