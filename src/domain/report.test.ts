import { describe, expect, it } from 'vitest'
import { InvalidLedgerInputError } from './ledger'
import { monthSummary, yearReport, type ExpenseTableCell, type ExpenseTableRow } from './report'
import type { Ledger } from './types'
import { ledger, V1_EXAMPLE_YEAR, type EntrySpec } from '../test/ledgerFixtures'

// 지출내역 표 한쪽(왼쪽/오른쪽)을 사람이 읽기 쉬운 문자열 목록으로 바꾼다
// "1월|대관료|40000" = 그 달 첫 줄, "  |간식비|28340" = 같은 달 다음 줄, "1월||" = 지출 없는 달, "  ||" = 짝 높이를 맞춘 빈 줄
function side(rows: readonly ExpenseTableRow[], pick: (row: ExpenseTableRow) => ExpenseTableCell): string[] {
  return rows.map((row) => {
    const cell = pick(row)
    const month = cell.monthRowSpan > 0 ? `${cell.month}월` : '  '
    return `${month}|${cell.item?.name ?? ''}|${cell.item?.amount ?? ''}`
  })
}

const leftSide = (rows: readonly ExpenseTableRow[]) => side(rows, (row) => row.left)

// 기록에 입력 순서대로 날짜(일)를 붙인다. undefined 면 날짜 없는 예전 기록
function withDays(target: Ledger, days: readonly (number | undefined)[]): Ledger {
  return {
    ...target,
    entries: target.entries.map((entry, index) => {
      const day = days[index]
      return day === undefined ? entry : { ...entry, day }
    }),
  }
}
const rightSide = (rows: readonly ExpenseTableRow[]) => side(rows, (row) => row.right)

// PLANS.md 9장 v1 샘플 데이터 (1월만 있음)를 기록으로 옮긴 것
const V1_SAMPLE_JANUARY: readonly EntrySpec[] = [
  [1, 'income', '회비(14인)', 140_806],
  [1, 'expense', '대관료', 40_000],
  [1, 'expense', '간식비', 28_340],
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

    it('양식 제목과 이월금 칸에 쓸 연도·이월금을 담는다 (장부 이름은 장부에서, SPEC-005)', () => {
      const report = yearReport(ledger([], { year: 2026, carryover: -5_000 }))

      expect(report.year).toBe(2026)
      expect(report.carryover).toBe(-5_000)
    })
  })

  describe('항목별 합계 (AC-2)', () => {
    it('수입·지출 각각 이름이 똑같은 기록끼리 한 줄로 합치고 건수를 센다', () => {
      const report = yearReport(
        ledger([
          [1, 'income', '회비', 100_000],
          [2, 'expense', '회비', 999],
          [3, 'income', '행사지원금', 30_000],
          [4, 'income', '회비', 40_000],
          [5, 'expense', '대관료', 40_000],
          [6, 'expense', '대관료', 40_000],
        ]),
      )

      expect(report.incomeItems).toEqual([
        { name: '회비', amount: 140_000, count: 2 },
        { name: '행사지원금', amount: 30_000, count: 1 },
      ])
      expect(report.expenseItems).toEqual([
        { name: '대관료', amount: 80_000, count: 2 },
        { name: '회비', amount: 999, count: 1 },
      ])
    })

    it('띄어쓰기·괄호까지 똑같아야 합친다 ("간식비(8월)" 과 "간식비", "간식 비" 는 다른 줄)', () => {
      const report = yearReport(
        ledger([
          [1, 'expense', '간식비', 30_000],
          [2, 'expense', '간식비(8월)', 20_000],
          [3, 'expense', '간식 비', 10_000],
          [4, 'expense', '간식비', 5_000],
        ]),
      )

      expect(report.expenseItems).toEqual([
        { name: '간식비', amount: 35_000, count: 2 },
        { name: '간식비(8월)', amount: 20_000, count: 1 },
        { name: '간식 비', amount: 10_000, count: 1 },
      ])
    })

    it('합친 금액이 큰 순으로 둔다', () => {
      const report = yearReport(
        ledger([
          [1, 'income', '예금이자', 2_000],
          [2, 'income', '회비', 50_000],
          [3, 'income', '행사지원금', 30_000],
          [4, 'income', '예금이자', 100_000],
        ]),
      )

      expect(report.incomeItems.map((item) => item.name)).toEqual(['예금이자', '회비', '행사지원금'])
    })

    it('금액이 같으면 그해 먼저 나온(이른 달·날) 항목이 앞이다. 적은 순서가 아니라 날짜로 본다', () => {
      const dated = withDays(
        ledger([
          [5, 'expense', '행사비', 40_000],
          [2, 'expense', '대관료', 40_000],
          [5, 'expense', '꽃값', 40_000],
          [5, 'expense', '회식', 40_000],
        ]),
        [20, 3, 10, undefined],
      )

      // 2월 대관료 → 5월 10일 꽃값 → 5월 20일 행사비 → 날짜 없는 5월 회식
      expect(yearReport(dated).expenseItems.map((item) => item.name)).toEqual(['대관료', '꽃값', '행사비', '회식'])
    })

    it('수입·지출 각 쪽 합이 연간 수입·지출 합계와 같다', () => {
      const report = yearReport(ledger(V1_EXAMPLE_YEAR))

      const sum = (items: readonly { amount: number }[]) => items.reduce((total, item) => total + item.amount, 0)
      expect(sum(report.incomeItems)).toBe(report.totals.income)
      expect(sum(report.expenseItems)).toBe(report.totals.expense)
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
        { name: '회비(14인)', amount: 1_630_000, count: 10 },
        { name: '행사지원금', amount: 145_050, count: 2 },
        { name: '예금이자', amount: 2_153, count: 2 },
      ])
      // 대관료(1월)와 행사비(11월)는 400,000 으로 같아 그해 먼저 나온 대관료가 앞
      expect(report.expenseItems).toEqual([
        { name: '야유회', amount: 627_230, count: 1 },
        { name: '송년회', amount: 410_600, count: 1 },
        { name: '대관료', amount: 400_000, count: 10 },
        { name: '행사비', amount: 400_000, count: 1 },
        { name: '간식비', amount: 60_240, count: 2 },
        { name: '간식비(2건)', amount: 58_280, count: 1 },
        { name: '간식비(8월)', amount: 38_430, count: 1 },
      ])
      expect(rightSide(report.expenseRows).slice(0, 3)).toEqual([
        '7월|대관료|40000',
        '  |간식비(8월)|38430',
        '  |간식비(2건)|58280',
      ])
    })
  })

  describe('지출내역 표 (AC-4)', () => {
    it('1월↔7월 … 6월↔12월 짝마다 높이를 맞춘다: 1월 2줄·7월 3줄이면 짝 높이 3, 1월 달 칸이 3줄을 합치고 왼쪽 세 번째 줄은 내용이 없다', () => {
      const report = yearReport(
        ledger([
          [1, 'expense', '대관료', 40_000],
          [1, 'expense', '간식비', 28_340],
          [7, 'expense', '대관료', 40_000],
          [7, 'expense', '간식비(8월)', 38_430],
          [7, 'expense', '간식비(2건)', 58_280],
        ]),
      )

      const firstPair = report.expenseRows.slice(0, 3)
      expect(firstPair[0].left).toEqual({ month: 1, monthRowSpan: 3, item: { name: '대관료', amount: 40_000 } })
      expect(firstPair[0].right.monthRowSpan).toBe(3)
      expect(firstPair[2].left).toEqual({ month: 1, monthRowSpan: 0, item: null })
      expect(firstPair[2].right.item).toEqual({ name: '간식비(2건)', amount: 58_280 })
      // 나머지 지출 없는 짝 5개는 1줄씩
      expect(report.expenseRows).toHaveLength(3 + 5)
    })

    it('달별 지출 기록을 입력 순으로 넣고, 전체 행 수는 짝 높이의 합이며 좌우 행 수가 같다', () => {
      const report = yearReport(ledger(V1_EXAMPLE_YEAR))

      // 짝 높이: (1,7)=3 (2,8)=2 (3,9)=1 (4,10)=2 (5,11)=1 (6,12)=2
      expect(report.expenseRows).toHaveLength(11)
      expect(leftSide(report.expenseRows)).toEqual([
        '1월|대관료|40000',
        '  |간식비|28340',
        '  ||',
        '2월|대관료|40000',
        '  |간식비|31900',
        '3월|대관료|40000',
        '4월|대관료|40000',
        '  ||',
        '5월|대관료|40000',
        '6월||',
        '  ||',
      ])
      expect(rightSide(report.expenseRows)).toEqual([
        '7월|대관료|40000',
        '  |간식비(8월)|38430',
        '  |간식비(2건)|58280',
        '8월|대관료|40000',
        '  ||',
        '9월|대관료|40000',
        '10월|대관료|40000',
        '  |야유회|627230',
        '11월|행사비|400000',
        '12월|대관료|40000',
        '  |송년회|410600',
      ])
    })

    it('달 칸은 짝의 첫 줄에만 있고 짝 높이만큼 세로로 합쳐, 월이 바뀔 때만 가로 경계가 생긴다', () => {
      const report = yearReport(ledger(V1_EXAMPLE_YEAR))

      const pairSpans = [3, 0, 0, 2, 0, 1, 2, 0, 1, 2, 0]
      expect(report.expenseRows.map((row) => row.left.monthRowSpan)).toEqual(pairSpans)
      expect(report.expenseRows.map((row) => row.right.monthRowSpan)).toEqual(pairSpans)
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

    it('달별 지출은 장부와 같은 날짜순이다 (같은 날은 적은 순, 날짜 없는 예전 기록은 맨 뒤, 날짜 칸은 없다)', () => {
      const report = yearReport(
        withDays(
          ledger([
            [1, 'expense', '옛 기록', 1_000],
            [1, 'expense', '20일', 2_000],
            [1, 'expense', '3일', 3_000],
          ]),
          [undefined, 20, 3],
        ),
      )

      expect(leftSide(report.expenseRows).slice(0, 3)).toEqual(['1월|3일|3000', '  |20일|2000', '  |옛 기록|1000'])
    })

    it('지출이 1~6월에만 있어도 좌우 행 수가 같고, 짝의 오른쪽 달을 빈 줄로 채운다', () => {
      const report = yearReport(
        ledger([
          [1, 'expense', '대관료', 40_000],
          [1, 'expense', '간식비', 28_340],
          [1, 'expense', '현수막', 15_000],
          [2, 'expense', '대관료', 40_000],
        ]),
      )

      // 짝 높이: (1,7)=3, 나머지 5짝 1줄씩
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
      expect(rightSide(report.expenseRows)).toEqual(['7월||', '  ||', '  ||', '8월||', '9월||', '10월||', '11월||', '12월||'])
    })
  })

  describe('경계', () => {
    it('기록이 없는 장부는 모든 달이 0 이고, 지출표는 달마다 빈 한 줄씩 6줄, 항목별 합계는 비어 있고 잔액은 이월금이다', () => {
      const report = yearReport(ledger([]))

      expect(report.months.every((month) => month.income === 0 && month.expense === 0)).toBe(true)
      expect(report.totals).toEqual({ income: 0, expense: 0, balance: 370_482 })
      expect(report.incomeItems).toEqual([])
      expect(report.expenseItems).toEqual([])
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
      expect(leftSide(report.expenseRows)).toEqual(['1월||', '2월||', '3월||', '  ||', '4월||', '5월||', '6월||'])
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

  it('그 달 수입·지출 내역을 이름이 같아도 합치지 않고 담고 각 합계를 낸다 (AC-8)', () => {
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

  it('그 달 수입·지출 내역은 장부와 같은 날짜순이다 (같은 날은 적은 순, 날짜 없는 예전 기록은 맨 뒤) (AC-8)', () => {
    // 9월 기록: 대관료(없음) · 회비(15일) · 간식비(15일) · 간식비(2일)
    const summary = monthSummary(withDays(sample, [1, 1, undefined, 15, 15, 2, 3]), 9)

    expect(summary.expenseEntries.map((entry) => [entry.day, entry.amount])).toEqual([
      [2, 30_000],
      [15, 28_280],
      [undefined, 40_000],
    ])
    expect(summary.incomeEntries.map((entry) => entry.day)).toEqual([15])
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
