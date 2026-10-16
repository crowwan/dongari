// 처음 쓰는 분 안내 말풍선 상태 (SPEC-008).
// - 띄우는 것은 화면이 새로 보일 때(장부로 돌아옴·앱 열기·결산 열기)만 묻는다. 말풍선을 닫은 그리기에서는 묻지 않아
//   닫자마자 다음 말풍선이 잇따라 뜨지 않는다
// - 떠 있는 말풍선은 확인 창 방문 기록 한 칸('guide-N', #110)이다: 뒤로 버튼은 말풍선만 닫고, 다른 화면을 열면 저절로 닫힌다
// - 상태는 이 폰에만(guideStore). 화면은 방문 기록의 확인 창 이름으로 그리므로 상태는 ref 로만 든다
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import type { SheetHistory } from '../useScreenHistory'
import { GUIDE_OPENS_SCREEN } from './guideMessages'
import {
  ACTIVE_GUIDE,
  GUIDE_NUMBERS,
  GUIDE_OFF,
  nextGuide,
  withPassedGuides,
  withSeen,
  type GuideContext,
  type GuideNumber,
  type GuideState,
} from './guideRules'
import type { GuideStore } from './guideStore'

// 말풍선이 가리키는 버튼들. 화면이 버튼에 붙인다
export type GuideTargets = {
  addEntry: RefObject<HTMLButtonElement | null> // 1 장부 아래 [+ 내역 적기]
  monthSummary: RefObject<HTMLButtonElement | null> // 2 [N월 정리 보기]
  yearAction: RefObject<HTMLButtonElement | null> // 3 올해 결산 아래 버튼 (YEAR_GUIDE_TARGET)
  settings: RefObject<HTMLButtonElement | null> // 4 위쪽 [설정]
}

export type FirstUseGuide = {
  targets: GuideTargets
  showing: GuideNumber | undefined // 떠 있는 말풍선
  activate: () => void // 첫 실행에서 첫 장부를 만들었다
  turnOff: () => void // 첫 실행에서 기록 파일·복구 코드로 불러왔다 (이미 쓰던 분)
  dismiss: () => void // [알겠어요]·[✕]
  pressTarget: () => void // 가리키는 버튼을 눌렀다 (버튼의 일은 버튼이 한다)
}

type FirstUseGuideOptions = {
  // 없으면 안내를 하지 않는다 (테스트·카탈로그)
  store: GuideStore | undefined
  // 화면이 새로 보일 때마다 바뀌는 값 (방문 기록의 화면). 바뀔 때만 말풍선을 묻는다
  visit: unknown
  context: Omit<GuideContext, 'state'>
  dialogs: SheetHistory
}

const dialogName = (guide: GuideNumber) => `guide-${guide}`

export function useFirstUseGuide({ store, visit, context, dialogs }: FirstUseGuideOptions): FirstUseGuide {
  const [loaded] = useState(() => store?.load())
  const state = useRef<GuideState | undefined>(loaded)
  const targets: GuideTargets = {
    addEntry: useRef<HTMLButtonElement>(null),
    monthSummary: useRef<HTMLButtonElement>(null),
    yearAction: useRef<HTMLButtonElement>(null),
    settings: useRef<HTMLButtonElement>(null),
  }
  const showing = GUIDE_NUMBERS.find((guide) => dialogs.dialog === dialogName(guide))

  function save(next: GuideState) {
    if (next === state.current) return
    state.current = next
    store?.save(next)
  }

  // 어떤 방법으로 닫든 그 말풍선은 다시 나오지 않는다 (앱을 다시 열어도)
  function markSeen(guide: GuideNumber) {
    if (state.current) save(withSeen(state.current, guide))
  }

  const onVisit = useEffectEvent(() => {
    if (!store || !state.current?.active) return
    save(withPassedGuides(state.current, context.entryCount))
    const guide = nextGuide({ state: state.current, ...context })
    if (guide !== undefined) dialogs.openDialog(dialogName(guide), () => markSeen(guide))
  })

  useEffect(() => {
    onVisit()
  }, [visit])

  return {
    targets,
    showing,
    activate: () => save(ACTIVE_GUIDE),
    turnOff: () => save(GUIDE_OFF),
    dismiss: () => {
      if (showing === undefined) return
      markSeen(showing)
      dialogs.closeDialog()
    },
    pressTarget: () => {
      if (showing === undefined) return
      markSeen(showing)
      // 화면을 여는 버튼이면 그 화면이 말풍선 칸을 바꿔 끼운다. 아니면 말풍선 칸을 되돌린다
      if (!GUIDE_OPENS_SCREEN[showing]) dialogs.closeDialog()
    },
  }
}
