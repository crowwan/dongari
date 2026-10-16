// 화면 위에 뜨는 창(확인 창·선택 창, 앞으로 만들 안내 말풍선도)이 같이 쓰는 잠금 (#110 접근성 점검 08)
// 창은 document.body 바로 아래에 그리고(createPortal), 떠 있는 동안 창 밖(앱 뿌리 #root 등)을 inert 로 잠근다.
// inert 인 곳은 Tab·화면 읽기(TalkBack)·누르기가 닿지 않아, 지우기 확인 창에서 Tab 이 뒤 화면 [저장] 으로 빠져나가지 않는다
import { useEffect, type RefObject } from 'react'

// layer 와 그 조상을 뺀 형제를 모두 잠그고, 푸는 함수를 돌려준다.
// 이미 잠긴 것(아래 창이 잠근 앱 뿌리)은 건드리지 않아, 창 위에 창이 떴다 닫혀도 아래 창의 잠금은 그대로다
function lockOutside(layer: HTMLElement): () => void {
  const locked: Element[] = []
  for (let node: HTMLElement = layer; node !== document.body && node.parentElement; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || sibling.hasAttribute('inert')) continue
      sibling.setAttribute('inert', '')
      locked.push(sibling)
    }
  }
  return () => {
    for (const element of locked) element.removeAttribute('inert')
  }
}

// 창이 열려 있는 동안: 창 밖을 잠그고 focusTarget 으로 포커스를 옮긴다. 닫히면 잠금을 풀고 연 자리(열 때 포커스가 있던 곳)로 돌려준다.
// 풀기가 먼저다: inert 인 곳에는 포커스가 가지 않는다.
// enabled 가 false 면(카탈로그 견본) 아무것도 하지 않는다
export function useModalLayer(
  open: boolean,
  layerRef: RefObject<HTMLElement | null>,
  focusTarget: RefObject<HTMLElement | null>,
  enabled = true,
) {
  useEffect(() => {
    const layer = layerRef.current
    if (!open || !enabled || !layer) return
    const previous = document.activeElement
    const unlock = lockOutside(layer)
    focusTarget.current?.focus({ preventScroll: true })
    return () => {
      unlock()
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open, enabled, layerRef, focusTarget])
}
