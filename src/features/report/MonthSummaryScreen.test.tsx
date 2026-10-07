import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Ledger } from '../../domain/types'
import { ledger } from '../../test/ledgerFixtures'
import { MonthSummaryScreen } from './MonthSummaryScreen'
import type { PictureSaver } from './savePicture'

const SEPTEMBER: Ledger = ledger(
  [
    [8, 'income', '회비', 140_000],
    [8, 'expense', '대관료', 40_000],
    [9, 'expense', '대관료', 40_000],
    [9, 'income', '회비', 140_000],
    [9, 'expense', '간식비', 28_280],
    [9, 'expense', '간식비', 30_000],
  ],
  { year: 2026, carryover: 1_024_473 },
)

// 사진 만들기·내려받기를 하지 않는 가짜
function fakeSaver(): PictureSaver {
  return { make: vi.fn(async () => new Blob(['png'])), download: vi.fn() }
}

function renderSummary(data: Ledger, month: number, saver: PictureSaver = fakeSaver()) {
  const onNotify = vi.fn()
  render(<MonthSummaryScreen ledger={data} month={month} onBack={() => {}} onNotify={onNotify} saver={saver} />)
  return { onNotify, saver }
}

// 한 묶음(수입/지출/잔액) 안의 줄을 "이름 금액" 글자로
function linesOf(name: string): string[] {
  const card = screen.getByRole('region', { name })
  return within(card)
    .getAllByTestId('summary-line')
    .map((line) => line.textContent ?? '')
}

describe('SPEC-003 월 정리 화면', () => {
  it('제목은 "2026년 9월 정리" 다', () => {
    renderSummary(SEPTEMBER, 9)

    expect(screen.getByRole('heading', { level: 1, name: '2026년 9월 정리' })).toBeInTheDocument()
  })

  it('그 달 수입·지출 내역을 입력 순으로(이름이 같아도 합치지 않고) 보이고 각 합계를 보인다 (AC-8)', () => {
    renderSummary(SEPTEMBER, 9)

    expect(linesOf('수입')).toEqual(['회비140,000원', '수입 합계140,000원'])
    expect(linesOf('지출')).toEqual(['대관료40,000원', '간식비28,280원', '간식비30,000원', '지출 합계98,280원'])
  })

  it('전달까지 잔액, 그 달 수입 − 지출(부호 포함), 월말 잔액을 보인다 (AC-8)', () => {
    renderSummary(SEPTEMBER, 9)

    expect(linesOf('잔액')).toEqual(['8월까지 잔액1,124,473원', '9월 수입 − 지출+41,720원', '9월 말 잔액1,166,193원'])
  })

  it('1월 정리의 전달까지 잔액 자리는 작년 이월금이다 (AC-9)', () => {
    renderSummary(ledger([[1, 'expense', '대관료', 40_000]], { year: 2026, carryover: 370_482 }), 1)

    expect(linesOf('잔액')).toEqual(['작년 이월금370,482원', '1월 수입 − 지출−40,000원', '1월 말 잔액330,482원'])
  })

  it('작년이 적자였으면 1월 정리에 "작년 적자" 로 보이고 월말 잔액도 적자면 − 가 붙는다', () => {
    renderSummary(ledger([[1, 'expense', '대관료', 40_000]], { year: 2026, carryover: -10_000 }), 1)

    expect(linesOf('잔액')).toEqual(['작년 적자10,000원', '1월 수입 − 지출−40,000원', '1월 말 잔액−50,000원'])
  })

  it('수입이 없는 달은 수입 묶음에 "없어요" 한 줄만 보인다', () => {
    renderSummary(ledger([[3, 'expense', '대관료', 40_000]], { year: 2026, carryover: 0 }), 3)

    const income = screen.getByRole('region', { name: '수입' })
    expect(within(income).getByText('없어요')).toBeInTheDocument()
    expect(within(income).queryByTestId('summary-line')).not.toBeInTheDocument()
    expect(linesOf('지출')).toEqual(['대관료40,000원', '지출 합계40,000원'])
  })

  it('지출이 없는 달은 지출 묶음에 "없어요" 한 줄만 보인다', () => {
    renderSummary(ledger([[3, 'income', '회비', 140_000]], { year: 2026, carryover: 0 }), 3)

    const expense = screen.getByRole('region', { name: '지출' })
    expect(within(expense).getByText('없어요')).toBeInTheDocument()
    expect(within(expense).queryByTestId('summary-line')).not.toBeInTheDocument()
  })

  it('합계 줄과 월말 잔액 줄만 굵은 합계 줄이고, 수입 합계는 수입 금액 표시, 월말 잔액은 큰 숫자다', () => {
    renderSummary(SEPTEMBER, 9)

    const totals = screen.getAllByTestId('summary-line').filter((line) => line.dataset.total !== undefined)
    expect(totals.map((line) => line.textContent)).toEqual(['수입 합계140,000원', '지출 합계98,280원', '9월 말 잔액1,166,193원'])
    expect(totals.map((line) => line.dataset.kind ?? null)).toEqual(['income', null, 'closing'])
  })

  it('아래 고정 [사진으로 저장] 은 글자 앞에 내려받기 아이콘이 있다', () => {
    renderSummary(SEPTEMBER, 9)

    const button = screen.getByRole('button', { name: '사진으로 저장' })
    expect(button.querySelector('[data-icon="download"]')).toBeInTheDocument()
  })

  it('[사진으로 저장] 은 제목과 세 묶음이 든 정리 영역을 사진으로 만들어 "동아리회계-2026년-9월-정리.png" 로 내려받는다', async () => {
    const { saver, onNotify } = renderSummary(SEPTEMBER, 9)

    await userEvent.click(screen.getByRole('button', { name: '사진으로 저장' }))

    expect(saver.make).toHaveBeenCalledTimes(1)
    expect(saver.make).toHaveBeenCalledWith(screen.getByTestId('month-summary-sheet'))
    const sheet = screen.getByTestId('month-summary-sheet')
    expect(within(sheet).getByRole('heading', { name: '2026년 9월 정리' })).toBeInTheDocument()
    expect(within(sheet).getByRole('region', { name: '잔액' })).toBeInTheDocument()
    expect(saver.download).toHaveBeenCalledWith(expect.any(Blob), '동아리회계-2026년-9월-정리.png')
    expect(onNotify).toHaveBeenCalledWith('사진을 저장했어요. 갤러리의 Download 앨범에서 볼 수 있어요')
  })
})
