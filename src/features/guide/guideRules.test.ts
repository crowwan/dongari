import { describe, expect, it } from 'vitest'
import { ACTIVE_GUIDE, nextGuide, withPassedGuides, withSeen, type GuideContext, type GuideState } from './guideRules'

// 안내가 켜진 폰, 장부 화면, 아무것도 막지 않는 기본값
function context(overrides: Partial<GuideContext> = {}): GuideContext {
  return {
    state: ACTIVE_GUIDE,
    screen: 'ledger',
    entryCount: 0,
    monthHasEntries: false,
    yearHasEntries: false,
    keepUsable: true,
    blocked: false,
    ...overrides,
  }
}

const seen = (...numbers: GuideState['seen']): GuideState => ({ v: 1, active: true, seen: numbers })

describe('SPEC-008 말풍선 규칙 (nextGuide)', () => {
  it('장부 화면에 기록이 하나도 없으면 1번 ([+ 내역 적기])', () => {
    expect(nextGuide(context())).toBe(1)
  })

  it('기록이 생기고 보는 달에 [N월 정리 보기] 가 보이면 2번', () => {
    expect(nextGuide(context({ state: seen(1), entryCount: 1, monthHasEntries: true }))).toBe(2)
  })

  it('보는 달에 기록이 없어 [N월 정리 보기] 가 없으면 2번을 띄우지 않는다', () => {
    expect(nextGuide(context({ state: seen(1), entryCount: 1, monthHasEntries: false }))).toBeUndefined()
  })

  it('1번을 보기 전에 기록이 생겼으면 1번은 건너뛰고 2번', () => {
    expect(nextGuide(context({ entryCount: 1, monthHasEntries: true }))).toBe(2)
  })

  it('올해 결산 화면에 기록이 있으면 3번, 없으면 없음', () => {
    expect(nextGuide(context({ screen: 'year-summary', yearHasEntries: true }))).toBe(3)
    expect(nextGuide(context({ screen: 'year-summary', yearHasEntries: false }))).toBeUndefined()
  })

  it('모든 장부 기록이 3건 이상이고 자동으로 지키기를 쓸 수 있으면 4번', () => {
    expect(nextGuide(context({ state: seen(1, 2), entryCount: 3, monthHasEntries: true }))).toBe(4)
  })

  it('자동으로 지키기를 쓸 수 없으면(서버 주소 없음·꺼짐·복구 코드 없음) 4번을 띄우지 않는다', () => {
    expect(nextGuide(context({ state: seen(1, 2), entryCount: 3, monthHasEntries: true, keepUsable: false }))).toBeUndefined()
  })

  it('두 말풍선이 같이 걸리면 번호가 작은 것 하나만 (2번과 4번 → 2번)', () => {
    expect(nextGuide(context({ state: seen(1), entryCount: 3, monthHasEntries: true }))).toBe(2)
  })

  it('이미 본 말풍선은 기록이 줄어도 다시 띄우지 않는다', () => {
    expect(nextGuide(context({ state: seen(1, 2, 4), entryCount: 0 }))).toBeUndefined()
  })

  it('안내가 꺼졌거나 값이 없으면 띄우지 않는다', () => {
    expect(nextGuide(context({ state: undefined }))).toBeUndefined()
    expect(nextGuide(context({ state: { v: 1, active: false, seen: [] } }))).toBeUndefined()
  })

  it('확인 창·선택 창·저장 안내 띠가 있으면(막힘) 띄우지 않는다', () => {
    expect(nextGuide(context({ blocked: true }))).toBeUndefined()
  })

  it('장부·결산 밖 화면에서는 띄우지 않는다', () => {
    expect(nextGuide(context({ screen: 'other' }))).toBeUndefined()
  })
})

describe('SPEC-008 지나간 말풍선 기록', () => {
  it('기록이 생기면 1번은 본 것으로 친다 (나중에 기록을 다 지워도 다시 뜨지 않게)', () => {
    expect(withPassedGuides(ACTIVE_GUIDE, 1)).toEqual(seen(1))
    expect(withPassedGuides(ACTIVE_GUIDE, 0)).toBe(ACTIVE_GUIDE)
    expect(withPassedGuides(seen(1), 3)).toEqual(seen(1))
  })

  it('닫은 번호를 한 번만 더한다', () => {
    expect(withSeen(seen(1), 2)).toEqual(seen(1, 2))
    expect(withSeen(seen(1, 2), 2)).toEqual(seen(1, 2))
  })
})
