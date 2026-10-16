import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScreenHistory, type Screen } from './useScreenHistory'

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

function renderOpened(screen: Screen = { name: 'add-entry', month: 3 }) {
  const { result } = renderHook(() => useScreenHistory())
  act(() => result.current.open(screen))
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
  describe('선택 창(덮개)과 뒤로 버튼', () => {
    it('선택 창을 열면 방문 기록을 한 칸 쌓는다 (장부 화면에서도)', () => {
      const { result } = renderHook(() => useScreenHistory())

      act(() => result.current.openSheet('month'))

      expect(result.current.sheet).toBe('month')
      expect(push).toHaveBeenCalledWith({ screen: 'ledger', sheet: 'month' }, '')
    })

    it('선택 창이 열려 있을 때 뒤로 버튼을 누르면 선택 창만 닫히고 화면은 그대로다', () => {
      const result = renderOpened()
      act(() => result.current.openSheet('year'))

      pressBackButton()

      expect(result.current.sheet).toBeNull()
      expect(result.current.screen).toEqual({ name: 'add-entry', month: 3 })
      expect(back).not.toHaveBeenCalled()
    })

    it('장부 화면의 선택 창도 뒤로 버튼으로 닫히고 장부에 남는다', () => {
      const { result } = renderHook(() => useScreenHistory())
      act(() => result.current.openSheet('month'))

      pressBackButton()

      expect(result.current.sheet).toBeNull()
      expect(result.current.screen).toEqual({ name: 'ledger' })
    })

    it('선택 창을 화면에서 닫으면(고르기·바깥 누르기) 쌓은 칸을 되돌리고, 그 popstate 는 화면을 바꾸지 않는다', () => {
      const result = renderOpened()
      act(() => result.current.openSheet('year'))

      act(() => result.current.closeSheet())

      expect(result.current.sheet).toBeNull()
      expect(back).toHaveBeenCalledOnce()
      pressBackButton()
      expect(result.current.screen).toEqual({ name: 'add-entry', month: 3 })
    })

    it('닫힌 선택 창을 또 닫아도 방문 기록은 되돌리지 않는다', () => {
      const result = renderOpened()

      act(() => result.current.closeSheet())

      expect(back).not.toHaveBeenCalled()
    })

    it('선택 창이 열려 있을 때 뒤로 버튼은 버릴까요 확인보다 먼저 선택 창만 닫는다', () => {
      const result = renderOpened()
      act(() => result.current.confirmBeforeLeave(true))
      act(() => result.current.openSheet('month'))

      pressBackButton()

      expect(result.current.sheet).toBeNull()
      expect(result.current.confirmingLeave).toBe(false)
      expect(result.current.screen).toEqual({ name: 'add-entry', month: 3 })

      // 선택 창이 닫힌 뒤 뒤로 버튼은 다시 버릴까요를 묻는다
      pressBackButton()
      expect(result.current.confirmingLeave).toBe(true)
    })

    it('선택 창에서 고르고 바로 장부로 갈 때(backToLedger)는 선택 창 칸과 화면 칸을 한 번에 되돌린다', () => {
      const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
      const result = renderOpened()
      act(() => result.current.openSheet('year'))

      act(() => result.current.backToLedger())

      expect(go).toHaveBeenCalledWith(-2)
      expect(back).not.toHaveBeenCalled()
      expect(result.current.sheet).toBeNull()
      pressBackButton()
      expect(result.current.screen).toEqual({ name: 'ledger' })
    })

    it('다른 화면을 열면 선택 창은 닫힌 상태로 시작한다', () => {
      const { result } = renderHook(() => useScreenHistory())
      act(() => result.current.openSheet('month'))

      act(() => result.current.open({ name: 'settings' }))

      expect(result.current.sheet).toBeNull()
    })

    it('SPEC-005 선택 창에서 다른 화면을 열면(장부 고르기 → 새 장부 만들기) 창의 칸을 그 화면 칸으로 바꿔, 뒤로 버튼 한 번에 장부로 온다', () => {
      const replace = vi.spyOn(window.history, 'replaceState')
      const { result } = renderHook(() => useScreenHistory())
      act(() => result.current.openSheet('books'))
      push.mockClear()

      act(() => result.current.open({ name: 'new-book' }))

      expect(push).not.toHaveBeenCalled()
      expect(replace).toHaveBeenCalledWith({ screen: 'new-book' }, '')
      expect(result.current.screen).toEqual({ name: 'new-book' })
      expect(result.current.sheet).toBeNull()
      pressBackButton()
      expect(result.current.screen).toEqual({ name: 'ledger' })
    })
  })
})

describe('#110 접근성 점검 09 확인 창과 뒤로 버튼', () => {
  it('확인 창을 열면 방문 기록을 한 칸 쌓는다 (장부 화면에서도)', () => {
    const { result } = renderHook(() => useScreenHistory())

    act(() => result.current.openDialog('backup'))

    expect(result.current.dialog).toBe('backup')
    expect(push).toHaveBeenCalledWith({ screen: 'ledger', dialog: 'backup' }, '')
  })

  it('확인 창이 떠 있을 때 뒤로 버튼은 확인 창만 닫고 화면은 그대로다 ([아니요] 와 같다)', () => {
    const result = renderOpened({ name: 'edit-entry', id: 'a' })
    const onBack = vi.fn()
    act(() => result.current.openDialog('delete', onBack))

    pressBackButton()

    expect(result.current.dialog).toBeNull()
    expect(onBack).toHaveBeenCalledOnce()
    expect(result.current.screen).toEqual({ name: 'edit-entry', id: 'a' })
    expect(back).not.toHaveBeenCalled()
  })

  it('장부 화면의 확인 창(백업 불러오기)도 뒤로 버튼으로 닫히고 앱은 장부에 남는다', () => {
    const { result } = renderHook(() => useScreenHistory())
    act(() => result.current.openDialog('backup'))

    pressBackButton()

    expect(result.current.dialog).toBeNull()
    expect(result.current.screen).toEqual({ name: 'ledger' })
  })

  it('적던 내용이 있어도 뒤로 버튼은 버릴까요보다 먼저 확인 창만 닫는다', () => {
    const result = renderOpened({ name: 'edit-entry', id: 'a' })
    act(() => result.current.confirmBeforeLeave(true))
    act(() => result.current.openDialog('delete'))

    pressBackButton()

    expect(result.current.dialog).toBeNull()
    expect(result.current.confirmingLeave).toBe(false)
  })

  it('편집 화면(선택 창 칸) 위에 확인 창을 열면 칸을 하나 더 쌓고, 뒤로 버튼은 확인 창만 닫아 편집 화면이 남는다', () => {
    const result = renderOpened({ name: 'edit-entry', id: 'a' })
    act(() => result.current.openSheet('settings-keep-restore'))
    push.mockClear()

    act(() => result.current.openDialog('keep-restore'))
    expect(push).toHaveBeenCalledWith({ screen: 'edit-entry', sheet: 'settings-keep-restore', dialog: 'keep-restore' }, '')

    pressBackButton()
    expect(result.current.dialog).toBeNull()
    expect(result.current.sheet).toBe('settings-keep-restore')
  })

  it('확인 창을 화면에서 닫으면([아니요]) 쌓은 칸을 되돌리고, 그 popstate 는 아무것도 바꾸지 않는다', () => {
    const result = renderOpened({ name: 'edit-entry', id: 'a' })
    const onBack = vi.fn()
    act(() => result.current.openDialog('delete', onBack))

    act(() => result.current.closeDialog())

    expect(result.current.dialog).toBeNull()
    expect(back).toHaveBeenCalledOnce()
    pressBackButton()
    expect(result.current.screen).toEqual({ name: 'edit-entry', id: 'a' })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('확인 창에서 바로 장부로 갈 때(지우기 뒤 backToLedger)는 확인 창 칸과 화면 칸을 한 번에 되돌린다', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const result = renderOpened({ name: 'edit-entry', id: 'a' })
    act(() => result.current.openDialog('delete'))

    act(() => result.current.backToLedger())

    expect(go).toHaveBeenCalledWith(-2)
    expect(result.current.dialog).toBeNull()
    pressBackButton()
    expect(result.current.screen).toEqual({ name: 'ledger' })
  })

  it('장부 화면의 확인 창에서 장부로 갈 때(백업 불러온 뒤)는 확인 창 칸 하나만 되돌린다 (두 칸이면 앱이 닫힌다)', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const { result } = renderHook(() => useScreenHistory())
    act(() => result.current.openDialog('backup'))

    act(() => result.current.backToLedger())

    expect(back).toHaveBeenCalledOnce()
    expect(go).not.toHaveBeenCalled()
  })

  it('선택 창을 확인 창으로 바꿔 끼우면(자동 보관 끄기) 뒤로 버튼은 바꿔 끼운 쪽의 onBack 을 부른다', () => {
    const result = renderOpened({ name: 'edit-entry', id: 'a' })
    const sheetBack = vi.fn()
    const dialogBack = vi.fn()
    act(() => result.current.openSheet('settings-keep', sheetBack))
    push.mockClear()

    act(() => result.current.openSheet('settings-keep-off', dialogBack))
    expect(push).not.toHaveBeenCalled()

    pressBackButton()
    expect(result.current.sheet).toBeNull()
    expect(dialogBack).toHaveBeenCalledOnce()
    expect(sheetBack).not.toHaveBeenCalled()
  })
})

describe('SPEC-008 말풍선(확인 창 칸)에서 화면 열기', () => {
  it('말풍선이 가리키는 버튼으로 화면을 열면(내역 적기) 말풍선 칸을 그 화면 칸으로 바꿔, 뒤로 버튼 한 번에 장부로 온다', () => {
    const replace = vi.spyOn(window.history, 'replaceState')
    const onBack = vi.fn()
    const { result } = renderHook(() => useScreenHistory())
    act(() => result.current.openDialog('guide-1', onBack))
    push.mockClear()

    act(() => result.current.open({ name: 'add-entry', month: 10 }))

    expect(push).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ screen: 'add-entry' }, '')
    expect(result.current.dialog).toBeNull()
    pressBackButton()
    expect(result.current.screen).toEqual({ name: 'ledger' })
    expect(onBack).not.toHaveBeenCalled()
  })
})

