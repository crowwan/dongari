import { useState } from 'react'
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

type Handlers = {
  onAddEntry?: (month: number) => void
  onEditEntry?: (id: string) => void
  onOpenMonthSummary?: (month: number) => void
  onOpenYearSummary?: () => void
  onOpenSettings?: () => void
}

// 보고 있는 달은 App 이 들고 있으므로, 테스트에서는 같은 역할의 상태를 감싼다
function Harness({ ledger, initialMonth, handlers }: { ledger: Ledger; initialMonth: number; handlers: Handlers }) {
  const [month, setMonth] = useState(initialMonth)
  return (
    <LedgerScreen
      year={ledger.year}
      ledger={ledger}
      totals={calculateTotals(ledger)}
      month={month}
      onChangeMonth={setMonth}
      onOpenMonthSummary={handlers.onOpenMonthSummary ?? vi.fn()}
      onOpenYearSummary={handlers.onOpenYearSummary ?? vi.fn()}
      onOpenSettings={handlers.onOpenSettings ?? vi.fn()}
      onAddEntry={handlers.onAddEntry}
      onEditEntry={handlers.onEditEntry}
    />
  )
}

function renderScreen(ledger: Ledger, month = 9, handlers: Handlers = {}) {
  return render(<Harness ledger={ledger} initialMonth={month} handlers={handlers} />)
}

const SAMPLE = ledgerWith([
  entry('a', 9, 'income', '회비', 140_000),
  entry('b', 10, 'expense', '대관료', 40_000),
  entry('c', 9, 'expense', '대관료', 40_000),
  entry('d', 9, 'expense', '간식비', 58_280),
  entry('e', 3, 'income', '행사지원금', 145_050),
])

function monthCard() {
  return screen.getByTestId('month-card')
}

describe('SPEC-001 장부 화면', () => {
  describe('위쪽과 잔액', () => {
    it('위쪽에 동아리 이름과 연도, [올해 결산] [설정] 글자 버튼이 있다', () => {
      renderScreen(SAMPLE)

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('한랑드림')
      expect(screen.getByTestId('ledger-year')).toHaveTextContent('2026년')
      expect(screen.getByRole('button', { name: '올해 결산' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '설정' })).toBeInTheDocument()
    })

    it('잔액 카드에 "지금 잔액", 잔액, "작년 이월 N원 포함" 을 보여준다', () => {
      renderScreen(SAMPLE)

      const card = screen.getByTestId('balance-card')
      expect(card).toHaveTextContent('지금 잔액')
      // 370,482 + 285,050 − 138,280
      expect(within(card).getByTestId('balance-card-amount')).toHaveTextContent('517,252원')
      expect(within(card).getByTestId('balance-card-note')).toHaveTextContent('작년 이월 370,482원 포함')
    })

    it('작년이 적자였으면 "작년 적자 N원 포함" 으로, 잔액이 모자라면 빼기표로 보여준다', () => {
      renderScreen(ledgerWith([entry('a', 9, 'expense', '대관료', 40_000)], -10_000))

      expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('−50,000원')
      expect(screen.getByTestId('balance-card-note')).toHaveTextContent('작년 적자 10,000원 포함')
    })

    it('작년 이월금이 0원이면 보조 줄을 숨긴다', () => {
      renderScreen(ledgerWith([], 0))

      expect(screen.queryByTestId('balance-card-note')).not.toBeInTheDocument()
    })
  })

  describe('한 달씩 보기', () => {
    it('AC-9 그 달의 수입·지출 소계와 기록을 입력 순으로 보여준다', () => {
      renderScreen(SAMPLE, 9)

      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('9월')
      const subtotal = within(monthCard()).getByTestId('month-subtotal')
      expect(within(subtotal).getByText('수입').nextSibling).toHaveTextContent('140,000원')
      expect(within(subtotal).getByText('지출').nextSibling).toHaveTextContent('98,280원')
      const rows = within(monthCard()).getAllByTestId('entry-row')
      expect(rows.map((row) => row.textContent)).toEqual(['회비+140,000원', '대관료−40,000원', '간식비−58,280원'])
      expect(within(rows[0]).getByTestId('amount-text')).toHaveAttribute('data-kind', 'income')
      expect(within(rows[1]).getByTestId('amount-text')).toHaveAttribute('data-kind', 'expense')
    })

    it('AC-9 [‹] [›] 로 한 달씩 넘기면 그 달 기록으로 바뀐다', async () => {
      renderScreen(SAMPLE, 9)

      await userEvent.click(screen.getByRole('button', { name: '다음 달' }))
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('10월')
      expect(within(monthCard()).getAllByTestId('entry-row').map((row) => row.textContent)).toEqual(['대관료−40,000원'])

      await userEvent.click(screen.getByRole('button', { name: '이전 달' }))
      await userEvent.click(screen.getByRole('button', { name: '이전 달' }))
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('8월')
    })

    it('AC-9 1월에서는 [‹] 가, 12월에서는 [›] 가 비활성이다', async () => {
      const { unmount } = renderScreen(SAMPLE, 1)

      expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '다음 달' })).toBeEnabled()
      unmount()

      renderScreen(SAMPLE, 12)
      expect(screen.getByRole('button', { name: '다음 달' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '이전 달' })).toBeEnabled()
    })

    it('기록이 없는 달은 [+ 내역 적기] 로 적어 보라고 안내하고 [N월 정리 보기] 는 숨긴다', () => {
      renderScreen(SAMPLE, 8)

      expect(monthCard()).toHaveTextContent('8월에 적은 내역이 없어요. 아래 [+ 내역 적기] 로 적어 보세요')
      expect(within(monthCard()).queryAllByTestId('entry-row')).toHaveLength(0)
      expect(screen.queryByRole('button', { name: /정리 보기/ })).not.toBeInTheDocument()
    })

    it('기록 한 줄을 누르면 그 기록의 고치기 화면을 열어 달라고 알린다', async () => {
      const onEditEntry = vi.fn()
      renderScreen(SAMPLE, 9, { onEditEntry })

      await userEvent.click(within(monthCard()).getByRole('button', { name: /^간식비/ }))

      expect(onEditEntry).toHaveBeenCalledWith('d')
    })
  })

  describe('화면 이동', () => {
    it('기록이 있는 달의 [N월 정리 보기] 는 그 달을 넘겨 월 정리를 열어 달라고 알린다', async () => {
      const onOpenMonthSummary = vi.fn()
      renderScreen(SAMPLE, 9, { onOpenMonthSummary })

      await userEvent.click(screen.getByRole('button', { name: '9월 정리 보기' }))

      expect(onOpenMonthSummary).toHaveBeenCalledWith(9)
    })

    it('[올해 결산] [설정] 을 누르면 그 화면을 열어 달라고 알린다', async () => {
      const onOpenYearSummary = vi.fn()
      const onOpenSettings = vi.fn()
      renderScreen(SAMPLE, 9, { onOpenYearSummary, onOpenSettings })

      await userEvent.click(screen.getByRole('button', { name: '올해 결산' }))
      await userEvent.click(screen.getByRole('button', { name: '설정' }))

      expect(onOpenYearSummary).toHaveBeenCalledOnce()
      expect(onOpenSettings).toHaveBeenCalledOnce()
    })

    it('아래 고정 [+ 내역 적기] 는 보고 있는 달을 넘겨 입력 화면을 열어 달라고 알린다', async () => {
      const onAddEntry = vi.fn()
      renderScreen(SAMPLE, 9, { onAddEntry })

      await userEvent.click(screen.getByRole('button', { name: '다음 달' }))
      await userEvent.click(within(screen.getByTestId('bottom-action-bar')).getByRole('button', { name: '+ 내역 적기' }))

      expect(onAddEntry).toHaveBeenCalledWith(10)
    })
  })
})
