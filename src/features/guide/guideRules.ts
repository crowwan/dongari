// 처음 쓰는 분 안내 말풍선 규칙 (SPEC-008). 어느 화면에서 몇 번 말풍선을 띄울지 순수 함수로 정한다

export type GuideNumber = 1 | 2 | 3 | 4

export const GUIDE_NUMBERS: readonly GuideNumber[] = [1, 2, 3, 4]

// 기기에만 두는 안내 상태 (dongari:guide). active: 안내 켜짐, seen: 닫은(지나간) 말풍선 번호
export type GuideState = { v: 1; active: boolean; seen: GuideNumber[] }

export const GUIDE_OFF: GuideState = { v: 1, active: false, seen: [] }
export const ACTIVE_GUIDE: GuideState = { v: 1, active: true, seen: [] }

// 말풍선이 뜰 수 있는 화면. 나머지는 other
export type GuideScreen = 'ledger' | 'year-summary' | 'other'

export type GuideContext = {
  // 값이 없으면(아직 정하지 않음) 끈 것과 같다
  state: GuideState | undefined
  screen: GuideScreen
  entryCount: number // 모든 장부를 합한 기록 수
  monthHasEntries: boolean // 장부 화면에서 보는 달에 기록이 있다 ([N월 정리 보기] 가 보인다)
  yearHasEntries: boolean // 올해 결산 화면의 장부에 기록이 있다 (결산 아래 버튼을 누를 수 있다)
  keepUsable: boolean // 자동으로 지키기를 쓸 수 있다 (서버 주소 있는 빌드 + 켜짐 + 복구 코드 있음)
  blocked: boolean // 확인 창·선택 창·저장 안내 띠가 있다
}

// 각 말풍선이 뜨는 때 (스펙 "말풍선 네 개" 표)
function isDue(guide: GuideNumber, context: GuideContext): boolean {
  const { screen, entryCount, monthHasEntries, yearHasEntries, keepUsable } = context
  switch (guide) {
    case 1:
      return screen === 'ledger' && entryCount === 0
    case 2:
      return screen === 'ledger' && entryCount >= 1 && monthHasEntries
    case 3:
      return screen === 'year-summary' && yearHasEntries
    case 4:
      return screen === 'ledger' && entryCount >= 3 && keepUsable
  }
}

// 지금 띄울 말풍선 번호. 한 화면에 하나 — 같이 걸리면 번호가 작은 것
export function nextGuide(context: GuideContext): GuideNumber | undefined {
  const { state, blocked } = context
  if (!state?.active || blocked) return undefined
  return GUIDE_NUMBERS.find((guide) => !state.seen.includes(guide) && isDue(guide, context))
}

export function withSeen(state: GuideState, guide: GuideNumber): GuideState {
  return state.seen.includes(guide) ? state : { ...state, seen: [...state.seen, guide] }
}

// 뜨는 때가 지난 말풍선을 본 것으로 친다: 1번을 보기 전에 기록이 생겼으면 1번은 넘어간다 (나중에 기록을 다 지워도 다시 뜨지 않게)
export function withPassedGuides(state: GuideState, entryCount: number): GuideState {
  return entryCount > 0 ? withSeen(state, 1) : state
}
