// 기본 정보
export interface BasicInfo {
  year: number;
  clubName: string;
  carryover: number; // 전년도 이월금
}

// 지출 상세 항목
export interface ExpenseItem {
  id: string;
  name: string;
  amount: number;
}

// 월별 데이터
export interface MonthlyData {
  month: number; // 1~12
  income: number;
  expense: number;
  expenseItems: ExpenseItem[];
}

// 수입 내역 항목
export interface IncomeItem {
  id: string;
  name: string;
  amount: number;
}

// 전체 데이터
export interface AccountingData {
  basicInfo: BasicInfo;
  monthlyData: MonthlyData[];
  incomeItems: IncomeItem[];
  lastUpdated: string;
}

// 탭 타입
export type TabType = 'basic' | 'monthly' | 'income' | 'preview';
