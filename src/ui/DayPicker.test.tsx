import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DayPicker } from './DayPicker'

describe('SPEC-001 DayPicker (날 격자)', () => {
  it('AC-24 1일부터 그 달 마지막 날까지만 칸을 그린다 (없는 날은 없다)', () => {
    render(<DayPicker label="2월 날짜" days={28} value={null} onChange={() => {}} />)

    const buttons = within(screen.getByRole('group', { name: '2월 날짜' })).getAllByRole('button')
    expect(buttons).toHaveLength(28)
    expect(buttons[0]).toHaveAccessibleName('1일')
    expect(buttons[27]).toHaveAccessibleName('28일')
    expect(screen.queryByRole('button', { name: '29일' })).not.toBeInTheDocument()
  })

  it('5칸씩 줄을 짓는다 (31일이면 7줄)', () => {
    render(<DayPicker label="10월 날짜" days={31} value={null} onChange={() => {}} />)

    expect(screen.getByTestId('day-picker')).toHaveAttribute('data-columns', '5')
  })

  it('고른 날은 눌린 상태, 나머지는 안 눌린 상태다', () => {
    render(<DayPicker label="10월 날짜" days={31} value={7} onChange={() => {}} />)

    expect(screen.getByRole('button', { name: '7일' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '7일' })).toHaveAttribute('data-state', 'selected')
    expect(screen.getByRole('button', { name: '8일' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('AC-24 오늘은 테두리로 표시하고 화면 읽기에도 "오늘"(aria-current)로 알린다', () => {
    render(<DayPicker label="10월 날짜" days={31} value={null} today={7} onChange={() => {}} />)

    const today = screen.getByRole('button', { name: '7일' })
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(today).toHaveAttribute('data-current', 'true')
    expect(screen.getByRole('button', { name: '8일' })).not.toHaveAttribute('aria-current')
  })

  it('AC-24 방금 저장한 날은 작은 "방금" 이 붙고(옅은 바탕) 고른 상태는 아니다', () => {
    render(<DayPicker label="10월 날짜" days={31} value={null} recent={5} onChange={() => {}} />)

    const recent = screen.getByRole('button', { name: '5일 방금' })
    expect(recent).toHaveAttribute('data-recent', 'true')
    expect(recent).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByText('방금')).toHaveLength(1)
  })

  it('날을 누르면 그 날로 onChange 가 불린다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<DayPicker label="10월 날짜" days={31} value={null} onChange={handleChange} />)

    await user.click(screen.getByRole('button', { name: '31일' }))

    expect(handleChange).toHaveBeenCalledWith(31)
  })
})
