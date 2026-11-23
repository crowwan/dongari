import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { YearMonthPicker } from './YearMonthPicker'

describe('YearMonthPicker (해·달 고르기, SPEC-010 6절)', () => {
  it('고른 해를 가운데에 보이고 그 해의 고른 달을 칠한다', () => {
    render(<YearMonthPicker value={{ year: 2025, month: 7 }} firstYear={2000} lastYear={2027} onChange={vi.fn()} />)

    expect(screen.getByText('2025년')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7월' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('[이전 해]·[다음 해] 로 해를 넘기고, 다른 해를 보는 동안은 고른 달을 칠하지 않는다', async () => {
    const user = userEvent.setup()
    render(<YearMonthPicker value={{ year: 2025, month: 7 }} firstYear={2000} lastYear={2027} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '다음 해' }))

    expect(screen.getByText('2026년')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7월' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: '이전 해' }))
    expect(screen.getByRole('button', { name: '7월' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('달을 누르면 보고 있는 해와 그 달을 알린다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<YearMonthPicker value={{ year: 2026, month: 1 }} firstYear={2000} lastYear={2027} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '이전 해' }))
    await user.click(screen.getByRole('button', { name: '3월' }))

    expect(onChange).toHaveBeenCalledWith(2025, 3)
  })

  it('처음 해·마지막 해에서는 더 갈 수 없는 쪽 화살표를 누를 수 없다', () => {
    // 선택 창을 열 때마다 새로 그린다 (보고 있는 해는 창 안 상태)
    const { unmount } = render(<YearMonthPicker value={{ year: 2027, month: 1 }} firstYear={2000} lastYear={2027} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: '다음 해' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '이전 해' })).toBeEnabled()

    unmount()
    render(<YearMonthPicker value={{ year: 2000, month: 1 }} firstYear={2000} lastYear={2027} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '이전 해' })).toBeDisabled()
  })

  it('고른 값이 없으면 이번 달의 해에서 시작하고, 이번 달은 그 해를 볼 때만 테두리로 알린다', async () => {
    const user = userEvent.setup()
    render(<YearMonthPicker value={null} current={{ year: 2026, month: 11 }} firstYear={2000} lastYear={2027} onChange={vi.fn()} />)

    expect(screen.getByText('2026년')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '11월' })).toHaveAttribute('aria-current', 'date')
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: '이전 해' }))
    expect(screen.getByRole('button', { name: '11월' })).not.toHaveAttribute('aria-current')
  })
})
