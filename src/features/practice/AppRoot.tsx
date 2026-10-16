import { useEffect, useEffectEvent, useId, useRef, useState, type ComponentProps } from 'react'
import App from '../../App'
import type { BookKind } from '../../domain/types'
import type { LoadResult } from '../../storage/LedgerRepository'
import { isRecord } from '../../storage/schema'
import { browserInstallEnvironment } from '../install/installPrompt'
import { entriesAboveLedger } from '../useScreenHistory'
import { asksInstallAfterPractice, opensInKakao } from './askInstall'
import { PracticeInstall } from './PracticeInstall'
import type { PracticeMarkStore } from './practiceMark'
import { FirstRunQuestion, PracticeEnd } from './PracticeScreens'
import { PracticeRun } from './PracticeRun'

type AppRootProps = Omit<ComponentProps<typeof App>, 'practice' | 'onStartPractice' | 'onFirstRunChange'> & {
  // 첫 실행 연습을 마쳤다는 표시 (SPEC-009 B, 이 폰에만). 없으면 표시를 남기지도 보지도 않는다
  practiceMarkStore?: PracticeMarkStore
}

// 연습을 어디서 열었나: 첫 실행 물음 / 설정 [연습해 보기] (돌아갈 진짜 장부 데이터)
type PracticeOrigin = { firstRun: true } | { firstRun: false; back: LoadResult }

// 연습 끝 화면. asksInstall: 다음에 "홈 화면에 추가하시겠어요?" 를 묻는다 (SPEC-009 B)
type EndMode = { name: 'end'; origin: PracticeOrigin; sent: boolean; month: number; asksInstall: boolean }

type Mode =
  | { name: 'ask' } // 첫 실행 물음
  | { name: 'app'; loaded: LoadResult } // 진짜 App
  | { name: 'practice'; origin: PracticeOrigin; kind: BookKind; now: Date } // 연습 장부
  | EndMode
  | { name: 'install'; end: EndMode } // 홈 화면에 추가하시겠어요?·설치 확인 (SPEC-009 B ②③, 첫 실행 연습만). end: 뒤로 버튼으로 돌아갈 끝 화면

// 앱을 열고 뒤로 버튼을 다룰 때까지 기다리는 방문 기록 일: steps 만큼 되돌린 뒤 then
type HistoryTask = { steps: number; then?: () => void }

// 앱 맨 바깥 (SPEC-008): 첫 실행 물음 → 진짜 App / 연습 장부 → 끝 화면을 갈아 끼운다.
// 연습은 진짜 App 을 내리고 메모리 저장소의 App 을 그린다. 연습이 끝나면 진짜 App 을 처음부터 다시 그린다
// (설정에서 열었으면 연습 직전의 진짜 장부 데이터로).
//
// 방문 기록: 물음 위에 이 앱 표시가 붙은 칸(장부 칸 모양)을 하나 쌓고 그 위에서 진짜 App·연습이 제 칸을 쌓는다.
// - 첫 실행 새 장부 만들기에서 뒤로 버튼으로 이 칸이 빠지면 물음으로 돌아온다 (물음에서 뒤로 버튼은 앱을 닫는다)
// - 연습이 끝나면 연습이 쌓은 칸을 표시 칸까지 되돌린다(첫 실행은 그 칸이 새 장부 만들기 칸, 설정에서 열었으면 그 칸도 뺀다)
// - 끝 화면 다음 홈 화면에 추가를 물으면(SPEC-009 B) 표시 칸 위에 그 화면 칸을 하나 쌓는다. 뒤로 버튼은 끝 화면으로,
//   설치 확인(③)에서는 [새 장부 만들기] 와 같다
export function AppRoot({ practiceMarkStore, ...props }: AppRootProps) {
  const { loaded, options, saver, installOfferStore, install = browserInstallEnvironment() } = props
  const rootMark = useId()
  // 첫 실행 연습을 마쳤는데 아직 장부가 없으면 물음 없이 새 장부 만들기로 연다 (SPEC-009 B, 설치 확인에서 아이콘으로 먼저 연 경우)
  const [startsAtNewBook] = useState(() => loaded.data.books.length === 0 && (practiceMarkStore?.load() ?? false))
  const [mode, setMode] = useState<Mode>(() =>
    loaded.data.books.length === 0 && !startsAtNewBook ? { name: 'ask' } : { name: 'app', loaded },
  )
  // 진짜 App 이 장부 없는 첫 실행 화면인지 (App 이 알린다)
  const firstRunApp = useRef(loaded.data.books.length === 0)
  // 화면을 갈아 끼운 뒤 할 방문 기록 일, 그 되돌리기가 끝나면(popstate) 할 일
  const pendingTask = useRef<HistoryTask | undefined>(undefined)
  const afterReturn = useRef<(() => void) | undefined>(undefined)

  const now = () => options?.now?.() ?? new Date()
  const markedEntry = { screen: 'ledger', root: rootMark }
  const isMarked = (state: unknown) => isRecord(state) && state.root === rootMark
  const markHere = () => window.history.replaceState(markedEntry, '')

  // 물음 칸 위에 표시 칸을 쌓아 둔다 (새 장부 만들기에서 뒤로 버튼은 물음으로). 이미 쌓았으면(다시 그리기·새로 고침) 그대로
  useEffect(() => {
    const state: unknown = window.history.state
    const marked = isRecord(state) && state.root === rootMark
    if (startsAtNewBook && !marked) window.history.pushState({ screen: 'ledger', root: rootMark }, '')
  }, [startsAtNewBook, rootMark])

  // 연습 App 이 내려간 뒤에(그 뒤로 버튼 듣기가 빠진 뒤에) 되돌린다
  useEffect(() => {
    const task = pendingTask.current
    pendingTask.current = undefined
    if (!task) return
    if (task.steps <= 0) {
      task.then?.()
      return
    }
    afterReturn.current = task.then ?? (() => {})
    window.history.go(-task.steps)
  }, [mode])

  // 그만할까요 [그만하기]: 첫 실행이면 새 장부 만들기(표시 칸 위), 설정에서 열었으면 진짜 장부(표시 칸도 뺌)
  function stopPractice(origin: PracticeOrigin) {
    if (origin.firstRun) {
      pendingTask.current = { steps: entriesAboveLedger(window.history.state), then: markHere }
      setMode({ name: 'app', loaded })
      return
    }
    pendingTask.current = { steps: entriesAboveLedger(window.history.state) + 1 }
    setMode({ name: 'app', loaded: origin.back })
  }

  // 끝 화면 주 버튼(또는 뒤로 버튼): 물을 차례면 홈 화면에 추가하시겠어요?, 첫 실행이면 새 장부 만들기, 설정에서 열었으면 진짜 장부
  function leaveEnd(end: EndMode, byBack: boolean) {
    const { origin } = end
    if (end.asksInstall) {
      if (byBack) window.history.pushState(markedEntry, '')
      window.history.pushState({ ...markedEntry, step: 'install' }, '')
      setMode({ name: 'install', end })
      return
    }
    if (origin.firstRun) {
      // 뒤로 버튼으로 표시 칸이 빠졌으면 다시 쌓는다 (새 장부 만들기에서 뒤로 버튼은 물음으로)
      if (byBack) window.history.pushState(markedEntry, '')
      setMode({ name: 'app', loaded })
      return
    }
    if (!byBack) pendingTask.current = { steps: 1 }
    setMode({ name: 'app', loaded: origin.back })
  }

  // 홈 화면에 추가 묻기에서 진짜 새 장부 만들기로: 그 화면 칸을 빼서 표시 칸(새 장부 만들기 칸)으로 (뒤로 버튼이면 이미 빠졌다)
  function installToNewBook(byBack: boolean) {
    if (!byBack) pendingTask.current = { steps: 1 }
    setMode({ name: 'app', loaded })
  }

  // 연습이 끝 화면에 닿았다: 첫 실행이면 이 폰에 표시를 남기고, 홈 화면에 추가를 물을지 정한다
  function reachEnd(origin: PracticeOrigin, sent: boolean, month: number) {
    if (origin.firstRun) practiceMarkStore?.save()
    const asksInstall = asksInstallAfterPractice({
      firstRun: origin.firstRun,
      standalone: install.standalone,
      installed: install.installPrompt.getSnapshot().installed,
      inApp: opensInKakao(install.userAgent),
    })
    setMode({ name: 'end', origin, sent, month, asksInstall })
  }

  const onPopState = useEffectEvent(() => {
    const then = afterReturn.current
    if (then) {
      afterReturn.current = undefined
      then()
      return
    }
    if (mode.name === 'app' && firstRunApp.current && !isMarked(window.history.state)) setMode({ name: 'ask' })
    if (mode.name === 'end') leaveEnd(mode, true)
    // 홈 화면에 추가 묻기의 뒤로 버튼은 그 화면(PracticeInstall)이 다룬다 (그림 안내 창이 떠 있으면 창만 닫는다)
  })

  useEffect(() => {
    const listener = () => onPopState()
    window.addEventListener('popstate', listener)
    return () => window.removeEventListener('popstate', listener)
  }, [])

  switch (mode.name) {
    case 'ask':
      return (
        <FirstRunQuestion
          onPractice={() => {
            window.history.pushState(markedEntry, '')
            setMode({ name: 'practice', origin: { firstRun: true }, kind: 'club', now: now() })
          }}
          onStart={() => {
            window.history.pushState(markedEntry, '')
            setMode({ name: 'app', loaded })
          }}
        />
      )
    case 'app':
      return (
        <App
          {...props}
          loaded={mode.loaded}
          onFirstRunChange={(firstRun) => {
            firstRunApp.current = firstRun
          }}
          onStartPractice={(kind, back) => {
            // 설정 칸을 표시 칸으로 바꿔 끼운다: 연습이 끝나면 그 칸까지 빼서 진짜 장부 칸으로 돌아온다
            markHere()
            setMode({ name: 'practice', origin: { firstRun: false, back }, kind, now: now() })
          }}
        />
      )
    case 'practice': {
      const { origin } = mode
      return (
        <PracticeRun
          kind={mode.kind}
          now={mode.now}
          saver={saver}
          onStop={() => stopPractice(origin)}
          onFinish={(sent) => {
            // 끝 화면은 연습이 쌓은 칸을 표시 칸까지 되돌린 자리에 둔다 (끝 화면의 뒤로 버튼 = 주 버튼)
            pendingTask.current = { steps: entriesAboveLedger(window.history.state), then: markHere }
            reachEnd(origin, sent, mode.now.getMonth() + 1)
          }}
        />
      )
    }
    case 'end':
      return (
        <PracticeEnd
          firstRun={mode.origin.firstRun}
          asksInstall={mode.asksInstall}
          sent={mode.sent}
          month={mode.month}
          onDone={() => leaveEnd(mode, false)}
        />
      )
    case 'install': {
      const { end } = mode
      return (
        <PracticeInstall
          install={install}
          onBack={() => setMode(end)}
          onLater={() => {
            // 방금 거절한 걸 첫 장부 뒤 카드로 또 묻지 않는다. 다시 하는 길은 설정 [홈 화면에 추가] 줄
            installOfferStore?.save('done')
            installToNewBook(false)
          }}
          onAnswered={() => installOfferStore?.save('done')}
          onNewBook={installToNewBook}
        />
      )
    }
  }
}
