import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PickerField } from './PickerField'

describe('PickerField (고르는 칸, SPEC-010 6절)', () => {
  it('칸 이름과 지금 값이 한 버튼으로 읽히고 선택 창을 연다는 것을 알린다', () => {
    render(<PickerField label="들어온 달" value="2026년 7월" onClick={vi.fn()} />)

    const field = screen.getByRole('button', { name: '들어온 달 2026년 7월' })
    expect(field).toHaveAttribute('aria-haspopup', 'dialog')
    expect(field).toHaveTextContent('2026년 7월')
  })

  it('누르면 알린다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<PickerField label="그만둔 달" value="2025년 12월까지" onClick={onClick} />)

    await user.click(screen.getByRole('button', { name: '그만둔 달 2025년 12월까지' }))

    expect(onClick).toHaveBeenCalledOnce()
  })
})
