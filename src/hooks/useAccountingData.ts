import { useState, useEffect, useCallback } from 'react';
import type { AccountingData, BasicInfo, MonthlyData, ExpenseItem, IncomeItem } from '../types/accounting';
import { saveData, loadData, createInitialData } from '../utils/storage';
import { sumExpenseItems } from '../utils/calculations';

// UUID 생성
function generateId(): string {
  return crypto.randomUUID();
}

export function useAccountingData(initialYear?: number) {
  const currentYear = initialYear ?? new Date().getFullYear();
  const [data, setData] = useState<AccountingData>(() => {
    const saved = loadData(currentYear);
    return saved ?? createInitialData(currentYear);
  });

  // 자동 저장
  useEffect(() => {
    saveData(data);
  }, [data]);

  // 연도 변경
  const changeYear = useCallback((year: number) => {
    const saved = loadData(year);
    setData(saved ?? createInitialData(year));
  }, []);

  // 기본 정보 업데이트
  const updateBasicInfo = useCallback((updates: Partial<BasicInfo>) => {
    setData(prev => ({
      ...prev,
      basicInfo: { ...prev.basicInfo, ...updates },
    }));
  }, []);

  // 월별 데이터 업데이트
  const updateMonthlyData = useCallback((month: number, updates: Partial<Omit<MonthlyData, 'month' | 'expenseItems'>>) => {
    setData(prev => ({
      ...prev,
      monthlyData: prev.monthlyData.map(m =>
        m.month === month ? { ...m, ...updates } : m
      ),
    }));
  }, []);

  // 지출 항목 추가
  const addExpenseItem = useCallback((month: number, item: Omit<ExpenseItem, 'id'>) => {
    const newItem: ExpenseItem = { ...item, id: generateId() };
    setData(prev => ({
      ...prev,
      monthlyData: prev.monthlyData.map(m => {
        if (m.month !== month) return m;
        const newItems = [...m.expenseItems, newItem];
        return {
          ...m,
          expenseItems: newItems,
          expense: sumExpenseItems(newItems),
        };
      }),
    }));
  }, []);

  // 지출 항목 수정
  const updateExpenseItem = useCallback((month: number, itemId: string, updates: Partial<Omit<ExpenseItem, 'id'>>) => {
    setData(prev => ({
      ...prev,
      monthlyData: prev.monthlyData.map(m => {
        if (m.month !== month) return m;
        const newItems = m.expenseItems.map(item =>
          item.id === itemId ? { ...item, ...updates } : item
        );
        return {
          ...m,
          expenseItems: newItems,
          expense: sumExpenseItems(newItems),
        };
      }),
    }));
  }, []);

  // 지출 항목 삭제
  const removeExpenseItem = useCallback((month: number, itemId: string) => {
    setData(prev => ({
      ...prev,
      monthlyData: prev.monthlyData.map(m => {
        if (m.month !== month) return m;
        const newItems = m.expenseItems.filter(item => item.id !== itemId);
        return {
          ...m,
          expenseItems: newItems,
          expense: sumExpenseItems(newItems),
        };
      }),
    }));
  }, []);

  // 수입 항목 추가
  const addIncomeItem = useCallback((item: Omit<IncomeItem, 'id'>) => {
    const newItem: IncomeItem = { ...item, id: generateId() };
    setData(prev => ({
      ...prev,
      incomeItems: [...prev.incomeItems, newItem],
    }));
  }, []);

  // 수입 항목 수정
  const updateIncomeItem = useCallback((itemId: string, updates: Partial<Omit<IncomeItem, 'id'>>) => {
    setData(prev => ({
      ...prev,
      incomeItems: prev.incomeItems.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      ),
    }));
  }, []);

  // 수입 항목 삭제
  const removeIncomeItem = useCallback((itemId: string) => {
    setData(prev => ({
      ...prev,
      incomeItems: prev.incomeItems.filter(item => item.id !== itemId),
    }));
  }, []);

  return {
    data,
    changeYear,
    updateBasicInfo,
    updateMonthlyData,
    addExpenseItem,
    updateExpenseItem,
    removeExpenseItem,
    addIncomeItem,
    updateIncomeItem,
    removeIncomeItem,
  };
}
