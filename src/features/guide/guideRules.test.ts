import { describe, expect, it } from 'vitest'
import { ACTIVE_GUIDE, nextGuide, withSeen, type GuideContext, type GuideState } from './guideRules'

// 안내가 켜진 폰, 장부 화면, 기록 3건, 자동으로 지키기를 쓸 수 있음 — 4번이 뜨는 기본값
function context(overrides: Partial<GuideContext> = {}): GuideContext {
  return {
    state: ACTIVE_GUIDE,
    screen: 'ledger',
    entryCount: 3,
    keepUsable: true,
    blocked: false,
    ...overrides,
  }
}

const seen = (...numbers: GuideState['seen']): GuideState => ({ v: 1, active: true, seen: numbers })

describe('SPEC-008 진짜 장부 말풍선 규칙 (nextGuide, 복구 코드 4번만)', () => {
  it('AC-28 장부 화면에서 모든 장부 기록이 3건 이상이고 자동으로 지키기를 쓸 수 있으면 4번', () => {
    expect(nextGuide(context())).toBe(4)
    expect(nextGuide(context({ entryCount: 12 }))).toBe(4)
  })

  it('AC-28 기록이 3건보다 적으면 띄우지 않는다', () => {
    expect(nextGuide(context({ entryCount: 2 }))).toBeUndefined()
  })

  it('AC-29 자동으로 지키기를 쓸 수 없으면(서버 주소 없음·꺼짐·복구 코드 없음) 띄우지 않는다', () => {
    expect(nextGuide(context({ keepUsable: false }))).toBeUndefined()
  })

  it('AC-30 첫 장부를 만든 직후·첫 기록 뒤에도 다른 말풍선(내역 적기·N월 정리 보기)은 없다', () => {
    expect(nextGuide(context({ entryCount: 0 }))).toBeUndefined()
    expect(nextGuide(context({ entryCount: 1 }))).toBeUndefined()
  })

  it('AC-33 이미 본 4번은 다시 띄우지 않는다 (기록이 줄었다 늘어도)', () => {
    expect(nextGuide(context({ state: seen(4) }))).toBeUndefined()
  })

  it('#122 시절 본 번호(1·2·3)가 있어도 받고 무시한다', () => {
    expect(nextGuide(context({ state: seen(1, 2, 3) }))).toBe(4)
  })

  it('안내가 꺼졌거나 값이 없으면 띄우지 않는다', () => {
    expect(nextGuide(context({ state: undefined }))).toBeUndefined()
    expect(nextGuide(context({ state: { v: 1, active: false, seen: [] } }))).toBeUndefined()
  })

  it('확인 창·선택 창·저장 안내 띠가 있으면(막힘) 띄우지 않는다', () => {
    expect(nextGuide(context({ blocked: true }))).toBeUndefined()
  })

  it('장부 밖 화면에서는 띄우지 않는다', () => {
    expect(nextGuide(context({ screen: 'other' }))).toBeUndefined()
  })
})

describe('SPEC-008 닫은 말풍선 기록', () => {
  it('닫은 번호를 한 번만 더한다', () => {
    expect(withSeen(seen(1), 4)).toEqual(seen(1, 4))
    expect(withSeen(seen(4), 4)).toEqual(seen(4))
  })
})
