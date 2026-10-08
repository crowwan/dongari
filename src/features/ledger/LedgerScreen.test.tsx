import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { calculateTotals } from '../../domain/ledger'
import type { Entry, Ledger } from '../../domain/types'
import { useScreenHistory } from '../useScreenHistory'
import { LedgerScreen } from './LedgerScreen'

function entry(id: string, month: number, type: Entry['type'], name: string, amount: number): Entry {
  return { id, month, type, name, amount, createdAt: '2026-01-01T00:00:00.000Z' }
}

function ledgerWith(entries: Entry[], carryover = 370_482): Ledger {
  return { year: 2026, carryover, entries }
}

type Handlers = {
  onAddEntry?: (month: number) => void
  onEditEntry?: (id: string) => void
  onOpenMonthSummary?: (month: number) => void
  onOpenYearSummary?: () => void
  onOpenSettings?: () => void
}

// 보고 있는 달은 App 이 들고 있으므로, 테스트에서는 같은 역할의 상태를 감싼다
// 선택 창은 App 처럼 방문 기록 훅이 연다
function Harness({ ledger, initialMonth, handlers }: { ledger: Ledger; initialMonth: number; handlers: Handlers }) {
  const [month, setMonth] = useState(initialMonth)
  const sheets = useScreenHistory()
  return (
    <LedgerScreen
      bookName="한랑드림"
      year={ledger.year}
      currentMonth={10}
      sheets={sheets}
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
    it('위쪽에 동아리 이름과 연도, [결산] [설정] 아이콘 + 글자 버튼이 있다', () => {
      renderScreen(SAMPLE)

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('한랑드림')
      expect(screen.getByTestId('ledger-year')).toHaveTextContent('2026년')
      expect(screen.getByRole('button', { name: '결산' }).querySelector('[data-icon="chart"]')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '설정' }).querySelector('[data-icon="settings"]')).toBeInTheDocument()
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
    it('AC-9 기록은 날짜순(같은 날은 적은 순, 날짜 없는 예전 기록은 맨 뒤)이고 이름 아래 "7일 · 지출"(날짜 없으면 "지출"만)', () => {
      const dated = ledgerWith([
        { ...entry('old', 10, 'expense', '옛 기록', 1_000), createdAt: '2026-10-01T00:00:00.000Z' },
        { ...entry('late', 10, 'income', '회비', 140_000), day: 7, createdAt: '2026-10-09T00:00:00.000Z' },
        { ...entry('third', 10, 'expense', '대관료', 40_000), day: 3, createdAt: '2026-10-08T00:00:00.000Z' },
        { ...entry('early', 10, 'expense', '간식비', 5_000), day: 7, createdAt: '2026-10-02T00:00:00.000Z' },
      ])
      renderScreen(dated, 10)

      const rows = within(monthCard()).getAllByTestId('list-row')
      expect(rows.map((row) => row.textContent)).toEqual([
        '대관료 3일 · 지출 −40,000원',
        '간식비 7일 · 지출 −5,000원',
        '회비 7일 · 수입 +140,000원',
        '옛 기록 지출 −1,000원',
      ])
    })

    it('AC-9 그 달의 수입·지출 소계와 기록을 보여준다 (날짜 없는 예전 기록끼리는 적은 순)', () => {
      renderScreen(SAMPLE, 9)

      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('9월')
      const subtotal = within(monthCard()).getByTestId('month-subtotal')
      expect(within(subtotal).getByText('수입').nextSibling).toHaveTextContent('140,000원')
      expect(within(subtotal).getByText('지출').nextSibling).toHaveTextContent('98,280원')
      const rows = within(monthCard()).getAllByTestId('list-row')
      expect(rows.map((row) => row.textContent)).toEqual(['회비 수입 +140,000원', '대관료 지출 −40,000원', '간식비 지출 −58,280원'])
      expect(within(rows[0]).getByTestId('amount-text')).toHaveAttribute('data-kind', 'income')
      expect(within(rows[1]).getByTestId('amount-text')).toHaveAttribute('data-kind', 'expense')
    })

    it('AC-9 [‹] [›] 로 한 달씩 넘기면 그 달 기록으로 바뀐다', async () => {
      renderScreen(SAMPLE, 9)

      await userEvent.click(screen.getByRole('button', { name: '다음 달' }))
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('10월')
      expect(within(monthCard()).getAllByTestId('list-row').map((row) => row.textContent)).toEqual(['대관료 지출 −40,000원'])

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
      expect(within(monthCard()).queryAllByTestId('list-row')).toHaveLength(0)
      expect(within(monthCard()).queryByTestId('month-subtotal')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /정리 보기/ })).not.toBeInTheDocument()
    })

    it('AC-18 기록 줄 아이콘은 항목 이름으로 정하고, 수입 줄은 청록 원·지출 줄은 회색 원이다', () => {
      renderScreen(SAMPLE, 9)

      const rows = within(monthCard()).getAllByTestId('list-row')
      expect(rows.map((row) => row.querySelector('[data-icon]')?.getAttribute('data-icon'))).toEqual([
        'users',
        'building',
        'cup',
      ])
      expect(rows.map((row) => row.getAttribute('data-tone'))).toEqual(['income', 'neutral', 'neutral'])
    })

    it('AC-18 모르는 이름의 기록은 영수증 아이콘이다', () => {
      renderScreen(ledgerWith([entry('x', 9, 'expense', '현수막', 30_000)]), 9)

      expect(within(monthCard()).getByTestId('list-row').querySelector('[data-icon]')).toHaveAttribute('data-icon', 'receipt')
    })

    describe('달 선택 창', () => {
      it('AC-9 가운데 "9월 ▾" 를 누르면 열두 달 선택 창이 열리고, 보던 달은 칠해져 있고 이번 달은 테두리다', async () => {
        renderScreen(SAMPLE, 9)

        await userEvent.click(screen.getByRole('button', { name: '9월 달 고르기' }))

        const sheet = screen.getByRole('dialog', { name: '몇 월을 볼까요?' })
        expect(within(sheet).getAllByRole('button')).toHaveLength(12)
        expect(within(sheet).getByRole('button', { name: '9월' })).toHaveAttribute('aria-pressed', 'true')
        expect(within(sheet).getByRole('button', { name: '10월' })).toHaveAttribute('aria-current', 'date')
      })

      it('AC-9 선택 창에서 달을 고르면 창이 닫히고 그 달 기록을 보여 준다', async () => {
        renderScreen(SAMPLE, 9)
        await userEvent.click(screen.getByRole('button', { name: '9월 달 고르기' }))

        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '3월' }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('3월')
        expect(within(monthCard()).getAllByTestId('list-row').map((row) => row.textContent)).toEqual([
          '행사지원금 수입 +145,050원',
        ])
      })

      it('안드로이드 뒤로 버튼을 누르면 선택 창만 닫히고 보던 달 그대로다', async () => {
        renderScreen(SAMPLE, 9)
        await userEvent.click(screen.getByRole('button', { name: '9월 달 고르기' }))

        act(() => {
          window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
        })

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('9월')
        expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
      })
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

      const summary = screen.getByRole('button', { name: '9월 정리 보기' })
      expect(summary).toHaveAttribute('data-variant', 'fill')
      await userEvent.click(summary)

      expect(onOpenMonthSummary).toHaveBeenCalledWith(9)
    })

    it('[결산] [설정] 을 누르면 그 화면을 열어 달라고 알린다', async () => {
      const onOpenYearSummary = vi.fn()
      const onOpenSettings = vi.fn()
      renderScreen(SAMPLE, 9, { onOpenYearSummary, onOpenSettings })

      await userEvent.click(screen.getByRole('button', { name: '결산' }))
      await userEvent.click(screen.getByRole('button', { name: '설정' }))

      expect(onOpenYearSummary).toHaveBeenCalledOnce()
      expect(onOpenSettings).toHaveBeenCalledOnce()
    })

    it('아래 고정 [+ 내역 적기] 는 보고 있는 달을 넘겨 입력 화면을 열어 달라고 알린다', async () => {
      const onAddEntry = vi.fn()
      renderScreen(SAMPLE, 9, { onAddEntry })

      await userEvent.click(screen.getByRole('button', { name: '다음 달' }))
      await userEvent.click(within(screen.getByTestId('bottom-action-bar')).getByRole('button', { name: '내역 적기' }))

      expect(onAddEntry).toHaveBeenCalledWith(10)
    })
  })
})
