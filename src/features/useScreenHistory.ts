// 장부와 그 밖의 화면 오가기 (SPEC-001 화면 구성, 탭 없음)
// 장부 외 화면을 열 때 방문 기록을 하나 쌓아, 안드로이드 뒤로 버튼(popstate)이 앱을 나가지 않고 장부로 돌아오게 한다
import { useEffect, useState } from 'react'

export type Screen =
  | { name: 'ledger' }
  | { name: 'settings' }
  | { name: 'month-summary'; month: number }
  | { name: 'year-summary' }

const LEDGER: Screen = { name: 'ledger' }

export interface ScreenHistory {
  screen: Screen
  open: (screen: Screen) => void // 장부에서 다른 화면을 연다
  backToLedger: () => void // [← 장부로]: 쌓은 방문 기록을 되돌린다
}

// 이 앱이 pushState 로 쌓은 방문 기록인가
function isOwnEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'screen' in state
}

export function useScreenHistory(): ScreenHistory {
  const [screen, setScreen] = useState<Screen>(LEDGER)

  useEffect(() => {
    // 장부 밖에서 뒤로 버튼을 누르면 쌓아 둔 기록이 빠지며 여기로 온다. 장부에서 누르면 앱 기본 동작(나가기)
    const onPopState = () => setScreen(LEDGER)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return {
    screen,
    open: (next) => {
      window.history.pushState({ screen: next.name }, '')
      setScreen(next)
      window.scrollTo(0, 0)
    },
    backToLedger: () => {
      // 뒤로 버튼과 같은 길로 돌아온다: 쌓은 기록을 빼면 popstate 가 장부를 연다.
      // 바로 장부를 그리고 나중에 popstate 를 받으면, 그 사이 다시 연 화면이 늦게 온 popstate 에 닫힐 수 있다
      if (isOwnEntry(window.history.state)) {
        window.history.back()
      } else {
        // 쌓은 기록이 아닌데 뒤로 가면 앱을 나가 버리므로 화면만 바꾼다 (방어)
        setScreen(LEDGER)
      }
    },
  }
}
