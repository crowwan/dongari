import type { MonthlyData, IncomeItem } from '../../types/accounting';
import { formatNumber } from '../../utils/formatters';
import { sumIncomeItems, sumYearlyExpense } from '../../utils/calculations';

interface ExpenseDetailTableProps {
  monthlyData: MonthlyData[];
  incomeItems: IncomeItem[];
}

export function ExpenseDetailTable({ monthlyData, incomeItems }: ExpenseDetailTableProps) {
  const leftMonths = monthlyData.slice(0, 6);
  const rightMonths = monthlyData.slice(6, 12);

  // 좌우 각 월의 최대 행 수 계산
  const getMaxRows = (months: MonthlyData[]) => {
    return Math.max(...months.map(m => Math.max(m.expenseItems.length, 1)));
  };

  const leftMaxRows = getMaxRows(leftMonths);
  const rightMaxRows = getMaxRows(rightMonths);
  const maxRows = Math.max(leftMaxRows, rightMaxRows);

  const totalExpense = sumYearlyExpense(monthlyData);
  const totalIncome = sumIncomeItems(incomeItems);

  return (
    <div className="space-y-4">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 px-1 py-1 w-8">월</th>
            <th className="border border-gray-400 px-1 py-1">지출내역</th>
            <th className="border border-gray-400 px-1 py-1 w-16">금액</th>
            <th className="border border-gray-400 px-1 py-1 w-8">월</th>
            <th className="border border-gray-400 px-1 py-1">지출내역</th>
            <th className="border border-gray-400 px-1 py-1 w-16">금액</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }).map((_, rowIdx) => {
            // 각 행에서 표시할 월 찾기
            const renderMonthCell = (months: MonthlyData[]) => {
              let currentRow = 0;
              for (const month of months) {
                const itemCount = Math.max(month.expenseItems.length, 1);
                if (rowIdx >= currentRow && rowIdx < currentRow + itemCount) {
                  const itemIdx = rowIdx - currentRow;
                  const item = month.expenseItems[itemIdx];
                  const isFirstRow = itemIdx === 0;

                  return (
                    <>
                      {isFirstRow ? (
                        <td
                          className="border border-gray-400 px-1 py-0.5 text-center bg-gray-50"
                          rowSpan={itemCount}
                        >
                          {month.month}
                        </td>
                      ) : null}
                      <td className="border border-gray-400 px-1 py-0.5">
                        {item?.name || ''}
                      </td>
                      <td className="border border-gray-400 px-1 py-0.5 text-right">
                        {item ? formatNumber(item.amount) : ''}
                      </td>
                    </>
                  );
                }
                currentRow += itemCount;
              }
              // 빈 셀
              return (
                <>
                  <td className="border border-gray-400 px-1 py-0.5"></td>
                  <td className="border border-gray-400 px-1 py-0.5"></td>
                  <td className="border border-gray-400 px-1 py-0.5"></td>
                </>
              );
            };

            return (
              <tr key={rowIdx}>
                {renderMonthCell(leftMonths)}
                {renderMonthCell(rightMonths)}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 수입 내역 */}
      <div className="text-xs">
        <div className="font-bold mb-1">◈ 수입내역</div>
        <div className="pl-4 space-y-0.5">
          {incomeItems.map(item => (
            <div key={item.id} className="flex justify-between max-w-48">
              <span>{item.name}</span>
              <span>{formatNumber(item.amount)}</span>
            </div>
          ))}
          <div className="border-t border-gray-400 mt-1 pt-1 flex justify-end max-w-48">
            <span className="font-bold">₩ {formatNumber(totalIncome)}</span>
          </div>
        </div>
      </div>

      <div className="text-right text-xs font-bold">
        {new Date().getFullYear()}년 지출 합계 ₩{formatNumber(totalExpense)}
      </div>
    </div>
  );
}
