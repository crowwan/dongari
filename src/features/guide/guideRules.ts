// 진짜 장부의 안내 말풍선 규칙 (SPEC-008 "진짜 장부의 말풍선: 복구 코드 안내 하나만"). 띄울지를 순수 함수로 정한다.
// #122 의 말풍선 1·2·3(내역 적기·N월 정리 보기·결산)은 연습 장부가 대신해 없앴고 4번(복구 코드 보내기)만 남는다

// 띄우는 말풍선 번호. 4 하나
export type GuideNumber = 4

// 기기에 남은 본 번호. #122 시절 값에 1·2·3 이 있어도 읽기는 그대로 받고 무시한다
export type SeenGuideNumber = 1 | 2 | 3 | GuideNumber

export const SEEN_GUIDE_NUMBERS: readonly SeenGuideNumber[] = [1, 2, 3, 4]

// 기기에만 두는 안내 상태 (dongari:guide). active: 안내 켜짐, seen: 닫은 말풍선 번호
export type GuideState = { v: 1; active: boolean; seen: SeenGuideNumber[] }

export const GUIDE_OFF: GuideState = { v: 1, active: false, seen: [] }
export const ACTIVE_GUIDE: GuideState = { v: 1, active: true, seen: [] }

// 말풍선이 뜰 수 있는 화면. 나머지는 other
export type GuideScreen = 'ledger' | 'other'

export type GuideContext = {
  // 값이 없으면(아직 정하지 않음) 끈 것과 같다
  state: GuideState | undefined
  screen: GuideScreen
  entryCount: number // 모든 장부를 합한 기록 수 (연습 장부는 메모리라 세지 않는다)
  keepUsable: boolean // 자동으로 지키기를 쓸 수 있다 (서버 주소 있는 빌드 + 켜짐 + 복구 코드 있음)
  blocked: boolean // 확인 창·선택 창·저장 안내 띠가 있다
}

// 지금 띄울 말풍선 번호: 장부 화면, 기록 3건 이상, 자동으로 지키기를 쓸 수 있고, 아직 4번을 닫지 않았을 때
export function nextGuide({ state, screen, entryCount, keepUsable, blocked }: GuideContext): GuideNumber | undefined {
  if (!state?.active || blocked || state.seen.includes(4)) return undefined
  return screen === 'ledger' && entryCount >= 3 && keepUsable ? 4 : undefined
}

export function withSeen(state: GuideState, guide: GuideNumber): GuideState {
  return state.seen.includes(guide) ? state : { ...state, seen: [...state.seen, guide] }
}
