// 장부와 그 밖의 화면 오가기 (SPEC-001 화면 구성, 탭 없음)
// 장부 외 화면(입력창 포함)을 열 때 방문 기록을 하나 쌓아, 안드로이드 뒤로 버튼(popstate)이 앱을 나가지 않고 장부로 돌아오게 한다.
// 적던 내용이 있는 화면은 닫기 전 확인을 받는다: 화면이 confirmBeforeLeave(true) 로 알려 두면
// [← 장부로](requestBack)와 뒤로 버튼 모두 바로 닫지 않고 confirmingLeave 를 켠다. 확인 창은 App 이 그린다
//
// 선택 창(덮개: BottomSheet, 설정의 편집 화면처럼 화면 위에 잠깐 뜨는 것)도 같은 방문 기록으로 닫는다:
// - 열 때 openSheet('month') → 방문 기록 한 칸 { screen, sheet } 을 쌓고 sheet 가 'month' 가 된다
// - 안드로이드 뒤로 버튼 → 그 칸이 빠지며 선택 창만 닫힌다 (화면·버릴까요 확인보다 먼저)
// - 화면에서 닫을 때(고르기, 바깥 누르기, Esc, [닫기]) closeSheet() → 쌓은 칸을 back() 으로 되돌린다
// - 고르자마자 장부로 갈 때(설정의 연도) 는 closeSheet 없이 backToLedger() 하나만 부른다 → 두 칸을 go(-2) 로 한 번에
// - 창에서 다른 화면을 열 때(장부 고르기 창의 [+ 새 장부 만들기]) 는 closeSheet 없이 open() 하나만 부른다 → 창의 칸을 그 화면 칸으로 바꿔 끼운다
// 사용 예:
//   <MonthStepper onPickMonth={() => history.openSheet('month')} ... />
//   <BottomSheet open={history.sheet === 'month'} title="몇 월인가요?" onClose={history.closeSheet}>
//     <MonthPicker value={month} onChange={(m) => { setMonth(m); history.closeSheet() }} />
//   </BottomSheet>
import { useEffect, useEffectEvent, useRef, useState } from 'react'

export type Screen =
  | { name: 'ledger' }
  | { name: 'settings' }
  | { name: 'month-summary'; month: number }
  | { name: 'year-summary' }
  | { name: 'add-entry'; month: number } // 내역 적기. month: 장부에서 보던 달 (입력 월 기본값)
  | { name: 'edit-entry'; id: string } // 내역 고치기. id: 고칠 기록
  | { name: 'new-book' } // 새 장부 만들기 (SPEC-005, 장부 고르기 창에서)

const LEDGER: Screen = { name: 'ledger' }

export interface ScreenHistory extends SheetHistory {
  screen: Screen
  open: (screen: Screen) => void // 장부에서 다른 화면을 연다
  requestBack: () => void // [← 장부로]: 닫기 전 확인이 필요하면 묻고, 아니면 장부로
  backToLedger: () => void // 묻지 않고 장부로 (저장·지우기 뒤, 설정에서 연도 고른 뒤)
  confirmBeforeLeave: (needed: boolean) => void // 지금 화면이 닫히기 전 확인을 받을지 (적던 내용이 있는지)
  confirmingLeave: boolean // 닫을지 묻는 중
  confirmLeave: () => void // 확인 창 [버리기]
  cancelLeave: () => void // 확인 창 [아니요]
}

// 화면 위에 잠깐 뜨는 선택 창(덮개). 화면 컴포넌트는 이 부분만 받는다
export interface SheetHistory {
  sheet: string | null // 열려 있는 선택 창 이름. 없으면 null
  openSheet: (name: string) => void // 선택 창을 연다 (방문 기록 한 칸)
  closeSheet: () => void // 화면에서 선택 창을 닫는다 (쌓은 칸을 되돌림)
}

type HistoryState = { screen: Screen['name']; sheet?: string }

// 이 앱이 pushState 로 쌓은 방문 기록인가
function isOwnEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'screen' in state
}

// 선택 창을 열며 쌓은 방문 기록인가
function isSheetEntry(state: unknown): boolean {
  return isOwnEntry(state) && typeof state === 'object' && state !== null && 'sheet' in state
}

export function useScreenHistory(): ScreenHistory {
  const [screen, setScreen] = useState<Screen>(LEDGER)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const leaveNeedsConfirm = useRef(false)
  // 쌓은 기록을 되돌리고 popstate 를 기다리는 중. 이때 또 되돌리면 장부 기록까지 빠져 앱이 닫힌다
  const goingBack = useRef(false)
  // 열린 선택 창. popstate 처리에서 바로 읽으려고 ref 로도 든다
  const [sheet, setSheet] = useState<string | null>(null)
  const sheetRef = useRef<string | null>(null)
  // 화면에서 선택 창을 닫아 그 칸을 되돌리는 중. 이 popstate 는 화면을 바꾸지 않는다
  const closingSheet = useRef(false)

  function changeSheet(next: string | null) {
    sheetRef.current = next
    setSheet(next)
  }

  function show(next: Screen) {
    leaveNeedsConfirm.current = false
    goingBack.current = false
    closingSheet.current = false
    changeSheet(null)
    setConfirmingLeave(false)
    setScreen(next)
  }

  function pushEntry(name: Screen['name'], sheetName?: string) {
    const state: HistoryState = sheetName === undefined ? { screen: name } : { screen: name, sheet: sheetName }
    window.history.pushState(state, '')
  }

  // 화면 칸 쌓기. 선택 창이 열려 있으면 창의 칸을 화면 칸으로 바꿔 끼운다: 창을 닫는 back() 은 늦게 오는 popstate 라
  // 바로 이어 쌓으면 순서가 꼬이고, 바꿔 끼우면 그 화면에서 뒤로 버튼 한 번에 장부로 온다
  function enterScreen(name: Screen['name']) {
    if (sheetRef.current !== null && isSheetEntry(window.history.state)) {
      const state: HistoryState = { screen: name }
      window.history.replaceState(state, '')
    } else {
      pushEntry(name)
    }
  }

  function closeSheet() {
    if (sheetRef.current === null) return
    changeSheet(null)
    if (isSheetEntry(window.history.state)) {
      closingSheet.current = true
      window.history.back()
    }
  }

  function backToLedger() {
    if (goingBack.current) return
    setConfirmingLeave(false)
    // 선택 창이 열려 있으면 그 칸까지 두 칸을 한 번에 되돌린다 (back() 을 두 번 부르면 브라우저마다 다르게 움직인다)
    const steps = sheetRef.current !== null && isSheetEntry(window.history.state) ? 2 : 1
    changeSheet(null)
    // 뒤로 버튼과 같은 길로 돌아온다: 쌓은 기록을 빼면 popstate 가 장부를 연다.
    // 바로 장부를 그리고 나중에 popstate 를 받으면, 그 사이 다시 연 화면이 늦게 온 popstate 에 닫힐 수 있다
    if (isOwnEntry(window.history.state)) {
      goingBack.current = true
      if (steps === 2) window.history.go(-2)
      else window.history.back()
    } else {
      // 쌓은 기록이 아닌데 뒤로 가면 앱을 나가 버리므로 화면만 바꾼다 (방어)
      show(LEDGER)
    }
  }

  // 장부 밖에서 뒤로 버튼을 누르면 쌓아 둔 기록이 빠지며 여기로 온다. 장부에서 누르면 앱 기본 동작(나가기)
  const onPopState = useEffectEvent(() => {
    // 화면에서 닫은 선택 창의 칸이 빠졌다: 이미 닫혔으니 할 일 없음
    if (closingSheet.current) {
      closingSheet.current = false
      return
    }
    // 선택 창이 열려 있으면 뒤로 버튼은 선택 창만 닫는다
    if (sheetRef.current !== null && !goingBack.current) {
      changeSheet(null)
      return
    }
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
      enterScreen(next.name)
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
    sheet,
    openSheet: (name) => {
      // 이미 열려 있으면 칸을 또 쌓지 않고 바꿔 끼운다
      if (sheetRef.current !== null) {
        changeSheet(name)
        return
      }
      pushEntry(screen.name, name)
      changeSheet(name)
    },
    closeSheet,
  }
}
