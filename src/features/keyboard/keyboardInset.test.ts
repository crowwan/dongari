import { afterEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { keyboardInset, useKeyboardInset } from './keyboardInset'

const NOT_ZOOMED = { scale: 1 }

describe('키패드 높이 (아래 고정 [저장] 을 키패드 위로)', () => {
  it('키패드가 화면 아래를 덮었는데 레이아웃이 줄지 않으면(크롬 기본 resizes-visual) 덮은 높이만큼 올린다', () => {
    expect(keyboardInset({ layoutHeight: 800, visualHeight: 470, visualOffsetTop: 0, ...NOT_ZOOMED })).toBe(330)
  })

  it('보이는 영역이 위로 밀려 있으면(입력칸으로 스크롤) 그만큼 빼고 올린다', () => {
    expect(keyboardInset({ layoutHeight: 800, visualHeight: 470, visualOffsetTop: 100, ...NOT_ZOOMED })).toBe(230)
  })

  it('레이아웃이 키패드만큼 줄었으면(interactive-widget=resizes-content) 올리지 않는다', () => {
    expect(keyboardInset({ layoutHeight: 470, visualHeight: 470, visualOffsetTop: 0, ...NOT_ZOOMED })).toBe(0)
  })

  it('보이는 영역이 레이아웃보다 커 보여도 음수로 내리지 않는다', () => {
    expect(keyboardInset({ layoutHeight: 800, visualHeight: 801, visualOffsetTop: 0, ...NOT_ZOOMED })).toBe(0)
  })

  it('두 손가락으로 확대해 보는 중이면 키패드가 아니라 확대라서 올리지 않는다', () => {
    expect(keyboardInset({ layoutHeight: 800, visualHeight: 400, visualOffsetTop: 0, scale: 2 })).toBe(0)
  })
})

describe('useKeyboardInset', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--keyboard-inset')
  })

  it('visualViewport 가 없는 브라우저에서는 아무것도 하지 않는다', () => {
    renderHook(() => useKeyboardInset())

    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('')
  })
})
