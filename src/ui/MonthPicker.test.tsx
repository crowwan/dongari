import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthPicker } from './MonthPicker'

describe('MonthPicker', () => {
  it('1월부터 12월까지 열두 칸을 그린다', () => {
    render(<MonthPicker value={9} onChange={() => {}} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(12)
    expect(buttons[0]).toHaveTextContent('1월')
    expect(buttons[11]).toHaveTextContent('12월')
  })

  it('고른 달은 눌린 상태로, 나머지는 안 눌린 상태로 보인다', () => {
    render(<MonthPicker value={9} onChange={() => {}} />)

    expect(screen.getByRole('button', { name: '9월' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '9월' })).toHaveAttribute('data-state', 'selected')
    expect(screen.getByRole('button', { name: '3월' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('이번 달은 테두리로 표시하고 화면 읽기에도 "이번 달"(aria-current)로 알린다', () => {
    render(<MonthPicker value={9} currentMonth={10} onChange={() => {}} />)

    const current = screen.getByRole('button', { name: '10월' })
    expect(current).toHaveAttribute('aria-current', 'date')
    expect(current).toHaveAttribute('data-current', 'true')
    expect(screen.getByRole('button', { name: '9월' })).not.toHaveAttribute('aria-current')
  })

  it('달을 누르면 그 달로 onChange 가 불린다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<MonthPicker value={9} onChange={handleChange} />)

    await user.click(screen.getByRole('button', { name: '4월' }))

    expect(handleChange).toHaveBeenCalledWith(4)
  })
})
