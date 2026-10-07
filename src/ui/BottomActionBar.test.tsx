import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomActionBar } from './BottomActionBar'

describe('BottomActionBar', () => {
  it('화면 아래 영역에 주 버튼 하나만 둔다', () => {
    render(<BottomActionBar label="+ 내역 적기" onClick={() => {}} />)

    const bar = screen.getByTestId('bottom-action-bar')
    const buttons = within(bar).getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveTextContent('+ 내역 적기')
    expect(buttons[0]).toHaveAttribute('data-variant', 'primary')
  })

  it('버튼을 누르면 onClick 이 불린다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<BottomActionBar label="사진으로 저장" onClick={handleClick} />)

    await user.click(screen.getByRole('button', { name: '사진으로 저장' }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('비활성이면 눌러도 onClick 이 불리지 않는다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<BottomActionBar label="사진으로 저장" onClick={handleClick} disabled />)

    await user.click(screen.getByRole('button', { name: '사진으로 저장' }))

    expect(handleClick).not.toHaveBeenCalled()
  })

  it('안내 문장을 주면 버튼 바로 위에 보이고 버튼 설명으로 읽힌다 (누를 수 없는 이유)', () => {
    render(<BottomActionBar label="저장" onClick={() => {}} disabled note="얼마인지 적어 주세요" />)

    const button = screen.getByRole('button', { name: '저장' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('얼마인지 적어 주세요')
    expect(screen.getByTestId('bottom-action-bar-note')).toHaveTextContent('얼마인지 적어 주세요')
  })

  it('안내 문장이 없으면 안내 줄을 그리지 않는다', () => {
    render(<BottomActionBar label="저장" onClick={() => {}} />)

    expect(screen.queryByTestId('bottom-action-bar-note')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).not.toHaveAttribute('aria-describedby')
  })

  it('보조 버튼(옅은 청록 면)으로도 둘 수 있다 (연달아 적기 [다 적었어요])', () => {
    render(<BottomActionBar variant="secondary" label="다 적었어요" onClick={() => {}} />)

    expect(screen.getByRole('button', { name: '다 적었어요' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('주 버튼에 아이콘을 붙일 수 있다 ([+ 내역 적기] → 더하기 아이콘 + "내역 적기")', () => {
    render(<BottomActionBar icon="plus" label="내역 적기" onClick={() => {}} />)

    const button = screen.getByRole('button', { name: '내역 적기' })
    expect(button.querySelector('[data-icon="plus"]')).toBeInTheDocument()
  })
})

// 아이폰 사파리 흉내: 키패드가 떠도 레이아웃(window.innerHeight)은 그대로이고 보이는 영역(visualViewport)만 준다
class FakeVisualViewport extends EventTarget {
  height = window.innerHeight
  scale = 1
  offsetTop = 0

  showKeyboard(keyboardHeight: number) {
    this.height = window.innerHeight - keyboardHeight
    this.offsetTop = keyboardHeight / 2
    this.dispatchEvent(new Event('resize'))
  }

  hideKeyboard() {
    this.height = window.innerHeight
    this.offsetTop = 0
    this.dispatchEvent(new Event('resize'))
  }
}

describe('SPEC-001 아래 고정 영역과 폰 키패드 (#70)', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView
  const scrollIntoView = vi.fn()
  let viewport: FakeVisualViewport

  beforeEach(() => {
    viewport = new FakeVisualViewport()
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    Element.prototype.scrollIntoView = scrollIntoView
  })

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    Element.prototype.scrollIntoView = originalScrollIntoView
    scrollIntoView.mockClear()
  })

  it('키패드가 없으면 화면 아래에 고정된다', () => {
    render(<BottomActionBar label="저장" onClick={() => {}} />)

    expect(screen.getByTestId('bottom-action-bar')).toHaveAttribute('data-keyboard', 'closed')
  })

  it('레이아웃을 줄이지 않는 브라우저(아이폰 사파리)에서 키패드가 뜨면 고정을 풀고 지금 질문 바로 아래 자리로 들어간다', () => {
    render(<BottomActionBar label="저장" onClick={() => {}} />)

    act(() => viewport.showKeyboard(330))

    expect(screen.getByTestId('bottom-action-bar')).toHaveAttribute('data-keyboard', 'open')
  })

  it('키패드가 뜨면 [저장] 을 보이는 영역 아래 끝(키패드 바로 위)으로 올린다', () => {
    render(<BottomActionBar label="저장" onClick={() => {}} />)

    act(() => viewport.showKeyboard(330))

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('키패드가 닫히면 다시 화면 아래에 고정된다', () => {
    render(<BottomActionBar label="저장" onClick={() => {}} />)

    act(() => viewport.showKeyboard(330))
    act(() => viewport.hideKeyboard())

    expect(screen.getByTestId('bottom-action-bar')).toHaveAttribute('data-keyboard', 'closed')
  })

  it('visualViewport 가 없는 브라우저에서는 늘 화면 아래에 고정된다', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    render(<BottomActionBar label="저장" onClick={() => {}} />)

    expect(screen.getByTestId('bottom-action-bar')).toHaveAttribute('data-keyboard', 'closed')
  })
})
