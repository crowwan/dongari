import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useInstallAction, type GuideSheetHistory } from '../install/installAction'
import { InstallGuideSheet } from '../install/InstallGuideSheet'
import { useInstallPrompt, type InstallEnvironment } from '../install/installPrompt'
import { InstallAsk, InstallCheck } from './PracticeScreens'

// 그림 안내 선택 창 이름 (설정 줄은 settings-install-guide, 장부 위 카드는 ledger-install-guide)
const PRACTICE_INSTALL_GUIDE_SHEET = 'practice-install-guide'

type PracticeInstallProps = {
  install: InstallEnvironment
  onBack: () => void // ② 에서 뒤로 버튼: 끝 화면으로 (이 화면 칸은 이미 빠졌다)
  onLater: () => void // ② [다음에 할게요]
  onAnswered: () => void // ③ 에 왔다 (설치했든 [다 했어요] 든)
  onNewBook: (byBack: boolean) => void // ③ [새 장부 만들기] 또는 뒤로 버튼 (byBack 이면 이 화면 칸은 이미 빠졌다)
}

// 연습 끝 "홈 화면에 추가하시겠어요?"(②)와 설치 확인(③) (SPEC-009 B).
// 두 화면은 방문 기록 한 칸을 같이 쓴다(③ 은 ② 칸을 바꿔 끼운 것과 같다). 그림 안내 창은 그 위에 한 칸 더 쌓는다
export function PracticeInstall({ install, onBack, onLater, onAnswered, onNewBook }: PracticeInstallProps) {
  const [finishedGuide, setFinishedGuide] = useState(false)
  const { installed } = useInstallPrompt(install.installPrompt)
  // 설치 신호(설치 창 수락·appinstalled)가 오면 어디서든 "추가했어요", [다 했어요] 로만 닫았으면 "생겼나요?"
  const phase = installed ? 'installed' : finishedGuide ? 'unsure' : 'ask'
  const sheets = useGuideSheetHistory(() => (phase === 'ask' ? onBack() : onNewBook(true)))
  const action = useInstallAction(install, sheets, PRACTICE_INSTALL_GUIDE_SHEET)

  const answered = phase !== 'ask'
  const reportAnswered = useEffectEvent(onAnswered)
  useEffect(() => {
    if (answered) reportAnswered()
  }, [answered])

  return (
    <>
      {phase === 'ask' ? (
        <InstallAsk onAdd={action.start} onLater={onLater} />
      ) : (
        <InstallCheck
          confirmed={phase === 'installed'}
          onNewBook={() => onNewBook(false)}
          onRetry={() => sheets.openSheet(PRACTICE_INSTALL_GUIDE_SHEET)}
        />
      )}
      <InstallGuideSheet
        install={install}
        sheets={sheets}
        guideSheet={PRACTICE_INSTALL_GUIDE_SHEET}
        onFinished={() => setFinishedGuide(true)}
      />
    </>
  )
}

// App 밖 화면의 선택 창 방문 기록 (useScreenHistory 의 선택 창 부분과 같은 규칙):
// 열 때 한 칸 쌓고, 화면에서 닫으면 그 칸을 되돌리고, 뒤로 버튼은 창만 닫는다. 창이 없을 때 뒤로 버튼은 onBack
function useGuideSheetHistory(onBack: () => void): GuideSheetHistory {
  const [sheet, setSheet] = useState<string | null>(null)
  const sheetRef = useRef<string | null>(null)
  // 화면에서 창을 닫아 그 칸을 되돌리는 중. 이 popstate 는 화면을 바꾸지 않는다
  const closingSheet = useRef(false)

  function changeSheet(next: string | null) {
    sheetRef.current = next
    setSheet(next)
  }

  const onPopState = useEffectEvent(() => {
    if (closingSheet.current) {
      closingSheet.current = false
      return
    }
    if (sheetRef.current !== null) {
      changeSheet(null)
      return
    }
    onBack()
  })

  useEffect(() => {
    const listener = () => onPopState()
    window.addEventListener('popstate', listener)
    return () => window.removeEventListener('popstate', listener)
  }, [])

  return {
    sheet,
    openSheet: (name) => {
      if (sheetRef.current === null) window.history.pushState({ ...stateRecord(window.history.state), sheet: name }, '')
      changeSheet(name)
    },
    closeSheet: () => {
      if (sheetRef.current === null) return
      changeSheet(null)
      closingSheet.current = true
      window.history.back()
    },
  }
}

function stateRecord(state: unknown): object {
  return typeof state === 'object' && state !== null ? state : {}
}
