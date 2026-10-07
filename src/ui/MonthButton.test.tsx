import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthButton } from './MonthButton'

describe('SPEC-001 MonthButton (질문 제목 옆 달 버튼)', () => {
  it('AC-25 "10월 ▾" 로 보이고 화면 읽기에는 "10월 달 바꾸기" 로 읽히며, 선택 창을 연다고 알린다', () => {
    render(<MonthButton month={10} onClick={() => {}} />)

    const button = screen.getByRole('button', { name: '10월 달 바꾸기' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button.querySelector('[data-icon="down"]')).toBeInTheDocument()
  })

  it('누르면 onClick 이 불린다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<MonthButton month={2} onClick={handleClick} />)

    await user.click(screen.getByRole('button', { name: '2월 달 바꾸기' }))

    expect(handleClick).toHaveBeenCalledOnce()
  })
})
