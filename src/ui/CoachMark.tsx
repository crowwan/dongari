import { useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { coachPlacement } from './coachPlacement'
import { Icon } from './Icon'
import { useModalLayer } from './modalLayer'
import './coachMark.css'

type CoachMarkProps = {
  open: boolean
  // 말풍선 이름 (루트 data-state, 예: 복구 코드 안내 "4", 연습 단계 이름)
  name: string
  // 가리키는 버튼. 스크림 위로 보이고(청록 둘레) 말풍선이 떠 있는 동안에도 누를 수 있다
  target: RefObject<HTMLElement | null>
  // 한 문장 안내. 가리키는 버튼의 설명(aria-describedby)으로도 읽힌다
  message: string
  // [알겠어요]·[✕]. 없으면 두 버튼이 없다 (연습 말풍선은 가리키는 곳을 눌러야 넘어간다, SPEC-008)
  onDismiss?: () => void
  // 가리키는 버튼을 눌렀다 (버튼의 원래 일보다 먼저 불린다)
  onTargetPress?: () => void
  // 아래 줄 왼쪽 진행 ("연습 1 / 4"). 가리키는 버튼의 설명에도 붙는다
  progress?: string
  // 아래 줄 오른쪽 버튼 (연습 갈래의 [다음에 할게요])
  action?: { label: string; onClick: () => void }
  // 가리키는 버튼 말고 같이 열어 둘 요소 (날 칸·금액 칸·연습 띠 [그만하기]). 그리기마다 새로 만들지 않는다
  alsoOpen?: readonly RefObject<HTMLElement | null>[]
  // 가리키는 버튼과 함께 밝게 보일 요소 (바로 옆 날 칸·금액 칸). 둘레·말풍선 자리를 이 요소까지 합친 상자로 잰다
  spotlight?: readonly RefObject<HTMLElement | null>[]
  // 카탈로그 견본: 제자리(가장 가까운 position 있는 조상 안)에 그리고 뒤 화면을 잠그거나 포커스를 옮기지 않는다
  inline?: boolean
}

// 가리키는 버튼이 화면 밖이거나, 화면 위에 고정된 것(아래 고정 버튼 영역 등)에 가려 있는지
function isOutOfView(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.top < 0 || rect.bottom > window.innerHeight) return true
  // 테스트 환경(jsdom)에는 elementFromPoint 가 없다
  if (typeof document.elementFromPoint !== 'function') return false
  // 위·아래 가장자리 바로 안쪽이 모두 그 버튼이어야 다 보인다
  const x = rect.left + rect.width / 2
  return [rect.top + 2, rect.bottom - 2].some((y) => {
    const hit = document.elementFromPoint(x, y)
    return hit !== null && !element.contains(hit)
  })
}

const NO_OTHERS: readonly RefObject<HTMLElement | null>[] = []

// 여러 요소를 감싸는 상자 (가리키는 버튼 + 함께 밝게 보일 칸)
function unionRect(rects: DOMRect[]): { top: number; left: number; width: number; height: number } {
  const top = Math.min(...rects.map((rect) => rect.top))
  const left = Math.min(...rects.map((rect) => rect.left))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  const right = Math.max(...rects.map((rect) => rect.right))
  return { top, left, width: right - left, height: bottom - top }
}

// 안내 말풍선 (SPEC-008): 뒤 화면을 스크림으로 어둡게 잠그고, 가리키는 버튼만 청록 둘레로 열어 두고,
// 꼬리 달린 말풍선(제목색 면 + 카드색 글자)을 버튼 위나 아래에 띄운다.
// 열리면 포커스는 가리키는 버튼(Tab: 버튼 → [✕] → [알겠어요] / 연습: 버튼 → 같이 열어 둔 칸 → [다음에 할게요]), 닫히면 그 버튼에 남는다 (#110 useModalLayer).
// 버튼 자리는 getBoundingClientRect 로 재고 화면 크기·스크롤이 바뀌면 다시 잰다. 버튼이 화면 밖이거나 아래 고정 영역에 가렸으면 먼저 보이게 스크롤한다
export function CoachMark({
  open,
  name,
  target,
  message,
  onDismiss,
  onTargetPress,
  progress,
  action,
  alsoOpen = NO_OTHERS,
  spotlight = NO_OTHERS,
  inline = false,
}: CoachMarkProps) {
  const messageId = useId()
  const progressId = useId()
  const layerRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const keepOpen = useMemo(() => [target, ...alsoOpen], [target, alsoOpen])
  const describedBy = progress === undefined ? messageId : `${messageId} ${progressId}`

  useModalLayer(open, layerRef, target, !inline, keepOpen)

  // 자리 재기: React 상태 대신 틀의 CSS 변수와 data-side 로 바로 그린다 (스크롤마다 다시 그리지 않게)
  useLayoutEffect(() => {
    const layer = layerRef.current
    const bubble = bubbleRef.current
    const element = target.current
    if (!open || !layer || !bubble || !element) return
    if (!inline && isOutOfView(element)) element.scrollIntoView?.({ block: 'center' })

    const shown = [element, ...spotlight.flatMap((ref) => (ref.current ? [ref.current] : []))]
    const measure = () => {
      const frame = layer.getBoundingClientRect()
      const rect = unionRect(shown.map((item) => item.getBoundingClientRect()))
      const targetRect = element.getBoundingClientRect()
      const bubbleRect = bubble.getBoundingClientRect()
      const bubbleBox = { left: bubbleRect.left - frame.left, width: bubbleRect.width }
      const box = { top: rect.top - frame.top, left: rect.left - frame.left, width: rect.width, height: rect.height }
      // 위·아래 자리는 함께 밝힌 상자로, 꼬리는 가리키는 버튼 가운데로
      const { side, anchor } = coachPlacement(box, frame.height, bubbleBox)
      const { tailX } = coachPlacement({ ...box, left: targetRect.left - frame.left, width: targetRect.width }, frame.height, bubbleBox)
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
    for (const item of shown) observer?.observe(item)
    observer?.observe(layer)
    observer?.observe(bubble)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      viewport?.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [open, inline, target, spotlight])

  // 말풍선 글(과 진행)을 가리키는 버튼의 설명으로 붙이고, 닫히면 원래대로
  useEffect(() => {
    const element = target.current
    if (!open || !element) return
    const original = element.getAttribute('aria-describedby')
    element.setAttribute('aria-describedby', original ? `${original} ${describedBy}` : describedBy)
    return () => {
      if (original === null) element.removeAttribute('aria-describedby')
      else element.setAttribute('aria-describedby', original)
    }
  }, [open, target, describedBy])

  // 가리키는 버튼을 누르면 말풍선이 닫히고 버튼은 제 일을 한다 (이 듣기는 React 의 onClick 보다 먼저 불린다)
  const handleTargetPress = useEffectEvent(() => onTargetPress?.())
  useEffect(() => {
    const element = target.current
    if (!open || !element) return
    const listener = () => handleTargetPress()
    element.addEventListener('click', listener)
    return () => element.removeEventListener('click', listener)
  }, [open, target])

  if (!open) return null

  const layer = (
    <div
      ref={layerRef}
      className="ui-coach"
      data-testid="coach-mark"
      data-state={name}
      data-inline={inline || undefined}
      data-kind={onDismiss ? 'dismissible' : 'practice'}
    >
      <div className="ui-coach__hole" aria-hidden="true" />
      <div ref={bubbleRef} className="ui-coach__bubble" data-testid="coach-mark-bubble">
        <p className="ui-coach__message" id={messageId}>
          {message}
        </p>
        {onDismiss && (
          <>
            <button type="button" className="ui-coach__close" aria-label="안내 닫기" onClick={onDismiss}>
              <Icon name="close" />
            </button>
            <button type="button" className="ui-coach__ok" onClick={onDismiss}>
              알겠어요
            </button>
          </>
        )}
        {(progress !== undefined || action) && (
          <div className="ui-coach__foot">
            {progress !== undefined && (
              <span className="ui-coach__progress" id={progressId}>
                {progress}
              </span>
            )}
            {action && (
              <button type="button" className="ui-coach__action" onClick={action.onClick}>
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
  return inline ? layer : createPortal(layer, document.body)
}
