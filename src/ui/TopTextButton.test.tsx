import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopTextButton } from './TopTextButton'

describe('TopTextButton', () => {
  it('글자가 보이는 버튼을 그리고 누르면 onClick 이 불린다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<TopTextButton onClick={handleClick}>올해 결산</TopTextButton>)

    await user.click(screen.getByRole('button', { name: '올해 결산' }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('form 안에서 실수로 제출되지 않도록 type 은 button 이다', () => {
    render(<TopTextButton onClick={() => {}}>설정</TopTextButton>)

    expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('type', 'button')
    expect(screen.getByTestId('top-text-button')).toBeInTheDocument()
  })

  it('점 표시: 점을 그리고 화면 읽기 이름에도 이유를 붙인다 (색만으로 알리지 않는다)', () => {
    render(
      <TopTextButton onClick={() => {}} dotLabel="백업 필요">
        설정
      </TopTextButton>,
    )

    const button = screen.getByRole('button', { name: '설정 백업 필요' })
    expect(button).toHaveAttribute('data-dot', 'true')
    expect(screen.getByTestId('top-text-button-dot')).toHaveAttribute('aria-hidden', 'true')
  })

  it('점 표시가 없으면 점도 숨은 이름도 없다', () => {
    render(<TopTextButton onClick={() => {}}>설정</TopTextButton>)

    expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('data-dot', 'false')
    expect(screen.queryByTestId('top-text-button-dot')).not.toBeInTheDocument()
  })
})
