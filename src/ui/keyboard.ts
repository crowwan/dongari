// 폰 키패드와 아래 고정 영역 (SPEC-001 기록 입력, #47 · #70)
//
// 1차: index.html viewport 메타 `interactive-widget=resizes-content` — 크롬(108+)·삼성 인터넷(크로미움)이 키패드만큼
//      레이아웃을 줄여, position: fixed; bottom: 0 인 [저장] 이 그대로 키패드 바로 위에 온다. 이때 아래는 늘 "닫힘"이다.
// 2차(메타를 모르는 브라우저 — 아이폰 사파리·홈 화면 앱): 레이아웃은 그대로이고 보이는 영역(visualViewport)만 준다.
//      고정 영역 위치를 계산해 맞추지 않는다. 사파리는 키패드가 뜰 때 보이는 영역을 옮기고(offsetTop),
//      그 값이 애니메이션·이벤트 순서에 따라 늦거나 덜 돌아와(iOS 26.0) 고정 영역이 화면 가운데로 떠서 칸을 가렸다(#70).
//      대신 키패드가 떠 있는 동안은 고정을 풀어 지금 질문 바로 아래 흐름에 두고(칸 → [저장] 순서가 구조로 보장),
//      [저장] 을 보이는 영역 아래 끝으로 스크롤해 키패드 바로 위에 보이게 한다
import { useSyncExternalStore } from 'react'

type ViewportSize = {
  layoutHeight: number // window.innerHeight (아이폰은 키패드가 떠도 그대로)
  visualHeight: number // visualViewport.height
  scale: number // visualViewport.scale (두 손가락 확대)
}

// 이보다 덜 줄었으면 키패드가 아니다: 폰 키패드는 숫자 키패드도 200px 를 넘고,
// iOS 26.0 은 키패드를 닫은 뒤에도 보이는 영역이 24px 쯤 덜 돌아온다 (WebKit 297779)
const KEYBOARD_MIN_HEIGHT = 150

// 레이아웃은 그대로인데 보이는 영역이 키패드 높이만큼 줄었는가. 보이는 영역이 밀린 위치(offsetTop)는 보지 않는다.
// 확대해 보는 중이면 키패드 때문이 아니라 닫힘
export function isKeyboardOpen({ layoutHeight, visualHeight, scale }: ViewportSize): boolean {
  if (scale > 1) return false
  return layoutHeight - visualHeight >= KEYBOARD_MIN_HEIGHT
}

type RevealCheck = {
  focusTop: number // 지금 적는 칸 위 끝 (getBoundingClientRect)
  barBottom: number // [저장] 영역 아래 끝 (같은 좌표)
  visibleHeight: number // visualViewport.height
}

// 적는 칸부터 [저장] 까지가 보이는 영역에 다 들어가야 [저장] 을 아래 끝으로 올린다.
// 멀면(고치기 화면 위쪽 칸) 올리지 않는다 — 올리면 적는 칸이 위로 밀려 숨는다. 두 값 모두 같은 좌표라 차이만 본다
export function shouldRevealBar({ focusTop, barBottom, visibleHeight }: RevealCheck): boolean {
  return barBottom - focusTop <= visibleHeight
}

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport
  if (!viewport) return () => {}
  viewport.addEventListener('resize', onChange)
  return () => viewport.removeEventListener('resize', onChange)
}

function readKeyboardOpen(): boolean {
  const viewport = window.visualViewport
  if (!viewport) return false
  return isKeyboardOpen({ layoutHeight: window.innerHeight, visualHeight: viewport.height, scale: viewport.scale })
}

// 보이는 영역이 바뀔 때마다 키패드가 떠 있는지. visualViewport 가 없는 브라우저는 늘 닫힘
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribe, readKeyboardOpen, () => false)
}
