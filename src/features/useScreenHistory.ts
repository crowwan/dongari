// 장부와 그 밖의 화면 오가기 (SPEC-001 화면 구성, 탭 없음)
// 장부 외 화면(입력창 포함)을 열 때 방문 기록을 하나 쌓아, 안드로이드 뒤로 버튼(popstate)이 앱을 나가지 않고 장부로 돌아오게 한다.
// 적던 내용이 있는 화면은 닫기 전 확인을 받는다: 화면이 confirmBeforeLeave(true) 로 알려 두면
// [← 장부로](requestBack)와 뒤로 버튼 모두 바로 닫지 않고 confirmingLeave 를 켠다. 확인 창은 App 이 그린다
import { useEffect, useEffectEvent, useRef, useState } from 'react'

export type Screen =
  | { name: 'ledger' }
  | { name: 'settings' }
  | { name: 'month-summary'; month: number }
  | { name: 'year-summary' }
  | { name: 'add-entry'; month: number } // 내역 적기. month: 장부에서 보던 달 (입력 월 기본값)
  | { name: 'edit-entry'; id: string } // 내역 고치기. id: 고칠 기록

const LEDGER: Screen = { name: 'ledger' }

export interface ScreenHistory {
  screen: Screen
  open: (screen: Screen) => void // 장부에서 다른 화면을 연다
  requestBack: () => void // [← 장부로]: 닫기 전 확인이 필요하면 묻고, 아니면 장부로
  backToLedger: () => void // 묻지 않고 장부로 (저장·지우기 뒤, 설정에서 연도 고른 뒤)
  confirmBeforeLeave: (needed: boolean) => void // 지금 화면이 닫히기 전 확인을 받을지 (적던 내용이 있는지)
  confirmingLeave: boolean // 닫을지 묻는 중
  confirmLeave: () => void // 확인 창 [버리기]
  cancelLeave: () => void // 확인 창 [아니요]
}

type HistoryState = { screen: Screen['name'] }

// 이 앱이 pushState 로 쌓은 방문 기록인가
function isOwnEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'screen' in state
}

export function useScreenHistory(): ScreenHistory {
  const [screen, setScreen] = useState<Screen>(LEDGER)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const leaveNeedsConfirm = useRef(false)
  // 쌓은 기록을 되돌리고 popstate 를 기다리는 중. 이때 또 되돌리면 장부 기록까지 빠져 앱이 닫힌다
  const goingBack = useRef(false)

  function show(next: Screen) {
    leaveNeedsConfirm.current = false
    goingBack.current = false
    setConfirmingLeave(false)
    setScreen(next)
  }

  function pushEntry(name: Screen['name']) {
    const state: HistoryState = { screen: name }
    window.history.pushState(state, '')
  }

  function backToLedger() {
    if (goingBack.current) return
    setConfirmingLeave(false)
    // 뒤로 버튼과 같은 길로 돌아온다: 쌓은 기록을 빼면 popstate 가 장부를 연다.
    // 바로 장부를 그리고 나중에 popstate 를 받으면, 그 사이 다시 연 화면이 늦게 온 popstate 에 닫힐 수 있다
    if (isOwnEntry(window.history.state)) {
      goingBack.current = true
      window.history.back()
    } else {
      // 쌓은 기록이 아닌데 뒤로 가면 앱을 나가 버리므로 화면만 바꾼다 (방어)
      show(LEDGER)
    }
  }

  // 장부 밖에서 뒤로 버튼을 누르면 쌓아 둔 기록이 빠지며 여기로 온다. 장부에서 누르면 앱 기본 동작(나가기)
  const onPopState = useEffectEvent(() => {
    const needsConfirm = leaveNeedsConfirm.current && !goingBack.current
    if (!needsConfirm) {
      show(LEDGER)
      return
    }
    // 화면은 그대로 두고 빠진 기록을 바로 다시 쌓는다. 확인 창이 떠 있는 동안 또 눌러도 앱이 나가지지 않고,
    // [아니요] 뒤에 다시 누르면 또 묻는다. [버리기] 는 이 기록을 되돌려 장부로 간다
    pushEntry(screen.name)
    // 확인 창이 이미 떠 있으면 뒤로 버튼은 [아니요] 와 같다
    setConfirmingLeave(!confirmingLeave)
  })

  useEffect(() => {
    const listener = () => onPopState()
    window.addEventListener('popstate', listener)
    return () => window.removeEventListener('popstate', listener)
  }, [])

  return {
    screen,
    open: (next) => {
      pushEntry(next.name)
      show(next)
      window.scrollTo(0, 0)
    },
    requestBack: () => {
      if (leaveNeedsConfirm.current) setConfirmingLeave(true)
      else backToLedger()
    },
    backToLedger,
    confirmBeforeLeave: (needed) => {
      leaveNeedsConfirm.current = needed
    },
    confirmingLeave,
    confirmLeave: backToLedger,
    cancelLeave: () => setConfirmingLeave(false),
  }
}
