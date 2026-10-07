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

  it('처음 값이 0 이면 0 이 보인다 (이월금 "모르면 0으로 두고")', () => {
    render(<MoneyInput label="얼마인가요?" value={0} onChange={() => {}} />)

    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('0')
  })

  it('다 지우면 빈칸(자리 글자 0)이 되고 금액은 0 이다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Harness onChange={handleChange} />)
    const input = screen.getByLabelText('얼마인가요?')

    await user.clear(input)

    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('placeholder', '0')
    expect(handleChange).toHaveBeenLastCalledWith(0)
  })

  it('빈칸에서 0 을 치면 0 이 보인다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Harness onChange={handleChange} />)
    const input = screen.getByLabelText('얼마인가요?')

    await user.clear(input)
    await user.type(input, '0')

    expect(input).toHaveValue('0')
    expect(handleChange).toHaveBeenLastCalledWith(0)
  })

  it('00 은 0 으로, 05 는 5 로 앞자리 0 을 정리한다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Harness onChange={handleChange} />)
    const input = screen.getByLabelText('얼마인가요?')

    await user.clear(input)
    await user.type(input, '00')
    expect(input).toHaveValue('0')

    await user.type(input, '5')
    expect(input).toHaveValue('5')
    expect(handleChange).toHaveBeenLastCalledWith(5)
  })

  it('부모가 값을 바꾸면 바꾼 값이 보인다', () => {
    const { rerender } = render(<MoneyInput label="얼마인가요?" value={0} onChange={() => {}} />)

    rerender(<MoneyInput label="얼마인가요?" value={30_000} onChange={() => {}} />)

    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('30,000')
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

  it('이름은 기본으로 질문 제목 급(heading)으로 보인다', () => {
    render(<MoneyInput label="얼마인가요?" value={0} onChange={() => {}} />)

    expect(screen.getByTestId('money-input')).toHaveAttribute('data-label-role', 'heading')
  })

  it('보조 이름(label)으로 낮춰도 화면 읽기 이름은 그대로다', () => {
    render(<MoneyInput label="작년 이월금" labelRole="label" value={0} onChange={() => {}} />)

    expect(screen.getByTestId('money-input')).toHaveAttribute('data-label-role', 'label')
    expect(screen.getByLabelText('작년 이월금')).toBeInTheDocument()
  })
})
