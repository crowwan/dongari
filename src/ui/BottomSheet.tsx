import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'
import './ui.css'

type BottomSheetProps = {
  open: boolean
  // 창 맨 위 질문 (예: "몇 월인가요?"). 창 이름으로도 읽힌다
  title: string
  // 바깥 누르기·Esc. 안드로이드 뒤로 버튼은 창을 여는 화면이 방문 기록으로 이어 준다
  onClose: () => void
  children: ReactNode
}

// 아래에서 올라오는 선택 창: 여럿 중 하나를 고를 때 (열두 달 등). 평소엔 안 보이고 "바꾸기"를 누르면 올라온다
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)

  // 열리면 창으로 포커스를 옮기고, 닫히면 연 자리로 돌려준다
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    sheetRef.current?.focus({ preventScroll: true })
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  // 어둡게 가린 곳(창 바깥)을 눌렀을 때만 닫는다
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div className="ui-sheet-backdrop" data-testid="bottom-sheet" onClick={handleBackdropClick}>
      <div ref={sheetRef} className="ui-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <span className="ui-sheet__grab" aria-hidden="true" />
        <p className="ui-sheet__title" id={titleId}>
          {title}
        </p>
        {children}
      </div>
    </div>
  )
}
