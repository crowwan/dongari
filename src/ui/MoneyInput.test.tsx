import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MoneyInput } from './MoneyInput'

// 부모가 값을 들고 있는 실제 사용 모양 그대로 확인한다
function Harness({ onChange }: { onChange: (value: number) => void }) {
  const [value, setValue] = useState(0)
  return (
    <MoneyInput
      label="얼마인가요?"
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('MoneyInput', () => {
  it('숫자 키패드가 뜨도록 inputmode 가 numeric 이다', () => {
    render(<MoneyInput label="얼마인가요?" value={0} onChange={() => {}} />)

    expect(screen.getByLabelText('얼마인가요?')).toHaveAttribute('inputmode', 'numeric')
  })

  it('"원" 단위를 글자로 보여준다', () => {
    render(<MoneyInput label="얼마인가요?" value={0} onChange={() => {}} />)

    expect(screen.getByText('원')).toBeInTheDocument()
  })

  it('입력하면 천 단위 콤마가 자동으로 붙는다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Harness onChange={handleChange} />)

    await user.type(screen.getByLabelText('얼마인가요?'), '1234567')

    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('1,234,567')
    expect(handleChange).toHaveBeenLastCalledWith(1234567)
  })

  it('999,999,999 를 넘게 입력하면 상한에서 멈춘다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Harness onChange={handleChange} />)

    await user.type(screen.getByLabelText('얼마인가요?'), '12345678901')

    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('999,999,999')
    expect(handleChange).toHaveBeenLastCalledWith(999_999_999)
  })

  it('오류 상태면 aria-invalid 와 안내 문장을 보여준다', () => {
    render(<MoneyInput label="얼마인가요?" value={0} onChange={() => {}} error="얼마인지 적어주세요" />)

    const input = screen.getByLabelText('얼마인가요?')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('얼마인지 적어주세요')
  })

  it('비활성이면 입력할 수 없다', () => {
    render(<MoneyInput label="얼마인가요?" value={5000} onChange={() => {}} disabled />)

    expect(screen.getByLabelText('얼마인가요?')).toBeDisabled()
  })
})
