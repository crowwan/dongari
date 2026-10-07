import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  it('글자가 보이는 버튼을 그린다', () => {
    render(<Button>저장</Button>)

    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()
  })

  it('종류(주/보조/위험/위험 글자형)를 data-variant 로 드러낸다', () => {
    render(
      <>
        <Button>주</Button>
        <Button variant="secondary">보조</Button>
        <Button variant="danger">위험</Button>
        <Button variant="danger-text">글자형</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: '주' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.getByRole('button', { name: '보조' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByRole('button', { name: '위험' })).toHaveAttribute('data-variant', 'danger')
    expect(screen.getByRole('button', { name: '글자형' })).toHaveAttribute('data-variant', 'danger-text')
  })

  it('form 안에서 실수로 제출되지 않도록 기본 type 은 button 이다', () => {
    render(<Button>저장</Button>)

    expect(screen.getByRole('button', { name: '저장' })).toHaveAttribute('type', 'button')
  })

  it('비활성이면 눌러도 onClick 이 불리지 않는다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(
      <Button disabled onClick={handleClick}>
        저장
      </Button>,
    )

    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('아이콘을 주면 글자 앞에 붙이고, 이름은 글자로만 읽힌다', () => {
    render(<Button icon="plus">내역 적기</Button>)

    const button = screen.getByRole('button', { name: '내역 적기' })
    expect(button.querySelector('[data-icon="plus"]')).toHaveAttribute('aria-hidden', 'true')
  })
})
