import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PickRow } from './PickRow'

describe('PickRow', () => {
  it('정해진 값과 "바꾸기"가 한 줄에 보이고 "10월 바꾸기"로 읽힌다', () => {
    render(<PickRow icon="calendar" value="10월" onClick={() => {}} />)

    const row = screen.getByRole('button', { name: '10월 바꾸기' })
    expect(row).toHaveAttribute('data-testid', 'pick-row')
    expect(row).toHaveAttribute('type', 'button')
  })

  it('바꾸기 글자를 바꿀 수 있다', () => {
    render(<PickRow value="2026년" actionLabel="고르기" onClick={() => {}} />)

    expect(screen.getByRole('button', { name: '2026년 고르기' })).toBeInTheDocument()
  })

  it('누르면 onClick 이 불린다 (선택 창 열기)', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<PickRow icon="calendar" value="10월" onClick={handleClick} />)

    await user.click(screen.getByRole('button', { name: '10월 바꾸기' }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
