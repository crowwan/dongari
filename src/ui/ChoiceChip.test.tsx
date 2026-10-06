import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChoiceChip } from './ChoiceChip'

describe('ChoiceChip', () => {
  it('선택되면 aria-pressed 가 true 다', () => {
    render(<ChoiceChip selected>3월</ChoiceChip>)

    expect(screen.getByRole('button', { name: '3월' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('선택되지 않으면 aria-pressed 가 false 다', () => {
    render(<ChoiceChip selected={false}>4월</ChoiceChip>)

    expect(screen.getByRole('button', { name: '4월' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('누르면 onClick 이 불린다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(
      <ChoiceChip selected={false} onClick={handleClick}>
        간식비
      </ChoiceChip>,
    )

    await user.click(screen.getByRole('button', { name: '간식비' }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('비활성이면 눌러도 onClick 이 불리지 않는다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(
      <ChoiceChip selected={false} disabled onClick={handleClick}>
        5월
      </ChoiceChip>,
    )

    await user.click(screen.getByRole('button', { name: '5월' }))

    expect(handleClick).not.toHaveBeenCalled()
  })
})
