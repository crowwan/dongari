import { useEffect, useId, useRef } from 'react'
import { Button } from './Button'
import './ui.css'

type ConfirmDialogProps = {
  open: boolean
  // 묻는 문장 하나 (예: "이 기록을 정말 지울까요?")
  title: string
  confirmLabel?: string
  cancelLabel?: string
  // 지우기·버리기처럼 되돌릴 수 없는 일이면 확인 버튼을 빨강으로
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// 브라우저 confirm 대신 쓰는 앱 안 확인 창
export function ConfirmDialog({
  open,
  title,
  confirmLabel = '확인',
  cancelLabel = '아니요',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // 열릴 때 안전한 쪽(아니요)에 포커스, 닫히면 원래 자리로 돌려준다
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    cancelRef.current?.focus({ preventScroll: true })
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open])

  // Esc 는 아니요와 같다
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="ui-dialog-backdrop" data-testid="confirm-dialog" data-variant={danger ? 'danger' : 'default'}>
      <div className="ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <p className="ui-dialog__title" id={titleId}>
          {title}
        </p>
        <div className="ui-dialog__actions">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
