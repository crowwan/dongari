// 화면 위에 뜨는 창(확인 창·선택 창·안내 말풍선)이 같이 쓰는 잠금 (#110 접근성 점검 08)
// 창은 document.body 바로 아래에 그리고(createPortal), 떠 있는 동안 창 밖(앱 뿌리 #root 등)을 inert 로 잠근다.
// inert 인 곳은 Tab·화면 읽기(TalkBack)·누르기가 닿지 않아, 지우기 확인 창에서 Tab 이 뒤 화면 [저장] 으로 빠져나가지 않는다
import { useEffect, type RefObject } from 'react'

// 창이 떠 있어도 잠그지 않는 요소 표시 (body 바로 아래에 둔다). 보이지도 포커스되지도 않는 숨은 파일 고르기 칸처럼,
// 창 안 버튼이 click() 으로 여는 것: 잠긴(inert) 칸의 click() 은 브라우저가 무시할 수 있다 (SPEC-010 #178 장부 고르기 창 [엑셀 파일로 새 장부])
export const OUTSIDE_LAYER = 'data-outside-layer'

// 떠 있는 창 하나가 열어 둔 것(창·열어 둘 요소와 그 조상 줄)과 잠근 것(그 줄의 형제).
// keepsThrough: 창 밖 요소를 열어 두는 안내 말풍선(SPEC-008). 다른 창이 잠근 곳 안이라도 열어 둔 요소는 열려 있다
// — 연습 ⑥ 말풍선이 장부 고르기 창 안 버튼을 가리킬 때, 그 창이 잠근 앱 뿌리 안의 연습 띠 [그만하기] 를 열어 둔다 (SPEC-010 10절)
interface Layer {
  kept: Set<Element>
  locked: Set<Element>
  keepsThrough: boolean
}

const openLayers = new Set<Layer>()

// 창이 포커스를 옮긴 요소 → 옮기기 전 포커스가 있던 곳. 말풍선이 먼저 창 안 버튼으로 포커스를 옮겨 놓은 뒤 그 창이 열리면,
// 창은 "닫을 때 돌아갈 곳"으로 그 버튼(창과 함께 사라짐)이 아니라 그 전에 있던 곳(창을 연 버튼)을 기억한다 (SPEC-010 10절 ⑥)
const focusMovedFrom = new WeakMap<Element, Element>()

// 어느 창이 잠갔고, 그 창이 아닌 말풍선이 열어 두지 않았으면 잠긴다. 창이 뜨고 닫히는 순서와 상관없이 떠 있는 창들로만 정한다.
// 조건: 말풍선 "위에" 확인 창이 뜨면, 그 확인 창이 잠근 곳이라도 말풍선이 열어 둔 요소(가리키는 버튼·연습 띠)는 열린 채다.
// 지금은 일어나지 않는다 — 연습 말풍선은 확인 창·선택 창(장부 고르기 창 빼고)이 뜨면 숨고(practiceSteps `covered`),
// 복구 코드 말풍선은 창이 없을 때만 뜬다(guideRules `blocked`). 말풍선을 숨기지 않고 그 위에 창을 띄우게 되면
// 열어 두기를 "그 말풍선보다 먼저 뜬 창의 잠금"으로 좁혀야 한다
function shouldLock(element: Element): boolean {
  return [...openLayers].some(
    (locker) =>
      locker.locked.has(element) &&
      ![...openLayers].some((keeper) => keeper !== locker && keeper.keepsThrough && keeper.kept.has(element)),
  )
}

function refresh(elements: Iterable<Element>) {
  for (const element of elements) {
    if (shouldLock(element)) element.setAttribute('inert', '')
    else element.removeAttribute('inert')
  }
}

// 열어 둘 요소들(창, 말풍선이 가리키는 버튼)과 그 조상 줄은 남기고, 그 줄의 형제를 모두 잠근 뒤 푸는 함수를 돌려준다.
// 다른 창의 잠금은 그 창이 떠 있는 동안 그대로라, 창 위에 창이 떴다 닫혀도 아래 창의 잠금은 남는다
function lockOutside(openElements: HTMLElement[], keepsThrough: boolean): () => void {
  const kept = new Set<Element>()
  for (const element of openElements) {
    for (let node: HTMLElement | null = element; node && node !== document.body; node = node.parentElement) kept.add(node)
  }
  const locked = new Set<Element>()
  for (const node of kept) {
    for (const sibling of node.parentElement?.children ?? []) {
      if (!kept.has(sibling) && !sibling.hasAttribute(OUTSIDE_LAYER)) locked.add(sibling)
    }
  }
  const layer: Layer = { kept, locked, keepsThrough }
  openLayers.add(layer)
  refresh([...locked, ...kept])
  return () => {
    openLayers.delete(layer)
    refresh([...locked, ...kept])
  }
}

// 열어 둘 요소가 없는 창(확인 창·선택 창). 기본값을 그리기마다 새로 만들지 않게 하나로 둔다
const NOTHING_KEPT: readonly RefObject<HTMLElement | null>[] = []

// 창이 열려 있는 동안: 창 밖을 잠그고 focusTarget 으로 포커스를 옮긴다. 닫히면 잠금을 풀고 연 자리(열 때 포커스가 있던 곳)로 돌려준다.
// 풀기가 먼저다: inert 인 곳에는 포커스가 가지 않는다.
// 포커스가 이미 창 안에 있으면 옮기지 않는다 — 말풍선이 먼저 창 안 버튼으로 옮겨 둔 포커스를 그 창이 가져가지 않게 (SPEC-010 10절).
// 그때 닫으면 돌아갈 곳은 말풍선이 옮기기 전 자리(창을 연 버튼)다.
// enabled 가 false 면(카탈로그 견본) 아무것도 하지 않는다.
// keepOpen(SPEC-008 말풍선): 창 밖이지만 열어 둘 요소들(가리키는 버튼, 같이 열어 둘 날 칸·금액 칸, 연습 띠 [그만하기]).
// 닫히면 포커스를 연 자리 대신 첫 요소(가리키는 버튼)에 둔다 (그 버튼을 눌러 화면이 바뀌었으면 요소가 없어져 그 화면 규칙을 따른다).
// 목록은 그리기마다 새로 만들지 않는다 (바뀌면 잠금을 다시 걸고 포커스를 다시 옮긴다)
export function useModalLayer(
  open: boolean,
  layerRef: RefObject<HTMLElement | null>,
  focusTarget: RefObject<HTMLElement | null>,
  enabled = true,
  keepOpen: readonly RefObject<HTMLElement | null>[] = NOTHING_KEPT,
) {
  useEffect(() => {
    const layer = layerRef.current
    if (!open || !enabled || !layer) return
    const kept = keepOpen.flatMap((ref) => (ref.current ? [ref.current] : []))
    const active = document.activeElement
    const focusInside = active !== null && layer.contains(active)
    // 포커스가 이미 창 안이면(말풍선이 옮겨 둠) 그 전에 있던 곳으로 돌아간다
    const previous = kept[0] ?? (focusInside ? (focusMovedFrom.get(active) ?? active) : active)
    const unlock = lockOutside([layer, ...kept], kept.length > 0)
    const target = focusTarget.current
    if (!focusInside && target) {
      if (active) focusMovedFrom.set(target, active)
      target.focus({ preventScroll: true })
    }
    return () => {
      unlock()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [open, enabled, layerRef, focusTarget, keepOpen])
}
