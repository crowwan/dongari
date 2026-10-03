import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberInput } from './NumberInput'

describe('NumberInput', () => {
  it('금액을 천 단위 콤마로 보여준다', () => {
    render(<NumberInput value={1234567} onChange={() => {}} />)

    expect(screen.getByRole('textbox')).toHaveValue('1,234,567')
  })

  it('숫자를 입력하면 콤마 없는 숫자로 onChange 를 호출한다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<NumberInput value={0} onChange={handleChange} />)

    await user.type(screen.getByRole('textbox'), '5000')

    expect(handleChange).toHaveBeenLastCalledWith(5000)
    expect(screen.getByRole('textbox')).toHaveValue('5,000')
  })
})
