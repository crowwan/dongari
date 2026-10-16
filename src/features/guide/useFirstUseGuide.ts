// 진짜 장부의 복구 코드 안내 말풍선 상태 (SPEC-008 4번).
// - 띄우는 것은 장부 화면이 새로 보일 때(장부로 돌아옴·앱 열기)만 묻는다. 말풍선을 닫은 그리기에서는 다시 묻지 않는다
// - 떠 있는 말풍선은 확인 창 방문 기록 한 칸('guide-4', #110)이다: 뒤로 버튼은 말풍선만 닫고,
//   가리키는 [설정] 을 누르면 설정 화면이 그 칸을 바꿔 끼운다
// - 상태는 이 폰에만(guideStore). 화면은 방문 기록의 확인 창 이름으로 그리므로 상태는 ref 로만 든다
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import type { SheetHistory } from '../useScreenHistory'
import { ACTIVE_GUIDE, GUIDE_OFF, nextGuide, withSeen, type GuideContext, type GuideState } from './guideRules'
import type { GuideStore } from './guideStore'

const GUIDE_DIALOG = 'guide-4'

export type FirstUseGuide = {
  settings: RefObject<HTMLButtonElement | null> // 가리키는 위쪽 [설정]. 장부 화면이 버튼에 붙인다
  showing: boolean // 말풍선이 떠 있다
  activate: () => void // 첫 실행에서 첫 장부를 만들었다
  turnOff: () => void // 첫 실행에서 기록 파일·복구 코드로 불러왔다 (이미 쓰던 분)
  dismiss: () => void // [알겠어요]·[✕]
  pressTarget: () => void // 가리키는 [설정] 을 눌렀다 (설정을 여는 일은 버튼이 한다)
}

type FirstUseGuideOptions = {
  // 없으면 안내를 하지 않는다 (테스트·카탈로그)
  store: GuideStore | undefined
  // 화면이 새로 보일 때마다 바뀌는 값 (방문 기록의 화면). 바뀔 때만 말풍선을 묻는다
  visit: unknown
  context: Omit<GuideContext, 'state'>
  dialogs: SheetHistory
}

export function useFirstUseGuide({ store, visit, context, dialogs }: FirstUseGuideOptions): FirstUseGuide {
  const [loaded] = useState(() => store?.load())
  const state = useRef<GuideState | undefined>(loaded)
  const settings = useRef<HTMLButtonElement>(null)
  const showing = dialogs.dialog === GUIDE_DIALOG

  function save(next: GuideState) {
    if (next === state.current) return
    state.current = next
    store?.save(next)
  }

  // 어떤 방법으로 닫든 다시 나오지 않는다 (앱을 다시 열어도)
  function markSeen() {
    if (state.current) save(withSeen(state.current, 4))
  }

  const onVisit = useEffectEvent(() => {
    if (!store || nextGuide({ state: state.current, ...context }) === undefined) return
    dialogs.openDialog(GUIDE_DIALOG, markSeen)
  })

  useEffect(() => {
    onVisit()
  }, [visit])

  return {
    settings,
    showing,
    activate: () => save(ACTIVE_GUIDE),
    turnOff: () => save(GUIDE_OFF),
    dismiss: () => {
      if (!showing) return
      markSeen()
      dialogs.closeDialog()
    },
    pressTarget: () => {
      if (showing) markSeen()
    },
  }
}
