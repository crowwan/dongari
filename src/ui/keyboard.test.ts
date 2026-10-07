import { describe, expect, it } from 'vitest'
import { isKeyboardOpen, shouldRevealBar } from './keyboard'

const NOT_ZOOMED = { scale: 1 }

describe('SPEC-001 키패드가 떠 있는지 (아이폰 사파리처럼 레이아웃을 줄이지 않는 브라우저)', () => {
  it('보이는 영역이 키패드 높이만큼 줄었는데 레이아웃은 그대로면 키패드가 떠 있다', () => {
    // 보이는 영역이 아래로 밀려 있어도(offsetTop > 0, 입력칸으로 스크롤) 상관없이 줄어든 높이로만 본다
    expect(isKeyboardOpen({ layoutHeight: 800, visualHeight: 470, ...NOT_ZOOMED })).toBe(true)
  })

  it('레이아웃도 키패드만큼 줄었으면(갤럭시 interactive-widget=resizes-content) 떠 있지 않다고 본다', () => {
    expect(isKeyboardOpen({ layoutHeight: 470, visualHeight: 470, ...NOT_ZOOMED })).toBe(false)
  })

  it('키패드를 닫은 뒤 보이는 영역이 조금 덜 돌아와도(iOS 26.0 버그, 약 24px) 떠 있지 않다고 본다', () => {
    expect(isKeyboardOpen({ layoutHeight: 800, visualHeight: 776, ...NOT_ZOOMED })).toBe(false)
  })

  it('보이는 영역이 레이아웃보다 커 보여도 떠 있지 않다', () => {
    expect(isKeyboardOpen({ layoutHeight: 800, visualHeight: 801, ...NOT_ZOOMED })).toBe(false)
  })

  it('두 손가락으로 확대해 보는 중이면 키패드가 아니라 확대라서 떠 있지 않다고 본다', () => {
    expect(isKeyboardOpen({ layoutHeight: 800, visualHeight: 400, scale: 2 })).toBe(false)
  })
})

describe('SPEC-001 키패드가 뜬 동안 [저장] 을 보이는 영역 아래 끝으로 올릴지', () => {
  it('지금 적는 칸부터 [저장] 까지가 보이는 영역에 다 들어가면 올린다 (금액 칸 → [저장])', () => {
    expect(shouldRevealBar({ focusTop: 500, barBottom: 800, visibleHeight: 420 })).toBe(true)
  })

  it('딱 맞게 들어가도 올린다', () => {
    expect(shouldRevealBar({ focusTop: 380, barBottom: 800, visibleHeight: 420 })).toBe(true)
  })

  it('[저장] 이 적는 칸에서 멀어 함께 보일 수 없으면 올리지 않는다 (고치기 화면 위쪽 칸, 적는 칸이 위로 밀려 숨지 않게)', () => {
    expect(shouldRevealBar({ focusTop: 100, barBottom: 800, visibleHeight: 420 })).toBe(false)
  })
})
