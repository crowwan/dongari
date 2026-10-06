import type { ReactNode } from 'react'
import './ui.css'

type TopTextButtonProps = {
  onClick: () => void
  children: ReactNode
}

// 화면 위쪽의 알약 모양 글자 버튼 ([올해 결산] [설정]). 자주 안 쓰는 이동이라 주 버튼보다 조용하게
export function TopTextButton({ onClick, children }: TopTextButtonProps) {
  return (
    <button type="button" className="ui-top-button" data-testid="top-text-button" onClick={onClick}>
      {children}
    </button>
  )
}
