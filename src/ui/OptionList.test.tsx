import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OptionList } from './OptionList'

const YEARS = [
  { value: '2026', label: '2026년' },
  { value: '2025', label: '2025년' },
]

describe('OptionList', () => {
  it('여럿 중 하나를 줄 목록으로 보이고, 고른 줄은 눌린 상태 + 체크 표시다', () => {
    render(<OptionList label="장부 연도" options={YEARS} value="2026" onChange={vi.fn()} />)

    const group = screen.getByRole('group', { name: '장부 연도' })
    const [first, second] = within(group).getAllByRole('button')
    expect(first).toHaveTextContent('2026년')
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(first.querySelector('[data-icon="check"]')).toBeInTheDocument()
    expect(second).toHaveAttribute('aria-pressed', 'false')
    expect(second.querySelector('[data-icon="check"]')).not.toBeInTheDocument()
  })

  it('줄을 누르면 그 값을 알린다', async () => {
    const onChange = vi.fn()
    render(<OptionList label="장부 연도" options={YEARS} value="2026" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '2025년' }))

    expect(onChange).toHaveBeenCalledWith('2025')
  })

  it('줄 앞 아이콘을 붙일 수 있다', () => {
    render(
      <OptionList label="항목" options={[{ value: 'a', label: '대관료', icon: 'building' }]} value={null} onChange={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: '대관료' }).querySelector('[data-icon="building"]')).toBeInTheDocument()
  })

  it('줄 오른쪽에 작은 표시(수입/지출)를 붙이면 이름과 띄어 읽힌다', () => {
    render(
      <OptionList
        label="항목"
        options={[{ value: '대관료', label: '대관료', note: '지출' }]}
        value={null}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '대관료 지출' })).toBeInTheDocument()
  })

  it('수입 줄은 원형 아이콘을 청록 원으로 표시한다 (data-tone)', () => {
    render(
      <OptionList
        label="항목"
        options={[{ value: '회비', label: '회비', icon: 'users', tone: 'income' }]}
        value={null}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '회비' })).toHaveAttribute('data-tone', 'income')
  })

  it('맨 아래 따로 하는 일 줄(직접 적기)을 붙일 수 있고, 그 줄은 고르는 줄이 아니다', async () => {
    const onAction = vi.fn()
    const onChange = vi.fn()
    render(
      <OptionList
        label="항목"
        options={YEARS}
        value={null}
        onChange={onChange}
        action={{ label: '직접 적기', icon: 'pen', onClick: onAction }}
      />,
    )

    const buttons = within(screen.getByRole('group', { name: '항목' })).getAllByRole('button')
    const last = buttons[buttons.length - 1]
    expect(last).toHaveAccessibleName('직접 적기')
    expect(last).not.toHaveAttribute('aria-pressed')
    await userEvent.click(last)

    expect(onAction).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
  })
})
