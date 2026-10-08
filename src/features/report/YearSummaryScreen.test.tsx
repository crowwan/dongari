import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Ledger } from '../../domain/types'
import { ledger, V1_EXAMPLE_YEAR } from '../../test/ledgerFixtures'
import type { PictureSaver } from './savePicture'
import { YearSummaryScreen } from './YearSummaryScreen'

function fakeSaver(): PictureSaver {
  return { make: vi.fn(async () => new Blob(['png'])), download: vi.fn() }
}

function renderYear(data: Ledger | undefined, saver: PictureSaver = fakeSaver()) {
  const onNotify = vi.fn()
  render(<YearSummaryScreen bookName="한랑드림" year={data?.year ?? 2026} ledger={data} onBack={() => {}} onNotify={onNotify} saver={saver} />)
  return { onNotify, saver }
}

// 표의 본문 줄마다 칸 글자 목록
function bodyRows(table: HTMLElement): string[][] {
  const body = table.querySelector('tbody')
  if (!body) throw new Error('표 본문이 없다')
  return [...body.querySelectorAll('tr')].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? ''))
}

const V1_EXAMPLE = ledger(V1_EXAMPLE_YEAR)

describe('SPEC-003 올해 결산 화면', () => {
  it('양식 제목 셋 "<2025년 한랑드림 수입 지출 내역>" "<2025년 한랑드림 지출내역>" "<2025년 한랑드림 항목별 합계>" 가 있다', () => {
    renderYear(V1_EXAMPLE)

    expect(screen.getByRole('heading', { level: 1, name: '2025년 결산' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '<2025년 한랑드림 수입 지출 내역>' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '<2025년 한랑드림 지출내역>' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '<2025년 한랑드림 항목별 합계>' })).toBeInTheDocument()
  })

  it('월별 수입·지출 표에 1~12월과 계를 보이고, 옆에 작년 이월금·올해 수입·지출·잔액을 보인다 (AC-1, AC-3)', () => {
    renderYear(V1_EXAMPLE)

    const rows = bodyRows(screen.getByTestId('year-month-table'))
    expect(rows).toHaveLength(13)
    expect(rows[0]).toEqual(['1월', '140,806', '68,340'])
    expect(rows[1]).toEqual(['2월', '390,000', '71,900'])
    expect(rows[9]).toEqual(['10월', '0', '667,230'])
    expect(rows[11]).toEqual(['12월', '160,021', '450,600'])
    expect(rows[12]).toEqual(['계', '1,777,203', '1,994,780'])

    const summary = screen.getByTestId('year-summary-box')
    expect([...summary.children].map((line) => line.textContent)).toEqual([
      '2024년',
      '이월금 ₩ 370,482',
      '2025년',
      '수 입 ₩ 1,777,203',
      '지 출 ₩ 1,994,780',
      '잔 액 ₩ 152,905',
    ])
  })

  it('항목별 합계 표는 머리 [수 입 | 지 출] 이 각각 두 칸이고, 줄마다 왼쪽 수입·오른쪽 지출, 짧은 쪽은 빈 칸, 맨 아래 계 (AC-2, AC-3)', () => {
    renderYear(V1_EXAMPLE)

    const table = screen.getByTestId('year-item-table')
    const heads = [...table.querySelectorAll('thead th')]
    expect(heads.map((head) => [head.textContent, head.getAttribute('colspan')])).toEqual([
      ['수 입', '2'],
      ['지 출', '2'],
    ])
    expect(bodyRows(table)).toEqual([
      ['회비(14인)', '1,630,000', '야유회', '627,230'],
      ['행사지원금', '145,050', '송년회', '410,600'],
      ['예금이자', '2,153', '대관료', '400,000'],
      ['', '', '행사비', '400,000'],
      ['', '', '간식비', '60,240'],
      ['', '', '간식비(2건)', '58,280'],
      ['', '', '간식비(8월)', '38,430'],
      ['계', '1,777,203', '계', '1,994,780'],
    ])
    // v1 의 "◈ 수입내역" 목록은 이 표로 바뀌었다
    expect(screen.queryByText('◈ 수입내역')).not.toBeInTheDocument()
  })

  it('지출내역 표 바로 아래 "2025년 지출 합계" 줄은 그대로 둔다', () => {
    renderYear(V1_EXAMPLE)

    expect(screen.getByTestId('year-expense-total')).toHaveTextContent('2025년 지출 합계 ₩1,994,780')
  })

  it('수입만 있는 해는 항목별 합계 표 오른쪽(지출)이 빈 칸이고 지출 계는 0 이다', () => {
    renderYear(ledger([[3, 'income', '회비', 50_000]]))

    expect(bodyRows(screen.getByTestId('year-item-table'))).toEqual([
      ['회비', '50,000', '', ''],
      ['계', '50,000', '계', '0'],
    ])
  })

  it('지출내역 표는 1월↔7월 … 6월↔12월 짝으로 좌우 행 수가 같고, 달 칸은 짝 높이만큼 합친다 (AC-4)', () => {
    renderYear(V1_EXAMPLE)

    const table = screen.getByTestId('year-expense-table')
    const rows = bodyRows(table)
    // 짝 높이: 1↔7 3, 2↔8 2, 3↔9 1, 4↔10 2, 5↔11 1, 6↔12 2
    expect(rows).toHaveLength(11)
    // 첫 줄: 왼쪽 달·지출·금액 + 오른쪽 달·지출·금액
    expect(rows[0]).toEqual(['1월', '대관료', '40,000', '7월', '대관료', '40,000'])
    // 같은 짝 다음 줄은 달 칸 없이 지출·금액만 (좌우)
    expect(rows[1]).toEqual(['간식비', '28,340', '간식비(8월)', '38,430'])
    // 1월은 2줄이라 세 번째 줄 왼쪽은 빈 줄
    expect(rows[2]).toEqual(['', '', '간식비(2건)', '58,280'])
    // 6월은 지출이 없어도 한 짝(6↔12)을 차지한다
    expect(rows[9]).toEqual(['6월', '', '', '12월', '대관료', '40,000'])

    const monthCells = within(table).getAllByTestId('year-expense-month')
    expect(monthCells.map((cell) => [cell.textContent, cell.getAttribute('rowspan')])).toEqual([
      ['1월', '3'],
      ['7월', '3'],
      ['2월', '2'],
      ['8월', '2'],
      ['3월', '1'],
      ['9월', '1'],
      ['4월', '2'],
      ['10월', '2'],
      ['5월', '1'],
      ['11월', '1'],
      ['6월', '2'],
      ['12월', '2'],
    ])
  })

  it('지출내역 표는 달이 바뀌는 줄에서만 가로 테두리를 긋는다 (v1 PLANS.md 6.3)', () => {
    renderYear(V1_EXAMPLE)

    const body = screen.getByTestId('year-expense-table').querySelector('tbody')
    const firstNameCells = [...(body?.querySelectorAll('tr') ?? [])].map((row) => row.querySelector('[data-testid="year-expense-name"]'))
    // 짝 끝 줄(1↔7 짝의 세 번째 줄)만 아래 테두리가 있고, 그 위 두 줄은 없다
    expect(firstNameCells[0]).toHaveStyle({ borderBottomStyle: 'none' })
    expect(firstNameCells[1]).toHaveStyle({ borderBottomStyle: 'none' })
    expect(firstNameCells[2]).toHaveStyle({ borderBottomStyle: 'solid' })
  })

  it('기록이 하나도 없으면 양식 대신 안내를 보이고 [사진으로 저장] 을 누를 수 없다 (AC-5)', () => {
    renderYear(ledger([], { year: 2026 }))

    expect(screen.getByText('적은 내역이 있어야 결산을 만들 수 있어요')).toBeInTheDocument()
    expect(screen.queryByTestId('year-report-sheet')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toBeDisabled()
  })

  it('고른 연도 장부가 아직 없어도 기록 없음과 같게 안내하고 [사진으로 저장] 을 누를 수 없다 (AC-5)', () => {
    renderYear(undefined)

    expect(screen.getByText('적은 내역이 있어야 결산을 만들 수 있어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toBeDisabled()
  })

  it('아래 고정 [사진으로 저장] 은 글자 앞에 내려받기 아이콘이 있다', () => {
    renderYear(V1_EXAMPLE)

    const button = screen.getByRole('button', { name: '사진으로 저장' })
    expect(button.querySelector('[data-icon="download"]')).toBeInTheDocument()
  })

  it('[사진으로 저장] 은 결산 양식만 사진으로 만들어 "동아리회계-2025년-결산.png" 로 내려받는다', async () => {
    const { saver, onNotify } = renderYear(V1_EXAMPLE)

    await userEvent.click(screen.getByRole('button', { name: '사진으로 저장' }))

    expect(saver.make).toHaveBeenCalledWith(screen.getByTestId('year-report-capture'))
    expect(within(screen.getByTestId('year-report-capture')).getByTestId('year-report-sheet')).toBeInTheDocument()
    expect(saver.download).toHaveBeenCalledWith(expect.any(Blob), '동아리회계-2025년-결산.png')
    expect(onNotify).toHaveBeenCalledWith('사진을 저장했어요. 갤러리의 Download 앨범에서 볼 수 있어요')
  })
})

describe('SPEC-003 올해 결산 [결산표 | 항목별 합계] 전환 (AC-10)', () => {
  it('제목 아래 [결산표 | 항목별 합계] 전환이 있고 처음은 [결산표] 다', () => {
    renderYear(V1_EXAMPLE)

    const group = screen.getByRole('group', { name: '무엇을 볼까요?' })
    expect(within(group).getByRole('button', { name: '결산표' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: '항목별 합계' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('year-report-sheet')).toBeInTheDocument()
  })

  it('[항목별 합계] 를 고르면 양식 대신 수입·지출 카드에 이름·건수·금액·비율 막대가 보이고 [사진으로 저장] 은 사라진다', async () => {
    renderYear(V1_EXAMPLE)

    await userEvent.click(screen.getByRole('button', { name: '항목별 합계' }))

    expect(screen.queryByTestId('year-report-sheet')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '사진으로 저장' })).not.toBeInTheDocument()

    const income = screen.getByRole('region', { name: '수입' })
    expect(within(income).getByTestId('item-totals-total')).toHaveTextContent('1,777,203원')
    const incomeRows = within(income).getAllByTestId('item-total-row')
    expect(incomeRows.map((row) => row.textContent)).toEqual([
      '회비(14인)10건1,630,000원',
      '행사지원금2건145,050원',
      '예금이자2건2,153원',
    ])

    const expense = screen.getByRole('region', { name: '지출' })
    expect(within(expense).getByTestId('item-totals-total')).toHaveTextContent('1,994,780원')
    const expenseRows = within(expense).getAllByTestId('item-total-row')
    expect(expenseRows).toHaveLength(7)
    expect(expenseRows[0]).toHaveTextContent('야유회1건627,230원')
    expect(expenseRows[2]).toHaveTextContent('대관료10건400,000원')
  })

  it('비율 막대 길이는 그해 그쪽 합계 대비 금액 비율이다', async () => {
    renderYear(
      ledger([
        [1, 'expense', '대관료', 30_000],
        [2, 'expense', '간식비', 10_000],
      ]),
    )

    await userEvent.click(screen.getByRole('button', { name: '항목별 합계' }))

    const bars = within(screen.getByRole('region', { name: '지출' })).getAllByTestId('item-total-bar')
    expect(bars.map((bar) => bar.style.width)).toEqual(['75%', '25%'])
  })

  it('한쪽 기록이 없으면 그 카드에 "올해 적은 수입이 없어요" 를 보인다', async () => {
    renderYear(ledger([[3, 'expense', '대관료', 40_000]]))

    await userEvent.click(screen.getByRole('button', { name: '항목별 합계' }))

    const income = screen.getByRole('region', { name: '수입' })
    expect(within(income).getByText('올해 적은 수입이 없어요')).toBeInTheDocument()
    expect(within(income).queryByTestId('item-totals-total')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '지출' })).getAllByTestId('item-total-row')).toHaveLength(1)
  })

  it('지출 기록이 없으면 지출 카드에 "올해 적은 지출이 없어요" 를 보인다', async () => {
    renderYear(ledger([[3, 'income', '회비', 40_000]]))

    await userEvent.click(screen.getByRole('button', { name: '항목별 합계' }))

    expect(within(screen.getByRole('region', { name: '지출' })).getByText('올해 적은 지출이 없어요')).toBeInTheDocument()
  })

  it('[결산표] 로 돌아오면 양식과 [사진으로 저장] 이 다시 보인다', async () => {
    renderYear(V1_EXAMPLE)

    await userEvent.click(screen.getByRole('button', { name: '항목별 합계' }))
    await userEvent.click(screen.getByRole('button', { name: '결산표' }))

    expect(screen.getByTestId('year-report-sheet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toBeEnabled()
  })

  it('전환은 방문 기록에 쌓지 않는다 (안드로이드 뒤로 버튼은 바로 장부로)', async () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    renderYear(V1_EXAMPLE)

    await userEvent.click(screen.getByRole('button', { name: '항목별 합계' }))
    await userEvent.click(screen.getByRole('button', { name: '결산표' }))

    expect(pushState).not.toHaveBeenCalled()
    pushState.mockRestore()
  })

  it('기록이 하나도 없으면 전환 없이 안내만 보인다 (AC-5)', () => {
    renderYear(ledger([], { year: 2026 }))

    expect(screen.queryByRole('group', { name: '무엇을 볼까요?' })).not.toBeInTheDocument()
    expect(screen.getByText('적은 내역이 있어야 결산을 만들 수 있어요')).toBeInTheDocument()
  })
})
