import type { AccountingData, MonthlyData, ExpenseItem, IncomeItem } from '../types/accounting';

// 지출 상세 항목 합계
export function sumExpenseItems(items: ExpenseItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

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

// 월별 지출 상세 합계와 지출 총액 일치 여부
export function isExpenseMatched(monthData: MonthlyData): boolean {
  const itemsSum = sumExpenseItems(monthData.expenseItems);
  return itemsSum === monthData.expense;
}

// 수입 내역 합계와 월별 수입 합계 일치 여부
export function isIncomeMatched(data: AccountingData): boolean {
  const incomeItemsSum = sumIncomeItems(data.incomeItems);
  const monthlyIncomeSum = sumYearlyIncome(data.monthlyData);
  return incomeItemsSum === monthlyIncomeSum;
}
