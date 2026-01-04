import type { AccountingData, MonthlyData } from '../types/accounting';

const STORAGE_KEY_PREFIX = 'accounting_';

// 초기 월별 데이터 생성
function createInitialMonthlyData(): MonthlyData[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    expense: 0,
    expenseItems: [],
  }));
}

// 초기 데이터 생성
export function createInitialData(year: number): AccountingData {
  return {
    basicInfo: {
      year,
      clubName: '',
      carryover: 0,
    },
    monthlyData: createInitialMonthlyData(),
    incomeItems: [],
    lastUpdated: new Date().toISOString(),
  };
}

// 저장 키 생성
function getStorageKey(year: number): string {
  return `${STORAGE_KEY_PREFIX}${year}`;
}

// 데이터 저장
export function saveData(data: AccountingData): void {
  const key = getStorageKey(data.basicInfo.year);
  const dataToSave = {
    ...data,
    lastUpdated: new Date().toISOString(),
  };
  localStorage.setItem(key, JSON.stringify(dataToSave));
}

// 데이터 불러오기
export function loadData(year: number): AccountingData | null {
  const key = getStorageKey(year);
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as AccountingData;
  } catch {
    return null;
  }
}

// 저장된 연도 목록 조회
export function getSavedYears(): number[] {
  const years: number[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      const year = parseInt(key.replace(STORAGE_KEY_PREFIX, ''), 10);
      if (!isNaN(year)) {
        years.push(year);
      }
    }
  }
  return years.sort((a, b) => b - a);
}

// 데이터 삭제
export function deleteData(year: number): void {
  const key = getStorageKey(year);
  localStorage.removeItem(key);
}
