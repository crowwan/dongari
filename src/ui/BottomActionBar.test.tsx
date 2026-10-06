import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
    render(<BottomActionBar label="사진으로 보내기" onClick={handleClick} />)

    await user.click(screen.getByRole('button', { name: '사진으로 보내기' }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('비활성이면 눌러도 onClick 이 불리지 않는다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<BottomActionBar label="사진으로 보내기" onClick={handleClick} disabled />)

    await user.click(screen.getByRole('button', { name: '사진으로 보내기' }))

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
})
