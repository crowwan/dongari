import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntryCard } from './EntryCard'

describe('SPEC-001 EntryCard (지금 적는 내역 카드)', () => {
  it('AC-16 "지금 적는 내역" 카드 안에 답한 줄마다 이름표 + 값(아이콘 포함) + [바꾸기] 를 보이고, ✓ 동그라미는 없다', () => {
    render(
      <EntryCard
        rows={[
          { label: '달', icon: 'calendar', value: '10월', onChange: () => {} },
          { label: '항목', icon: 'building', value: '대관료 · 지출', onChange: () => {} },
        ]}
      >
        <h2>얼마인가요?</h2>
      </EntryCard>,
    )

    const card = screen.getByRole('region', { name: '지금 적는 내역' })
    expect(card).toHaveAttribute('data-testid', 'entry-card')
    const rows = within(card).getAllByTestId('entry-card-row')
    expect(rows.map((row) => within(row).getByTestId('entry-card-label').textContent)).toEqual(['달', '항목'])
    expect(rows.map((row) => within(row).getByTestId('entry-card-value').textContent)).toEqual(['10월', '대관료 · 지출'])
    expect(within(rows[1]).getByTestId('entry-card-value').querySelector('[data-icon="building"]')).toBeInTheDocument()
    // ✓ 는 "장부에 들어감" 에만 쓴다
    expect(card.querySelector('[data-icon="check"]')).not.toBeInTheDocument()
  })

  it('AC-23 지금 질문(children)은 카드 안, 답한 줄 아래 펼친 칸에 있다', () => {
    render(
      <EntryCard rows={[{ label: '달', icon: 'calendar', value: '10월', onChange: () => {} }]}>
        <h2>무엇인가요?</h2>
      </EntryCard>,
    )

    const card = screen.getByRole('region', { name: '지금 적는 내역' })
    const now = within(card).getByTestId('entry-card-question')
    expect(within(now).getByRole('heading', { level: 2, name: '무엇인가요?' })).toBeInTheDocument()
    expect(within(card).getByTestId('entry-card-row').compareDocumentPosition(now)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('AC-16 [바꾸기] 는 화면 읽기에 "달 바꾸기"/"항목 바꾸기" 로 읽히고 누르면 그 줄의 onChange 가 불린다', async () => {
    const user = userEvent.setup()
    const changeMonth = vi.fn()
    const changeItem = vi.fn()
    render(
      <EntryCard
        rows={[
          { label: '달', icon: 'calendar', value: '10월', onChange: changeMonth },
          { label: '항목', icon: 'building', value: '대관료 · 지출', onChange: changeItem },
        ]}
      >
        <h2>얼마인가요?</h2>
      </EntryCard>,
    )

    const button = screen.getByRole('button', { name: '항목 바꾸기' })
    expect(button).toHaveAttribute('type', 'button')
    await user.click(button)
    await user.click(screen.getByRole('button', { name: '달 바꾸기' }))

    expect(changeItem).toHaveBeenCalledTimes(1)
    expect(changeMonth).toHaveBeenCalledTimes(1)
  })

  it('AC-24 바꾸기가 없는 줄(지금 묻고 있는 날짜 줄)은 [바꾸기] 없이 값만 보인다', () => {
    render(
      <EntryCard rows={[{ label: '날짜', icon: 'calendar', value: '10월' }]}>
        <h2>며칠인가요?</h2>
      </EntryCard>,
    )

    expect(screen.getByTestId('entry-card-value')).toHaveTextContent('10월')
    expect(screen.queryByRole('button', { name: '날짜 바꾸기' })).not.toBeInTheDocument()
  })
})
