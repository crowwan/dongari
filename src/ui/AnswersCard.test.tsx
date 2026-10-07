import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnswersCard } from './AnswersCard'

describe('AnswersCard', () => {
  it('"적은 내용" 카드 안에 줄마다 이름표 + 값(아이콘 포함) + [바꾸기] 를 보인다', () => {
    render(
      <AnswersCard
        rows={[
          { label: '달', icon: 'calendar', value: '10월', onChange: () => {} },
          { label: '항목', icon: 'building', value: '대관료 · 지출', onChange: () => {} },
        ]}
      />,
    )

    const card = screen.getByRole('region', { name: '적은 내용' })
    expect(card).toHaveAttribute('data-testid', 'answers-card')
    const rows = within(card).getAllByTestId('answers-card-row')
    expect(rows.map((row) => within(row).getByTestId('answers-card-label').textContent)).toEqual(['달', '항목'])
    expect(rows.map((row) => within(row).getByTestId('answers-card-value').textContent)).toEqual(['10월', '대관료 · 지출'])
    expect(within(rows[1]).getByTestId('answers-card-value').querySelector('[data-icon="building"]')).toBeInTheDocument()
  })

  it('[바꾸기] 는 화면 읽기에 "달 바꾸기"/"항목 바꾸기" 로 읽히고 누르면 그 줄의 onChange 가 불린다', async () => {
    const user = userEvent.setup()
    const changeMonth = vi.fn()
    const changeItem = vi.fn()
    render(
      <AnswersCard
        rows={[
          { label: '달', icon: 'calendar', value: '10월', onChange: changeMonth },
          { label: '항목', icon: 'building', value: '대관료 · 지출', onChange: changeItem },
        ]}
      />,
    )

    const button = screen.getByRole('button', { name: '항목 바꾸기' })
    expect(button).toHaveAttribute('type', 'button')
    await user.click(button)
    await user.click(screen.getByRole('button', { name: '달 바꾸기' }))

    expect(changeItem).toHaveBeenCalledTimes(1)
    expect(changeMonth).toHaveBeenCalledTimes(1)
  })
})
