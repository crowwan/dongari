import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AmountText } from './AmountText'
import { ListRow } from './ListRow'

describe('ListRow', () => {
  it('원형 아이콘 + 이름·보조 두 줄 + 오른쪽 내용을 그린다', () => {
    render(
      <ListRow icon="building" title="대관료" description="10월 · 지출" end={<AmountText type="expense" amount={40000} />} />,
    )

    const row = screen.getByTestId('list-row')
    expect(row).toHaveTextContent('대관료')
    expect(row).toHaveTextContent('10월 · 지출')
    expect(row).toHaveTextContent('−40,000원')
    // 아이콘은 꾸밈이라 화면 읽기에서 숨긴다
    expect(row.querySelector('[data-icon="building"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('누르는 줄의 이름은 이름·보조 줄·오른쪽을 띄어 읽는다', () => {
    render(<ListRow icon="users" title="회비" description="수입" end={<AmountText type="income" amount={140000} />} onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: '회비 수입 +140,000원' })).toBeInTheDocument()
  })

  it('수입 줄은 원형 아이콘을 청록으로 칠한다 (data-tone)', () => {
    render(<ListRow icon="users" tone="income" title="회비" />)

    expect(screen.getByTestId('list-row')).toHaveAttribute('data-tone', 'income')
  })

  it('기본은 회색 원이다', () => {
    render(<ListRow icon="receipt" title="행사비" />)

    expect(screen.getByTestId('list-row')).toHaveAttribute('data-tone', 'neutral')
  })

  it('onClick 이 있으면 줄 전체가 버튼이고 이름으로 읽힌다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<ListRow icon="cup" title="간식비" description="지출" onClick={handleClick} />)

    await user.click(screen.getByRole('button', { name: /간식비/ }))

    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /간식비/ })).toHaveAttribute('type', 'button')
  })

  it('onClick 이 없으면 버튼이 아니다', () => {
    render(<ListRow icon="cup" title="간식비" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
