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
    // 펼침 상태를 주지 않으면 aria-expanded 도 없다 (내역 적기)
    expect(last).not.toHaveAttribute('aria-expanded')
  })

  it('따로 하는 일 줄이 펼치는 줄이면 펼침 상태를 읽히고, 펼쳤을 때만 그 줄 아래(목록 안)에 칸을 보인다 (고치기 직접 적기)', () => {
    const action = { label: '직접 적기', icon: 'pen', onClick: vi.fn(), panel: <input aria-label="이름 칸" /> } as const
    const { rerender } = render(
      <OptionList label="항목" options={YEARS} value={null} onChange={vi.fn()} action={{ ...action, expanded: false }} />,
    )

    const toggle = screen.getByRole('button', { name: '직접 적기' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('textbox', { name: '이름 칸' })).not.toBeInTheDocument()

    rerender(<OptionList label="항목" options={YEARS} value={null} onChange={vi.fn()} action={{ ...action, expanded: true }} />)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const field = within(screen.getByRole('group', { name: '항목' })).getByRole('textbox', { name: '이름 칸' })
    expect(toggle).toHaveAttribute('aria-controls', field.parentElement?.id)
  })

  describe('더 보기 줄 (SPEC-001 v2.7)', () => {
    const RECENT = [{ value: '대관료', label: '대관료' }]
    const OLDER = [
      { value: '꽃값', label: '꽃값', note: '지출' },
      { value: '찬조금', label: '찬조금', note: '수입' },
    ]
    const more = { label: '예전에 쓴 항목 2개 더 보기', heading: '예전에 쓴 항목', options: OLDER }
    const action = { label: '직접 적기', icon: 'pen', onClick: vi.fn() } as const

    it('처음엔 접힌 채 처음 줄들 뒤, 따로 하는 일 줄 앞에 더 보기 줄이 있고 펼침 상태를 읽힌다', () => {
      render(<OptionList label="항목" options={RECENT} value={null} onChange={vi.fn()} more={more} action={action} />)

      const buttons = within(screen.getByRole('group', { name: '항목' })).getAllByRole('button')
      expect(buttons.map((button) => button.textContent)).toEqual(['대관료', '예전에 쓴 항목 2개 더 보기', '직접 적기'])
      expect(buttons[1]).toHaveAttribute('aria-expanded', 'false')
      expect(buttons[1]).not.toHaveAttribute('aria-pressed')
      expect(screen.queryByRole('button', { name: '꽃값 지출' })).not.toBeInTheDocument()
    })

    it('누르면 그 자리에 구분 글자와 나머지 줄이 펼쳐지고 포커스가 첫 예전 줄로 간다', async () => {
      const onChange = vi.fn()
      render(<OptionList label="항목" options={RECENT} value={null} onChange={onChange} more={more} action={action} />)

      await userEvent.click(screen.getByRole('button', { name: '예전에 쓴 항목 2개 더 보기' }))

      const group = screen.getByRole('group', { name: '항목' })
      expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual([
        '대관료',
        '꽃값 지출',
        '찬조금 수입',
        '직접 적기',
      ])
      expect(within(group).getByText('예전에 쓴 항목')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '꽃값 지출' })).toHaveFocus()

      await userEvent.click(screen.getByRole('button', { name: '찬조금 수입' }))
      expect(onChange).toHaveBeenCalledWith('찬조금')
    })

    it('펼친 줄에서 고른 값은 체크로 보이고, 고른 값이 예전 줄이면 펼친 채 시작한다', () => {
      render(<OptionList label="항목" options={RECENT} value="꽃값" onChange={vi.fn()} more={more} />)

      expect(screen.getByRole('button', { name: '꽃값 지출' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('button', { name: '예전에 쓴 항목 2개 더 보기' })).not.toBeInTheDocument()
    })

    it('더 볼 줄이 없으면 더 보기 줄도 없다', () => {
      render(<OptionList label="항목" options={RECENT} value={null} onChange={vi.fn()} more={{ ...more, options: [] }} />)

      expect(within(screen.getByRole('group', { name: '항목' })).getAllByRole('button')).toHaveLength(1)
    })
  })
})
