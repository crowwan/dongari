import type { MonthlyData } from '../../types/accounting';
import { formatNumber } from '../../utils/formatters';
import { sumYearlyIncome, sumYearlyExpense } from '../../utils/calculations';

interface IncomeExpenseTableProps {
  monthlyData: MonthlyData[];
}

export function IncomeExpenseTable({ monthlyData }: IncomeExpenseTableProps) {
  const totalIncome = sumYearlyIncome(monthlyData);
  const totalExpense = sumYearlyExpense(monthlyData);

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-gray-100">
          <th className="border border-gray-400 px-2 py-1 w-12"></th>
          <th className="border border-gray-400 px-2 py-1">수 입</th>
          <th className="border border-gray-400 px-2 py-1">지 출</th>
        </tr>
      </thead>
      <tbody>
        {monthlyData.map(month => (
          <tr key={month.month}>
            <td className="border border-gray-400 px-2 py-1 text-center bg-gray-50">
              {month.month}월
            </td>
            <td className="border border-gray-400 px-2 py-1 text-right">
              {formatNumber(month.income)}
            </td>
            <td className="border border-gray-400 px-2 py-1 text-right">
              {formatNumber(month.expense)}
            </td>
          </tr>
        ))}
        <tr className="bg-gray-100 font-bold">
          <td className="border border-gray-400 px-2 py-1 text-center">계</td>
          <td className="border border-gray-400 px-2 py-1 text-right">
            {formatNumber(totalIncome)}
          </td>
          <td className="border border-gray-400 px-2 py-1 text-right">
            {formatNumber(totalExpense)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
