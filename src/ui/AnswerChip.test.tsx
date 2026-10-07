import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnswerChip } from './AnswerChip'

describe('AnswerChip', () => {
  it('답한 값을 알약으로 보이고 화면 읽기에는 "고치기"를 붙여 읽는다', () => {
    render(
      <AnswerChip icon="building" onClick={() => {}}>
        대관료
      </AnswerChip>,
    )

    const chip = screen.getByRole('button', { name: '대관료 고치기' })
    expect(chip).toHaveAttribute('data-testid', 'answer-chip')
    expect(chip).toHaveAttribute('type', 'button')
  })

  it('누르면 onClick 이 불린다 (그 값 고치기)', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<AnswerChip onClick={handleClick}>10월</AnswerChip>)

    await user.click(screen.getByRole('button', { name: '10월 고치기' }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
