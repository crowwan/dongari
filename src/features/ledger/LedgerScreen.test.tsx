import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { calculateTotals } from '../../domain/ledger'
import type { Entry, Ledger } from '../../domain/types'
import { LedgerScreen } from './LedgerScreen'

function entry(id: string, month: number, type: Entry['type'], name: string, amount: number): Entry {
  return { id, month, type, name, amount, createdAt: '2026-01-01T00:00:00.000Z' }
}

function ledgerWith(entries: Entry[], carryover = 370_482): Ledger {
  return { year: 2026, clubName: '한랑드림', carryover, entries }
}

function renderScreen(ledger: Ledger, handlers: Partial<Parameters<typeof LedgerScreen>[0]> = {}) {
  return render(<LedgerScreen year={ledger.year} ledger={ledger} totals={calculateTotals(ledger)} {...handlers} />)
}

const SAMPLE = ledgerWith([
  entry('a', 9, 'income', '회비', 140_000),
  entry('b', 10, 'expense', '대관료', 40_000),
  entry('c', 9, 'expense', '간식비', 58_280),
  entry('d', 10, 'expense', '간식비', 28_340),
  entry('e', 3, 'income', '행사지원금', 145_050),
])

describe('SPEC-001 장부 화면', () => {
  it('맨 위에 "연도 + 동아리 이름"과 지금 남은 돈을 보여준다', () => {
    renderScreen(SAMPLE)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026년 한랑드림')
    // 370,482 + 285,050 − 126,620
    expect(screen.getByTestId('ledger-balance')).toHaveTextContent('528,912원')
  })

  it('들어온 돈·나간 돈·작년에서 넘어온 돈을 요약해 보여준다', () => {
    renderScreen(SAMPLE)

    const sums = screen.getByTestId('ledger-sums')
    expect(within(sums).getByText('들어온 돈').nextSibling).toHaveTextContent('285,050')
    expect(within(sums).getByText('나간 돈').nextSibling).toHaveTextContent('126,620')
    expect(within(sums).getByText('작년에서 넘어온 돈').nextSibling).toHaveTextContent('370,482')
  })

  it('잔액이나 이월금이 모자라면 빼기표(−)를 붙여 보여준다', () => {
    renderScreen(ledgerWith([entry('a', 1, 'expense', '대관료', 40_000)], -10_000))

    expect(screen.getByTestId('ledger-balance')).toHaveTextContent('−50,000원')
    expect(within(screen.getByTestId('ledger-sums')).getByText('작년에서 넘어온 돈').nextSibling).toHaveTextContent(
      '−10,000',
    )
  })

  it('AC-9 장부 목록은 최신 달이 위, 월마다 소계가 보인다', () => {
    renderScreen(SAMPLE)

    const groups = screen.getAllByTestId('month-group')
    expect(groups.map((group) => within(group).getByRole('heading', { level: 2 }).textContent)).toEqual([
      '10월',
      '9월',
      '3월',
    ])
    expect(within(groups[0]).getByTestId('month-subtotal')).toHaveTextContent('나감 68,340')
    expect(within(groups[1]).getByTestId('month-subtotal')).toHaveTextContent('들어옴 140,000 · 나감 58,280')
    expect(within(groups[2]).getByTestId('month-subtotal')).toHaveTextContent('들어옴 145,050')
  })

  it('같은 달 안의 기록은 적은 순서대로, 이름과 부호 붙은 금액을 보여준다', () => {
    renderScreen(SAMPLE)

    const september = screen.getAllByTestId('month-group')[1]
    const rows = within(september).getAllByTestId('entry-row')
    expect(rows.map((row) => row.textContent)).toEqual(['회비+140,000원', '간식비−58,280원'])
    expect(rows.map((row) => row.dataset.kind)).toEqual(['income', 'expense'])
  })

  it('기록이 없으면 버튼으로 시작하라는 안내를 보여준다', () => {
    renderScreen(ledgerWith([]))

    expect(screen.getByText(/아직 적은 내용이 없어요/)).toBeInTheDocument()
    expect(screen.queryAllByTestId('month-group')).toHaveLength(0)
  })

  it('[돈 들어옴] [돈 나감] 을 누르면 그 종류로 입력 화면을 열어 달라고 알린다', async () => {
    const onAddEntry = vi.fn()
    renderScreen(SAMPLE, { onAddEntry })

    await userEvent.click(screen.getByRole('button', { name: /돈 들어옴/ }))
    await userEvent.click(screen.getByRole('button', { name: /돈 나감/ }))

    expect(onAddEntry.mock.calls).toEqual([['income'], ['expense']])
  })

  it('기록 한 줄을 누르면 그 기록의 수정 화면을 열어 달라고 알린다', async () => {
    const onEditEntry = vi.fn()
    renderScreen(SAMPLE, { onEditEntry })

    const october = screen.getAllByTestId('month-group')[0]
    await userEvent.click(within(october).getByRole('button', { name: /^대관료/ }))

    expect(onEditEntry).toHaveBeenCalledWith('b')
  })
})
