// 폰 키패드가 아래 고정 [저장] 을 가리지 않게 (SPEC-001 기록 입력, #47)
//
// 1차: index.html viewport 메타 `interactive-widget=resizes-content` — 크롬(108+)·삼성 인터넷(크로미움)이 키패드만큼
//      레이아웃을 줄여, position: fixed; bottom: 0 인 [저장] 이 키패드 바로 위에 온다.
// 2차(메타를 모르는 브라우저): 레이아웃은 그대로이고 보이는 영역(visualViewport)만 줄면, 가려진 높이를
//      CSS 변수 --keyboard-inset 으로 알려 아래 고정 영역을 그만큼 올린다. 1차가 먹으면 가려진 높이가 0 이라 겹치지 않는다
import { useEffect } from 'react'

type ViewportSize = {
  layoutHeight: number // window.innerHeight
  visualHeight: number // visualViewport.height
  visualOffsetTop: number // visualViewport.offsetTop
  scale: number // visualViewport.scale (두 손가락 확대)
}

// 레이아웃 아래쪽 중 보이는 영역 밖(키패드 뒤)으로 가려진 높이. 확대해 보는 중이면 키패드 때문이 아니라 0
export function keyboardInset({ layoutHeight, visualHeight, visualOffsetTop, scale }: ViewportSize): number {
  if (scale > 1) return 0
  return Math.max(0, Math.round(layoutHeight - visualHeight - visualOffsetTop))
}

// 앱 뿌리에서 한 번: 보이는 영역이 바뀔 때마다 <html> 에 --keyboard-inset 을 단다 (ui.css .ui-bottom-bar 가 쓴다)
export function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    const update = () => {
      const inset = keyboardInset({
        layoutHeight: window.innerHeight,
        visualHeight: viewport.height,
        visualOffsetTop: viewport.offsetTop,
        scale: viewport.scale,
      })
      root.style.setProperty('--keyboard-inset', `${inset}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      root.style.removeProperty('--keyboard-inset')
    }
  }, [])
}
