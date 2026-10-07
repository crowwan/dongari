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
})
