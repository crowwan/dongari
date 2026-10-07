import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AmountDisplay } from './AmountDisplay'

function Controlled({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial)
  return <AmountDisplay label="얼마인가요?" value={value} onChange={setValue} />
}

describe('AmountDisplay', () => {
  it('금액을 크게 콤마와 함께 보이고 이름으로 읽히는 숫자 칸이다 (폰 숫자 키패드)', () => {
    render(<AmountDisplay label="얼마인가요?" value={40000} onChange={() => {}} />)

    const input = screen.getByRole('textbox', { name: '얼마인가요?' })
    expect(input).toHaveValue('40,000')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByTestId('amount-display')).toHaveTextContent('원')
  })

  it('0 이면 빈칸이고 자리표시 "0" 이 보인다', () => {
    render(<AmountDisplay label="얼마인가요?" value={0} onChange={() => {}} />)

    expect(screen.getByRole('textbox', { name: '얼마인가요?' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: '얼마인가요?' })).toHaveAttribute('placeholder', '0')
  })

  it('숫자를 적으면 금액으로 읽어 onChange 가 불린다', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.type(screen.getByRole('textbox', { name: '얼마인가요?' }), '12300')

    expect(screen.getByRole('textbox', { name: '얼마인가요?' })).toHaveValue('12,300')
  })

  it('SPEC-001 AC-17 [+1만] [+5만] [+10만] 은 지금 금액에 더한다', async () => {
    const user = userEvent.setup()
    render(<Controlled initial={40000} />)

    await user.click(screen.getByRole('button', { name: '1만 원 더하기' }))
    await user.click(screen.getByRole('button', { name: '5만 원 더하기' }))
    await user.click(screen.getByRole('button', { name: '10만 원 더하기' }))

    expect(screen.getByRole('textbox', { name: '얼마인가요?' })).toHaveValue('200,000')
  })

  it('빠른 더하기는 상한 999,999,999 를 넘지 않는다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<AmountDisplay label="얼마인가요?" value={999_990_000} onChange={handleChange} />)

    await user.click(screen.getByRole('button', { name: '10만 원 더하기' }))

    expect(handleChange).toHaveBeenCalledWith(999_999_999)
  })

  it('autoFocus 면 나타나자마자 금액 칸에 포커스가 가 숫자 키패드가 바로 뜬다', () => {
    render(<AmountDisplay label="얼마인가요?" value={0} onChange={vi.fn()} autoFocus />)

    expect(screen.getByRole('textbox', { name: '얼마인가요?' })).toHaveFocus()
  })

  it('빠른 더하기를 눌러도 금액 칸 포커스가 그대로라 키패드가 닫히지 않는다', async () => {
    const user = userEvent.setup()
    render(<Controlled initial={0} />)
    await user.click(screen.getByRole('textbox', { name: '얼마인가요?' }))

    await user.click(screen.getByRole('button', { name: '1만 원 더하기' }))

    expect(screen.getByRole('textbox', { name: '얼마인가요?' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: '얼마인가요?' })).toHaveValue('10,000')
  })
})
