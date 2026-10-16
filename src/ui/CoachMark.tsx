import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { coachPlacement } from './coachPlacement'
import { Icon } from './Icon'
import { useModalLayer } from './modalLayer'
import './coachMark.css'

type CoachMarkProps = {
  open: boolean
  // 말풍선 이름 (루트 data-state, 예: 처음 쓰는 분 안내 번호 "1")
  name: string
  // 가리키는 버튼. 스크림 위로 보이고(청록 둘레) 말풍선이 떠 있는 동안에도 누를 수 있다
  target: RefObject<HTMLElement | null>
  // 한 문장 안내. 가리키는 버튼의 설명(aria-describedby)으로도 읽힌다
  message: string
  // [알겠어요]·[✕]
  onDismiss: () => void
  // 가리키는 버튼을 눌렀다 (버튼의 원래 일보다 먼저 불린다)
  onTargetPress: () => void
  // 카탈로그 견본: 제자리(가장 가까운 position 있는 조상 안)에 그리고 뒤 화면을 잠그거나 포커스를 옮기지 않는다
  inline?: boolean
}

function isOutOfView(rect: DOMRect): boolean {
  return rect.top < 0 || rect.bottom > window.innerHeight
}

// 처음 쓰는 분 안내 말풍선 (SPEC-008): 뒤 화면을 스크림으로 어둡게 잠그고, 가리키는 버튼만 청록 둘레로 열어 두고,
// 꼬리 달린 말풍선(제목색 면 + 카드색 글자)을 버튼 위나 아래에 띄운다.
// 열리면 포커스는 가리키는 버튼(Tab: 버튼 → [✕] → [알겠어요]), 닫히면 그 버튼에 남는다 (#110 useModalLayer).
// 버튼 자리는 getBoundingClientRect 로 재고 화면 크기·스크롤이 바뀌면 다시 잰다. 버튼이 화면 밖이면 먼저 보이게 스크롤한다
export function CoachMark({ open, name, target, message, onDismiss, onTargetPress, inline = false }: CoachMarkProps) {
  const messageId = useId()
  const layerRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  useModalLayer(open, layerRef, target, !inline, target)

  // 자리 재기: React 상태 대신 틀의 CSS 변수와 data-side 로 바로 그린다 (스크롤마다 다시 그리지 않게)
  useLayoutEffect(() => {
    const layer = layerRef.current
    const bubble = bubbleRef.current
    const element = target.current
    if (!open || !layer || !bubble || !element) return
    if (!inline && isOutOfView(element.getBoundingClientRect())) element.scrollIntoView?.({ block: 'center' })

    const measure = () => {
      const frame = layer.getBoundingClientRect()
      const rect = element.getBoundingClientRect()
      const bubbleRect = bubble.getBoundingClientRect()
      const box = { top: rect.top - frame.top, left: rect.left - frame.left, width: rect.width, height: rect.height }
      const { side, anchor, tailX } = coachPlacement(box, frame.height, {
        left: bubbleRect.left - frame.left,
        width: bubbleRect.width,
      })
      layer.dataset.side = side
      layer.style.setProperty('--coach-anchor', `${anchor}px`)
      layer.style.setProperty('--coach-tail-x', `${tailX}px`)
      layer.style.setProperty('--coach-hole-top', `${box.top}px`)
      layer.style.setProperty('--coach-hole-left', `${box.left}px`)
      layer.style.setProperty('--coach-hole-width', `${box.width}px`)
      layer.style.setProperty('--coach-hole-height', `${box.height}px`)
    }
    measure()
    const viewport = window.visualViewport
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    viewport?.addEventListener('resize', measure)
    // 폰 글자 크기를 바꾸면 버튼 크기가 바뀐다 (ResizeObserver 가 없는 환경(테스트)에서는 창 크기만)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(element)
    observer?.observe(layer)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      viewport?.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [open, inline, target])

  // 말풍선 글을 가리키는 버튼의 설명으로 붙이고, 닫히면 원래대로
  useEffect(() => {
    const element = target.current
    if (!open || !element) return
    const original = element.getAttribute('aria-describedby')
    element.setAttribute('aria-describedby', original ? `${original} ${messageId}` : messageId)
    return () => {
      if (original === null) element.removeAttribute('aria-describedby')
      else element.setAttribute('aria-describedby', original)
    }
  }, [open, target, messageId])

  // 가리키는 버튼을 누르면 말풍선이 닫히고 버튼은 제 일을 한다 (이 듣기는 React 의 onClick 보다 먼저 불린다)
  const handleTargetPress = useEffectEvent(() => onTargetPress())
  useEffect(() => {
    const element = target.current
    if (!open || !element) return
    const listener = () => handleTargetPress()
    element.addEventListener('click', listener)
    return () => element.removeEventListener('click', listener)
  }, [open, target])

  if (!open) return null

  const layer = (
    <div ref={layerRef} className="ui-coach" data-testid="coach-mark" data-state={name} data-inline={inline || undefined}>
      <div className="ui-coach__hole" aria-hidden="true" />
      <div ref={bubbleRef} className="ui-coach__bubble" data-testid="coach-mark-bubble">
        <p className="ui-coach__message" id={messageId}>
          {message}
        </p>
        <button type="button" className="ui-coach__close" aria-label="안내 닫기" onClick={onDismiss}>
          <Icon name="close" />
        </button>
        <button type="button" className="ui-coach__ok" onClick={onDismiss}>
          알겠어요
        </button>
      </div>
    </div>
  )
  return inline ? layer : createPortal(layer, document.body)
}
