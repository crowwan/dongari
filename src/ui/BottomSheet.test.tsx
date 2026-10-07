import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomSheet } from './BottomSheet'

describe('BottomSheet', () => {
  it('열리면 제목 이름을 가진 창(dialog)으로 내용이 보인다', () => {
    render(
      <BottomSheet open title="몇 월인가요?" onClose={() => {}}>
        <button type="button">9월</button>
      </BottomSheet>,
    )

    const sheet = screen.getByRole('dialog', { name: '몇 월인가요?' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: '9월' })).toBeInTheDocument()
  })

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    render(
      <BottomSheet open={false} title="몇 월인가요?" onClose={() => {}}>
        내용
      </BottomSheet>,
    )

    expect(screen.queryByTestId('bottom-sheet')).not.toBeInTheDocument()
  })

  it('창 바깥(어둡게 가린 곳)을 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <BottomSheet open title="몇 월인가요?" onClose={onClose}>
        내용
      </BottomSheet>,
    )

    await user.click(screen.getByTestId('bottom-sheet'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('창 안을 누르면 닫히지 않는다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <BottomSheet open title="몇 월인가요?" onClose={onClose}>
        <button type="button">9월</button>
      </BottomSheet>,
    )

    await user.click(screen.getByRole('button', { name: '9월' }))
    await user.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc 를 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <BottomSheet open title="몇 월인가요?" onClose={onClose}>
        내용
      </BottomSheet>,
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('열리면 창으로 포커스가 옮겨 가고, 닫히면 원래 자리로 돌아온다', () => {
    const { rerender } = render(
      <>
        <button type="button">10월 바꾸기</button>
        <BottomSheet open={false} title="몇 월인가요?" onClose={() => {}}>
          내용
        </BottomSheet>
      </>,
    )
    const opener = screen.getByRole('button', { name: '10월 바꾸기' })
    opener.focus()

    rerender(
      <>
        <button type="button">10월 바꾸기</button>
        <BottomSheet open title="몇 월인가요?" onClose={() => {}}>
          내용
        </BottomSheet>
      </>,
    )
    expect(screen.getByRole('dialog')).toHaveFocus()

    rerender(
      <>
        <button type="button">10월 바꾸기</button>
        <BottomSheet open={false} title="몇 월인가요?" onClose={() => {}}>
          내용
        </BottomSheet>
      </>,
    )
    expect(opener).toHaveFocus()
  })
})
