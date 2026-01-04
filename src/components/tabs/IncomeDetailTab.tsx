import type { IncomeItem, MonthlyData } from '../../types/accounting';
import { ItemList } from '../common/ItemList';
import { formatNumber } from '../../utils/formatters';
import { sumIncomeItems, sumYearlyIncome } from '../../utils/calculations';

interface IncomeDetailTabProps {
  incomeItems: IncomeItem[];
  monthlyData: MonthlyData[];
  onAdd: (item: Omit<IncomeItem, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<Omit<IncomeItem, 'id'>>) => void;
  onRemove: (id: string) => void;
}

export function IncomeDetailTab({
  incomeItems,
  monthlyData,
  onAdd,
  onUpdate,
  onRemove,
}: IncomeDetailTabProps) {
  const incomeItemsSum = sumIncomeItems(incomeItems);
  const monthlyIncomeSum = sumYearlyIncome(monthlyData);
  const difference = incomeItemsSum - monthlyIncomeSum;
  const isMatched = difference === 0;

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">수입 내역</h2>

      <ItemList
        items={incomeItems}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />

      <div className="border-t border-gray-200 pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">수입내역 합계</span>
          <span className="font-medium">{formatNumber(incomeItemsSum)}원</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">월별 수입 합계</span>
          <span className="font-medium">{formatNumber(monthlyIncomeSum)}원</span>
        </div>
        <div className={`flex justify-between text-sm font-medium ${isMatched ? 'text-green-600' : 'text-red-600'}`}>
          <span>차이</span>
          <span>
            {isMatched ? '✓ 일치' : `${formatNumber(difference)}원`}
          </span>
        </div>
      </div>
    </div>
  );
}
