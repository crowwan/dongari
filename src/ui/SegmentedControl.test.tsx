import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EntryType } from '../domain/types'
import { SegmentedControl, type SegmentOptions } from './SegmentedControl'

const OPTIONS: SegmentOptions<EntryType> = [
  { value: 'income', label: '수입', icon: 'income' },
  { value: 'expense', label: '지출', icon: 'expense' },
]

describe('SegmentedControl', () => {
  it('한 몸통 안에 둘 중 하나를 고르는 버튼 두 개가 질문 이름으로 묶인다', () => {
    render(<SegmentedControl label="수입인가요, 지출인가요?" options={OPTIONS} value={null} onChange={() => {}} />)

    const group = screen.getByRole('group', { name: '수입인가요, 지출인가요?' })
    expect(group).toHaveAttribute('data-testid', 'segmented-control')
    expect(screen.getByRole('button', { name: '수입' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '지출' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('고른 쪽은 눌린 상태(aria-pressed)와 data-state="selected" 로 보인다', () => {
    render(<SegmentedControl label="종류" options={OPTIONS} value="expense" onChange={() => {}} />)

    const expense = screen.getByRole('button', { name: '지출' })
    expect(expense).toHaveAttribute('aria-pressed', 'true')
    expect(expense).toHaveAttribute('data-state', 'selected')
    expect(screen.getByRole('button', { name: '수입' })).toHaveAttribute('data-state', 'idle')
  })

  it('누르면 그 값으로 onChange 가 불린다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<SegmentedControl label="종류" options={OPTIONS} value="expense" onChange={handleChange} />)

    await user.click(screen.getByRole('button', { name: '수입' }))

    expect(handleChange).toHaveBeenCalledWith('income')
  })
})
