import { describe, expect, it } from 'vitest'
import type { AccountingData, MonthlyData } from '../types/accounting'
import { calculateBalance } from './calculations'

function month(month: number, income: number, expense: number): MonthlyData {
  return { month, income, expense, expenseItems: [] }
}

describe('calculations', () => {
  it('잔액은 이월금 + 연간 수입 - 연간 지출이다', () => {
    const data: AccountingData = {
      basicInfo: { year: 2026, clubName: '테스트 동아리', carryover: 100_000 },
      monthlyData: [month(1, 50_000, 30_000), month(2, 20_000, 10_000)],
      incomeItems: [],
      lastUpdated: '2026-01-01T00:00:00.000Z',
    }

    expect(calculateBalance(data)).toBe(130_000)
  })
})
