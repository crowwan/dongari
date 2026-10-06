import { useEffect, useId, useRef } from 'react'
import { Button } from './Button'
import './ui.css'

type ConfirmDialogProps = {
  open: boolean
  // 묻는 문장 하나 (예: "이 기록을 정말 지울까요?")
  title: string
  // 제목 아래 보조 설명 한 줄 (예: "지금 기록은 불러온 기록으로 바뀌어요")
  description?: string
  confirmLabel?: string
  // null 이면 [아니요] 없이 버튼 하나짜리 알림 창 (예: "이 파일은 열 수 없어요" [확인]). Esc 는 그대로 onCancel
  cancelLabel?: string | null
  // 지우기·버리기처럼 되돌릴 수 없는 일이면 확인 버튼을 빨강으로
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// 브라우저 confirm·alert 대신 쓰는 앱 안 확인 창
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '아니요',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // 열릴 때 안전한 쪽(아니요, 없으면 하나뿐인 버튼)에 포커스, 닫히면 원래 자리로 돌려준다
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const safeButton = cancelRef.current ?? confirmRef.current
    safeButton?.focus({ preventScroll: true })
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
  const variant = danger ? 'danger' : cancelLabel === null ? 'notice' : 'default'

  return (
    <div className="ui-dialog-backdrop" data-testid="confirm-dialog" data-variant={variant}>
      <div
        className="ui-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="ui-dialog__text">
          <p className="ui-dialog__title" id={titleId}>
            {title}
          </p>
          {description && (
            <p className="ui-dialog__description" id={descriptionId}>
              {description}
            </p>
          )}
        </div>
        <div className="ui-dialog__actions" data-count={cancelLabel === null ? 1 : 2}>
          {cancelLabel !== null && (
            <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button ref={confirmRef} variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
