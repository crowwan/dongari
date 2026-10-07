import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CarryoverField } from './CarryoverField'

function Harness({ initial, onChange }: { initial: number; onChange: (value: number) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <CarryoverField
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

const LABEL = '작년 이월금'

describe('SPEC-001 이월금 입력', () => {
  it('기본은 "남았어요"이고 적은 금액이 그대로 이월금이 된다', async () => {
    const onChange = vi.fn()
    render(<Harness initial={0} onChange={onChange} />)

    expect(screen.getByRole('button', { name: '남았어요' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.type(screen.getByLabelText(LABEL), '370482')

    expect(onChange).toHaveBeenLastCalledWith(370_482)
  })

  it('"적자였어요"를 고르면 같은 금액이 음수 이월금이 된다', async () => {
    const onChange = vi.fn()
    render(<Harness initial={50_000} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))

    expect(onChange).toHaveBeenLastCalledWith(-50_000)
    expect(screen.getByLabelText(LABEL)).toHaveValue('50,000')
  })

  it('금액을 먼저 비워 두고 "적자였어요"를 고른 뒤 적어도 음수가 된다', async () => {
    const onChange = vi.fn()
    render(<Harness initial={0} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))
    await userEvent.type(screen.getByLabelText(LABEL), '1200')

    expect(onChange).toHaveBeenLastCalledWith(-1_200)
  })

  it('음수 이월금은 "적자였어요"가 골라진 채 금액만 보여준다', () => {
    render(<Harness initial={-30_000} onChange={() => {}} />)

    expect(screen.getByRole('button', { name: '적자였어요' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(LABEL)).toHaveValue('30,000')
  })

  it('이월금 0원은 금액 칸에 0 으로 보이고, 스위치를 바꿔도 0 이 남는다', async () => {
    const onChange = vi.fn()
    render(<Harness initial={0} onChange={onChange} />)

    expect(screen.getByLabelText(LABEL)).toHaveValue('0')
    await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))
    await userEvent.click(screen.getByRole('button', { name: '남았어요' }))

    expect(screen.getByLabelText(LABEL)).toHaveValue('0')
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('금액을 지우고 0 을 치면 0 이 보이고 이월금은 0 이다', async () => {
    const onChange = vi.fn()
    render(<Harness initial={50_000} onChange={onChange} />)

    await userEvent.clear(screen.getByLabelText(LABEL))
    await userEvent.type(screen.getByLabelText(LABEL), '0')

    expect(screen.getByLabelText(LABEL)).toHaveValue('0')
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('남았어요/적자였어요는 한 몸통 스위치(세그먼트)다', () => {
    render(<Harness initial={0} onChange={() => {}} />)

    expect(screen.getByRole('group', { name: '작년 장부가 남았나요, 적자였나요?' })).toHaveAttribute(
      'data-testid',
      'segmented-control',
    )
  })

  it('설정 카드 안에서는 금액 칸 이름을 보조 이름(label)으로 낮출 수 있다', () => {
    render(<CarryoverField value={0} onChange={() => {}} labelRole="label" />)

    expect(screen.getByTestId('money-input')).toHaveAttribute('data-label-role', 'label')
    expect(screen.getByLabelText(LABEL)).toBeInTheDocument()
  })
})
