import { useState } from 'react';
import type { MonthlyData, ExpenseItem } from '../../types/accounting';
import { NumberInput } from '../common/NumberInput';
import { ItemList } from '../common/ItemList';
import { formatNumber } from '../../utils/formatters';

interface MonthlyInputTabProps {
  monthlyData: MonthlyData[];
  onUpdateMonth: (month: number, updates: Partial<Omit<MonthlyData, 'month' | 'expenseItems'>>) => void;
  onAddExpenseItem: (month: number, item: Omit<ExpenseItem, 'id'>) => void;
  onUpdateExpenseItem: (month: number, itemId: string, updates: Partial<Omit<ExpenseItem, 'id'>>) => void;
  onRemoveExpenseItem: (month: number, itemId: string) => void;
}

export function MonthlyInputTab({
  monthlyData,
  onUpdateMonth,
  onAddExpenseItem,
  onUpdateExpenseItem,
  onRemoveExpenseItem,
}: MonthlyInputTabProps) {
  const [expandedMonth, setExpandedMonth] = useState<number | null>(1);

  const toggleMonth = (month: number) => {
    setExpandedMonth(expandedMonth === month ? null : month);
  };

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-semibold text-gray-800">월별 수입/지출</h2>

      {monthlyData.map(month => {
        const isExpanded = expandedMonth === month.month;

        return (
          <div
            key={month.month}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            {/* 월 헤더 */}
            <button
              onClick={() => toggleMonth(month.month)}
              className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <span className="font-medium">{month.month}월</span>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>수입: {formatNumber(month.income)}</span>
                <span>지출: {formatNumber(month.expense)}</span>
                <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
              </div>
            </button>

            {/* 펼쳐진 내용 */}
            {isExpanded && (
              <div className="p-4 space-y-4 bg-white">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      수입
                    </label>
                    <NumberInput
                      value={month.income}
                      onChange={income => onUpdateMonth(month.month, { income })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      지출 (자동계산)
                    </label>
                    <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-right text-gray-600">
                      {formatNumber(month.expense)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    지출 상세
                  </label>
                  <ItemList
                    items={month.expenseItems}
                    onAdd={item => onAddExpenseItem(month.month, item)}
                    onUpdate={(id, updates) => onUpdateExpenseItem(month.month, id, updates)}
                    onRemove={id => onRemoveExpenseItem(month.month, id)}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
