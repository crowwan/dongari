import type { AccountingData } from '../../types/accounting';
import { formatNumber } from '../../utils/formatters';
import { sumYearlyIncome, sumYearlyExpense, calculateBalance } from '../../utils/calculations';

interface SummaryBoxProps {
  data: AccountingData;
}

export function SummaryBox({ data }: SummaryBoxProps) {
  const { basicInfo } = data;
  const totalIncome = sumYearlyIncome(data.monthlyData);
  const totalExpense = sumYearlyExpense(data.monthlyData);
  const balance = calculateBalance(data);

  return (
    <div className="text-sm space-y-1">
      <div className="font-bold">{basicInfo.year - 1}년</div>
      <div className="pl-2">이월금 ₩ {formatNumber(basicInfo.carryover)}</div>
      <div className="font-bold mt-2">{basicInfo.year}년</div>
      <div className="pl-2">수 입 ₩ {formatNumber(totalIncome)}</div>
      <div className="pl-2">지 출 ₩ {formatNumber(totalExpense)}</div>
      <div className="pl-2 font-bold">잔 액 ₩ {formatNumber(balance)}</div>
    </div>
  );
}
