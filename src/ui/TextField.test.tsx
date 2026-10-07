import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextField } from './TextField'

function Harness({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <TextField
      label="동아리 이름"
      value={value}
      placeholder="예: 한랑드림"
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('TextField', () => {
  it('글자를 적으면 적은 그대로 알려준다', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.type(screen.getByLabelText('동아리 이름'), '한랑드림')

    expect(onChange).toHaveBeenLastCalledWith('한랑드림')
    expect(screen.getByLabelText('동아리 이름')).toHaveValue('한랑드림')
  })

  it('오류가 있으면 입력칸 아래 문장으로 알리고 오류 상태가 된다', () => {
    render(<TextField label="동아리 이름" value="" onChange={() => {}} error="동아리 이름을 적어주세요" />)

    const field = screen.getByLabelText('동아리 이름')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('동아리 이름을 적어주세요')
    expect(screen.getByTestId('text-field')).toHaveAttribute('data-state', 'error')
  })

  it('이름은 기본으로 질문 제목 급(heading)으로 보인다', () => {
    render(<TextField label="동아리 이름" value="" onChange={() => {}} />)

    expect(screen.getByTestId('text-field')).toHaveAttribute('data-label-role', 'heading')
  })

  it('보조 이름(label)으로 낮춰도 화면 읽기 이름은 그대로다', () => {
    render(<TextField label="직접 적기" labelRole="label" value="" onChange={() => {}} />)

    expect(screen.getByTestId('text-field')).toHaveAttribute('data-label-role', 'label')
    expect(screen.getByLabelText('직접 적기')).toBeInTheDocument()
  })

  it('autoFocus 면 나타나자마자 포커스를 받는다', () => {
    render(<TextField label="직접 적기" value="" onChange={() => {}} autoFocus />)

    expect(screen.getByLabelText('직접 적기')).toHaveFocus()
  })
})
