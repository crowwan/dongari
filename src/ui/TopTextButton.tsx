import type { ReactNode } from 'react'
import './ui.css'

type TopTextButtonProps = {
  onClick: () => void
  children: ReactNode
  // 점 표시 (예: 백업 필요). 주면 글자 오른쪽 위에 점을 찍고, 화면 읽기 이름에 이 말을 붙인다
  dotLabel?: string
}

// 화면 위쪽의 알약 모양 글자 버튼 ([올해 결산] [설정]). 자주 안 쓰는 이동이라 주 버튼보다 조용하게
export function TopTextButton({ onClick, children, dotLabel }: TopTextButtonProps) {
  return (
    <button
      type="button"
      className="ui-top-button"
      data-testid="top-text-button"
      data-dot={dotLabel !== undefined}
      onClick={onClick}
    >
      {children}
      {dotLabel !== undefined && (
        <>
          <span className="ui-top-button__dot" data-testid="top-text-button-dot" aria-hidden="true" />
          {/* 글자와 숨은 이름 사이 띄어쓰기 ("설정 백업 필요") */}{' '}
          <span className="ui-visually-hidden">{dotLabel}</span>
        </>
      )}
    </button>
  )
}
