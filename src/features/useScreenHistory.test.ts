import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScreenHistory } from './useScreenHistory'

// 안드로이드 뒤로 버튼: 브라우저가 방문 기록을 하나 빼고 popstate 를 보낸다
function pressBackButton() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
}

// history.back() 은 실제로 움직이지 않게 막고 몇 번 불렸는지만 본다 (popstate 는 테스트가 직접 보낸다)
let back: MockInstance<History['back']>
let push: MockInstance<History['pushState']>

beforeEach(() => {
  back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
  push = vi.spyOn(window.history, 'pushState')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderOpened() {
  const { result } = renderHook(() => useScreenHistory())
  act(() => result.current.open({ name: 'add-entry', month: 3 }))
  push.mockClear()
  return result
}

describe('SPEC-001 화면 이동과 뒤로가기', () => {
  it('장부 외 화면을 열면 방문 기록을 하나 쌓는다', () => {
    const { result } = renderHook(() => useScreenHistory())

    act(() => result.current.open({ name: 'add-entry', month: 3 }))

    expect(result.current.screen).toEqual({ name: 'add-entry', month: 3 })
    expect(push).toHaveBeenCalledWith({ screen: 'add-entry' }, '')
  })

  describe('닫기 전 확인이 없는 화면', () => {
    it('[← 장부로] 는 쌓은 방문 기록을 되돌리고, 그 popstate 로 장부가 열린다', () => {
      const result = renderOpened()

      act(() => result.current.requestBack())

      expect(back).toHaveBeenCalledOnce()
      expect(result.current.confirmingLeave).toBe(false)
      pressBackButton()
      expect(result.current.screen).toEqual({ name: 'ledger' })
    })

    it('AC-12 안드로이드 뒤로 버튼을 누르면 그 화면만 닫히고 장부가 열린다', () => {
      const result = renderOpened()

      pressBackButton()

      expect(result.current.screen).toEqual({ name: 'ledger' })
      expect(push).not.toHaveBeenCalled()
    })

    it('장부로 돌아가는 중에 한 번 더 불러도 방문 기록은 한 번만 되돌린다 (두 번 되돌리면 앱이 닫힌다)', () => {
      const result = renderOpened()

      act(() => {
        result.current.backToLedger()
        result.current.backToLedger()
      })

      expect(back).toHaveBeenCalledOnce()
    })
  })

  describe('적던 내용이 있어 닫기 전 확인을 받는 화면', () => {
    it('[← 장부로] 를 누르면 화면은 그대로 두고 확인을 요청한다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))

      act(() => result.current.requestBack())

      expect(result.current.confirmingLeave).toBe(true)
      expect(result.current.screen).toEqual({ name: 'add-entry', month: 3 })
      expect(back).not.toHaveBeenCalled()
    })

    it('확인 창에서 [버리기] 를 고르면 장부로 돌아간다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))
      act(() => result.current.requestBack())

      act(() => result.current.confirmLeave())

      expect(result.current.confirmingLeave).toBe(false)
      expect(back).toHaveBeenCalledOnce()
      pressBackButton()
      expect(result.current.screen).toEqual({ name: 'ledger' })
    })

    it('확인 창에서 [아니요] 를 고르면 화면이 그대로 남는다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))
      act(() => result.current.requestBack())

      act(() => result.current.cancelLeave())

      expect(result.current.confirmingLeave).toBe(false)
      expect(result.current.screen).toEqual({ name: 'add-entry', month: 3 })
      expect(back).not.toHaveBeenCalled()
    })

    it('AC-12 뒤로 버튼을 누르면 화면을 닫지 않고 확인을 요청하며, 빠진 방문 기록을 다시 쌓는다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))

      pressBackButton()

      expect(result.current.screen).toEqual({ name: 'add-entry', month: 3 })
      expect(result.current.confirmingLeave).toBe(true)
      // 확인 창이 떠 있는 동안 한 번 더 눌러도 앱이 나가지지 않게
      expect(push).toHaveBeenCalledWith({ screen: 'add-entry' }, '')
    })

    it('뒤로 버튼으로 뜬 확인 창에서 [아니요] 를 고르면 그대로 남고, 다시 뒤로 버튼을 누르면 또 묻는다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))
      pressBackButton()

      act(() => result.current.cancelLeave())
      expect(result.current.screen).toEqual({ name: 'add-entry', month: 3 })

      pressBackButton()

      expect(result.current.screen).toEqual({ name: 'add-entry', month: 3 })
      expect(result.current.confirmingLeave).toBe(true)
      expect(push).toHaveBeenCalledTimes(2)
    })

    it('뒤로 버튼으로 뜬 확인 창에서 [버리기] 를 고르면 다시 쌓은 기록을 되돌려 장부로 간다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))
      pressBackButton()

      act(() => result.current.confirmLeave())
      expect(back).toHaveBeenCalledOnce()
      pressBackButton()

      expect(result.current.screen).toEqual({ name: 'ledger' })
      expect(result.current.confirmingLeave).toBe(false)
    })

    it('확인 창이 떠 있을 때 뒤로 버튼을 누르면 [아니요] 와 같다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))
      act(() => result.current.requestBack())

      pressBackButton()

      expect(result.current.confirmingLeave).toBe(false)
      expect(result.current.screen).toEqual({ name: 'add-entry', month: 3 })
      expect(push).toHaveBeenCalledWith({ screen: 'add-entry' }, '')
    })

    it('저장·지우기 뒤처럼 확인 없이 돌아갈 때(backToLedger)는 묻지 않는다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))

      act(() => result.current.backToLedger())
      pressBackButton()

      expect(result.current.confirmingLeave).toBe(false)
      expect(result.current.screen).toEqual({ name: 'ledger' })
    })

    it('바뀐 내용을 되돌려 확인이 필요 없어지면 바로 닫힌다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))
      act(() => result.current.confirmBeforeLeave(false))

      act(() => result.current.requestBack())

      expect(result.current.confirmingLeave).toBe(false)
      expect(back).toHaveBeenCalledOnce()
    })

    it('화면을 닫으면 확인 요청이 풀려 다음에 연 화면은 바로 닫힌다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))
      act(() => result.current.backToLedger())
      pressBackButton()

      act(() => result.current.open({ name: 'settings' }))
      pressBackButton()

      expect(result.current.screen).toEqual({ name: 'ledger' })
      expect(result.current.confirmingLeave).toBe(false)
    })
  })
})
