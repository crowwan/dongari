import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BigActionButton } from './BigActionButton'

describe('BigActionButton', () => {
  it('돈 들어옴 버튼은 + 부호와 글자, 보조 설명을 함께 보여준다', () => {
    render(<BigActionButton kind="income" description="회비, 지원금" />)

    const button = screen.getByRole('button', { name: /돈 들어옴/ })
    expect(button).toHaveTextContent('+')
    expect(button).toHaveTextContent('회비, 지원금')
    expect(button).toHaveAttribute('data-kind', 'income')
  })

  it('돈 나감 버튼은 − 부호와 글자를 보여준다', () => {
    render(<BigActionButton kind="expense" description="대관료, 간식비" />)

    const button = screen.getByRole('button', { name: /돈 나감/ })
    expect(button).toHaveTextContent('−')
    expect(button).toHaveAttribute('data-kind', 'expense')
  })

  it('누르면 onClick 이 불린다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<BigActionButton kind="expense" description="대관료" onClick={handleClick} />)

    await user.click(screen.getByRole('button', { name: /돈 나감/ }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('비활성이면 눌러도 onClick 이 불리지 않는다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<BigActionButton kind="income" description="회비" disabled onClick={handleClick} />)

    await user.click(screen.getByRole('button', { name: /돈 들어옴/ }))

    expect(handleClick).not.toHaveBeenCalled()
  })
})
