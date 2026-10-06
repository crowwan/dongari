// v1 보고서(src/components/report) 전용 계산. #16 에서 보고서를 v2 모델로 옮기면 지운다
import type { AccountingData, MonthlyData, IncomeItem } from '../types/accounting';

// 수입 내역 합계
export function sumIncomeItems(items: IncomeItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

// 연간 수입 합계
export function sumYearlyIncome(monthlyData: MonthlyData[]): number {
  return monthlyData.reduce((sum, month) => sum + month.income, 0);
}

// 연간 지출 합계
export function sumYearlyExpense(monthlyData: MonthlyData[]): number {
  return monthlyData.reduce((sum, month) => sum + month.expense, 0);
}

// 잔액 계산: 전년도 이월금 + 연간 수입 - 연간 지출
export function calculateBalance(data: AccountingData): number {
  const yearlyIncome = sumYearlyIncome(data.monthlyData);
  const yearlyExpense = sumYearlyExpense(data.monthlyData);
  return data.basicInfo.carryover + yearlyIncome - yearlyExpense;
}

