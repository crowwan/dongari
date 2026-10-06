import { describe, expect, it } from 'vitest'
import { InvalidLedgerInputError } from './ledger'
import { monthSummary, yearReport, type ExpenseTableCell, type ExpenseTableRow } from './report'
import type { Entry, EntryType, Ledger } from './types'

// [월, 종류, 이름, 금액] 목록을 입력 순 기록으로 바꾼다
type EntrySpec = readonly [month: number, type: EntryType, name: string, amount: number]

function entries(specs: readonly EntrySpec[]): Entry[] {
  return specs.map(([month, type, name, amount], index) => ({
    id: `e${index + 1}`,
    month,
    type,
    name,
    amount,
    createdAt: `2025-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
  }))
}

function ledger(specs: readonly EntrySpec[], overrides: Partial<Omit<Ledger, 'entries'>> = {}): Ledger {
  return { year: 2025, clubName: '한랑드림', carryover: 370_482, entries: entries(specs), ...overrides }
}

// 지출내역 표 한쪽(왼쪽/오른쪽)을 사람이 읽기 쉬운 문자열 목록으로 바꾼다
// "1월|대관료|40000" = 그 달 첫 줄, "  |간식비|28340" = 같은 달 다음 줄, "1월||" = 지출 없는 달, "" = 아래 채움 빈 줄
function side(rows: readonly ExpenseTableRow[], pick: (row: ExpenseTableRow) => ExpenseTableCell | null): string[] {
  return rows.map((row) => {
    const cell = pick(row)
    if (cell === null) return ''
    const month = cell.monthRowSpan > 0 ? `${cell.month}월` : '  '
    return `${month}|${cell.item?.name ?? ''}|${cell.item?.amount ?? ''}`
  })
}

const leftSide = (rows: readonly ExpenseTableRow[]) => side(rows, (row) => row.left)
const rightSide = (rows: readonly ExpenseTableRow[]) => side(rows, (row) => row.right)

// PLANS.md 9장 v1 샘플 데이터 (1월만 있음)를 기록으로 옮긴 것
const V1_SAMPLE_JANUARY: readonly EntrySpec[] = [
  [1, 'income', '회비(14인)', 140_806],
  [1, 'expense', '대관료', 40_000],
  [1, 'expense', '간식비', 28_340],
]

// PLANS.md 6장 예시 숫자(수입 1,777,203 / 지출 1,994,780 / 잔액 152,905)를 재현하도록 만든 1년치 기록.
// 6장에 나온 값(1·2·12월 수입, 1·2·12월 지출, 7월 지출 3줄, 수입내역 3줄)은 그대로 쓰고, 나오지 않은 달은 합계가 맞게 채웠다
const V1_EXAMPLE_YEAR: readonly EntrySpec[] = [
  [1, 'income', '회비(14인)', 100_000],
  [1, 'income', '행사지원금', 40_806],
  [1, 'expense', '대관료', 40_000],
  [1, 'expense', '간식비', 28_340],
  [2, 'income', '회비(14인)', 390_000],
  [2, 'expense', '대관료', 40_000],
  [2, 'expense', '간식비', 31_900],
  [3, 'income', '회비(14인)', 140_000],
  [3, 'expense', '대관료', 40_000],
  [4, 'income', '회비(14인)', 140_000],
  [4, 'expense', '대관료', 40_000],
  [5, 'income', '회비(14인)', 140_000],
  [5, 'income', '행사지원금', 104_244],
  [5, 'expense', '대관료', 40_000],
  [6, 'income', '회비(14인)', 140_000],
  [6, 'income', '예금이자', 2_132],
  [7, 'income', '회비(14인)', 140_000],
  [7, 'expense', '대관료', 40_000],
  [7, 'expense', '간식비(8월)', 38_430],
  [7, 'expense', '간식비(2건)', 58_280],
  [8, 'income', '회비(14인)', 140_000],
  [8, 'expense', '대관료', 40_000],
  [9, 'income', '회비(14인)', 140_000],
  [9, 'expense', '대관료', 40_000],
  [10, 'expense', '대관료', 40_000],
  [10, 'expense', '야유회', 627_230],
  [11, 'expense', '행사비', 400_000],
  [12, 'income', '회비(14인)', 160_000],
  [12, 'income', '예금이자', 21],
  [12, 'expense', '대관료', 40_000],
  [12, 'expense', '송년회', 410_600],
]

describe('SPEC-003 올해 결산 계산', () => {
  describe('월별 수입·지출과 합계 (AC-1)', () => {
    it('기록에서 계산한 1~12월 수입·지출, 연간 합계, 잔액을 낸다', () => {
      const report = yearReport(
        ledger(
          [
            [1, 'income', '회비', 150_000],
            [1, 'expense', '대관료', 40_000],
            [3, 'expense', '간식비', 28_340],
            [3, 'income', '회비', 50_000],
            [12, 'expense', '송년회', 100_000],
          ],
          { carryover: 100_000 },
        ),
      )

      expect(report.months).toHaveLength(12)
      expect(report.months.map((month) => month.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
      expect(report.months[0]).toEqual({ month: 1, income: 150_000, expense: 40_000 })
      expect(report.months[1]).toEqual({ month: 2, income: 0, expense: 0 })
      expect(report.months[2]).toEqual({ month: 3, income: 50_000, expense: 28_340 })
      expect(report.months[11]).toEqual({ month: 12, income: 0, expense: 100_000 })
      expect(report.totals).toEqual({ income: 200_000, expense: 168_340, balance: 131_660 })
    })

    it('양식 제목과 이월금 칸에 쓸 연도·동아리 이름·이월금을 담는다', () => {
      const report = yearReport(ledger([], { year: 2026, clubName: '꽃동산', carryover: -5_000 }))

      expect(report.year).toBe(2026)
      expect(report.clubName).toBe('꽃동산')
      expect(report.carryover).toBe(-5_000)
    })
  })

  describe('수입내역 (AC-2)', () => {
    it('같은 이름의 수입 기록은 한 줄로 합치고, 처음 등장한 순서대로 둔다', () => {
      const report = yearReport(
        ledger([
          [3, 'income', '행사지원금', 30_000],
          [1, 'income', '회비', 100_000],
          [2, 'expense', '회비', 999],
          [4, 'income', '행사지원금', 15_050],
          [5, 'income', '예금이자', 2_153],
          [6, 'income', '회비', 40_000],
        ]),
      )

      expect(report.incomeItems).toEqual([
        { name: '행사지원금', amount: 45_050 },
        { name: '회비', amount: 140_000 },
        { name: '예금이자', amount: 2_153 },
      ])
    })

    it('수입내역 합계는 연간 수입 합계와 같다', () => {
      const report = yearReport(ledger(V1_EXAMPLE_YEAR))

      const itemsTotal = report.incomeItems.reduce((sum, item) => sum + item.amount, 0)
      expect(itemsTotal).toBe(report.totals.income)
    })
  })

  describe('v1 과 같은 숫자 (AC-3)', () => {
    it('PLANS.md 9장 v1 샘플(1월)을 기록으로 넣으면 v1 과 같은 1월 수입·지출, 이월금, 잔액이 나온다', () => {
      const report = yearReport(ledger(V1_SAMPLE_JANUARY))

      expect(report.carryover).toBe(370_482)
      expect(report.months[0]).toEqual({ month: 1, income: 140_806, expense: 68_340 })
      // v1 잔액 = 이월금 + 연간 수입 − 연간 지출
      expect(report.totals).toEqual({ income: 140_806, expense: 68_340, balance: 370_482 + 140_806 - 68_340 })
      expect(leftSide(report.expenseRows).slice(0, 2)).toEqual(['1월|대관료|40000', '  |간식비|28340'])
    })

    it('PLANS.md 6장 예시와 같은 내용을 넣으면 수입 1,777,203 / 지출 1,994,780 / 잔액 152,905 가 나온다', () => {
      const report = yearReport(ledger(V1_EXAMPLE_YEAR))

      expect(report.totals).toEqual({ income: 1_777_203, expense: 1_994_780, balance: 152_905 })
      expect(report.months[0]).toEqual({ month: 1, income: 140_806, expense: 68_340 })
      expect(report.months[1]).toEqual({ month: 2, income: 390_000, expense: 71_900 })
      expect(report.months[11]).toEqual({ month: 12, income: 160_021, expense: 450_600 })
      expect(report.incomeItems).toEqual([
        { name: '회비(14인)', amount: 1_630_000 },
        { name: '행사지원금', amount: 145_050 },
        { name: '예금이자', amount: 2_153 },
      ])
      expect(rightSide(report.expenseRows).slice(0, 3)).toEqual([
        '7월|대관료|40000',
        '  |간식비(8월)|38430',
        '  |간식비(2건)|58280',
      ])
    })
  })

  describe('지출내역 표 (AC-4)', () => {
    it('1~6월은 왼쪽, 7~12월은 오른쪽에 달별 지출 기록을 입력 순으로 쌓고, 지출 없는 달은 빈 한 줄을 둔다', () => {
      const report = yearReport(ledger(V1_EXAMPLE_YEAR))

      expect(leftSide(report.expenseRows)).toEqual([
        '1월|대관료|40000',
        '  |간식비|28340',
        '2월|대관료|40000',
        '  |간식비|31900',
        '3월|대관료|40000',
        '4월|대관료|40000',
        '5월|대관료|40000',
        '6월||',
        '',
        '',
      ])
      expect(rightSide(report.expenseRows)).toEqual([
        '7월|대관료|40000',
        '  |간식비(8월)|38430',
        '  |간식비(2건)|58280',
        '8월|대관료|40000',
        '9월|대관료|40000',
        '10월|대관료|40000',
        '  |야유회|627230',
        '11월|행사비|400000',
        '12월|대관료|40000',
        '  |송년회|410600',
      ])
    })

    it('달 칸은 그 달 첫 줄에만 있고, 그 달이 차지하는 줄 수만큼 세로로 합친다', () => {
      const report = yearReport(ledger(V1_EXAMPLE_YEAR))

      const rightSpans = report.expenseRows.map((row) => row.right?.monthRowSpan)
      expect(rightSpans).toEqual([3, 0, 0, 1, 1, 2, 0, 1, 2, 0])
      const leftSpans = report.expenseRows.map((row) => row.left?.monthRowSpan ?? null)
      expect(leftSpans).toEqual([2, 0, 2, 0, 1, 1, 1, 1, null, null])
    })

    it('같은 달에 이름이 같은 지출이 있어도 합치지 않는다', () => {
      const report = yearReport(
        ledger([
          [8, 'expense', '간식비', 10_000],
          [8, 'expense', '간식비', 20_000],
        ]),
      )

      expect(rightSide(report.expenseRows).slice(0, 3)).toEqual(['7월||', '8월|간식비|10000', '  |간식비|20000'])
    })

    it('지출이 1~6월에만 있어도 좌우 행 수가 같고, 짧은 오른쪽 아래를 빈 줄로 채운다', () => {
      const report = yearReport(
        ledger([
          [1, 'expense', '대관료', 40_000],
          [1, 'expense', '간식비', 28_340],
          [1, 'expense', '현수막', 15_000],
          [2, 'expense', '대관료', 40_000],
        ]),
      )

      // 왼쪽: 1월 3줄 + 2월 1줄 + 3~6월 빈 줄 4 = 8줄, 오른쪽: 7~12월 빈 줄 6 + 채움 2
      expect(report.expenseRows).toHaveLength(8)
      expect(leftSide(report.expenseRows)).toEqual([
        '1월|대관료|40000',
        '  |간식비|28340',
        '  |현수막|15000',
        '2월|대관료|40000',
        '3월||',
        '4월||',
        '5월||',
        '6월||',
      ])
      expect(rightSide(report.expenseRows)).toEqual(['7월||', '8월||', '9월||', '10월||', '11월||', '12월||', '', ''])
    })
  })

  describe('경계', () => {
    it('기록이 없는 장부는 모든 달이 0 이고, 지출표는 달마다 빈 한 줄씩 6줄, 수입내역은 비어 있고 잔액은 이월금이다', () => {
      const report = yearReport(ledger([]))

      expect(report.months.every((month) => month.income === 0 && month.expense === 0)).toBe(true)
      expect(report.totals).toEqual({ income: 0, expense: 0, balance: 370_482 })
      expect(report.incomeItems).toEqual([])
      expect(leftSide(report.expenseRows)).toEqual(['1월||', '2월||', '3월||', '4월||', '5월||', '6월||'])
      expect(rightSide(report.expenseRows)).toEqual(['7월||', '8월||', '9월||', '10월||', '11월||', '12월||'])
    })

    it('한 달만 기록된 장부도 12달 표와 그 달 지출만 채운 지출표를 낸다', () => {
      const report = yearReport(
        ledger([
          [9, 'income', '회비', 140_000],
          [9, 'expense', '대관료', 40_000],
          [9, 'expense', '간식비', 58_280],
        ]),
      )

      expect(report.months.filter((month) => month.income > 0 || month.expense > 0)).toEqual([
        { month: 9, income: 140_000, expense: 98_280 },
      ])
      expect(report.expenseRows).toHaveLength(7)
      expect(rightSide(report.expenseRows)).toEqual([
        '7월||',
        '8월||',
        '9월|대관료|40000',
        '  |간식비|58280',
        '10월||',
        '11월||',
        '12월||',
      ])
      expect(leftSide(report.expenseRows)[6]).toBe('')
    })
  })
})

describe('SPEC-003 월 정리 계산', () => {
  const sample = ledger(
    [
      [8, 'income', '회비', 140_000],
      [8, 'expense', '대관료', 40_000],
      [9, 'expense', '대관료', 40_000],
      [9, 'income', '회비', 140_000],
      [9, 'expense', '간식비', 28_280],
      [9, 'expense', '간식비', 30_000],
      [10, 'income', '회비', 140_000],
    ],
    { carryover: 1_024_473 },
  )

  it('그 달 수입·지출 내역을 입력 순으로, 이름이 같아도 합치지 않고 담고 각 합계를 낸다 (AC-8)', () => {
    const summary = monthSummary(sample, 9)

    expect(summary.month).toBe(9)
    expect(summary.incomeEntries.map((entry) => [entry.name, entry.amount])).toEqual([['회비', 140_000]])
    expect(summary.expenseEntries.map((entry) => [entry.name, entry.amount])).toEqual([
      ['대관료', 40_000],
      ['간식비', 28_280],
      ['간식비', 30_000],
    ])
    expect(summary.income).toBe(140_000)
    expect(summary.expense).toBe(98_280)
  })

  it('전달까지 잔액(이월금 + 1월~전달 수입 − 지출), 그 달 수입−지출, 월말 잔액을 낸다 (AC-8)', () => {
    const summary = monthSummary(sample, 9)

    // 8월까지: 1,024,473 + 140,000 − 40,000
    expect(summary.opening).toEqual({ kind: 'previousMonth', month: 8, amount: 1_124_473 })
    expect(summary.net).toBe(41_720)
    expect(summary.closing).toBe(1_166_193)
  })

  it('1월 정리의 전달까지 잔액 자리는 작년 이월금이다 (AC-9)', () => {
    const summary = monthSummary(ledger([[1, 'expense', '대관료', 40_000]], { year: 2026, carryover: 370_482 }), 1)

    expect(summary.opening).toEqual({ kind: 'carryover', year: 2025, amount: 370_482 })
    expect(summary.net).toBe(-40_000)
    expect(summary.closing).toBe(330_482)
  })

  it('지출만 있는 달은 수입 내역이 비고 그 달 수입−지출이 음수다', () => {
    const summary = monthSummary(ledger([[3, 'expense', '대관료', 40_000]], { carryover: 0 }), 3)

    expect(summary.incomeEntries).toEqual([])
    expect(summary.income).toBe(0)
    expect(summary.opening).toEqual({ kind: 'previousMonth', month: 2, amount: 0 })
    expect(summary.net).toBe(-40_000)
    expect(summary.closing).toBe(-40_000)
  })

  it('1~12 밖의 달은 거부한다', () => {
    expect(() => monthSummary(sample, 0)).toThrow(InvalidLedgerInputError)
    expect(() => monthSummary(sample, 13)).toThrow(InvalidLedgerInputError)
  })
})
