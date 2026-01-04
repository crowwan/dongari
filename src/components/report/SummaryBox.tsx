import type { AccountingData } from '../../types/accounting';
import { formatNumber } from '../../utils/formatters';
import { sumYearlyIncome, sumYearlyExpense, calculateBalance } from '../../utils/calculations';

interface SummaryBoxProps {
  data: AccountingData;
}

const styles = {
  container: {
    fontSize: '12px',
  },
  yearLabel: {
    fontWeight: 'bold',
  },
  item: {
    paddingLeft: '8px',
  },
  balance: {
    paddingLeft: '8px',
    fontWeight: 'bold',
  },
  spacer: {
    marginTop: '8px',
  },
};

export function SummaryBox({ data }: SummaryBoxProps) {
  const { basicInfo } = data;
  const totalIncome = sumYearlyIncome(data.monthlyData);
  const totalExpense = sumYearlyExpense(data.monthlyData);
  const balance = calculateBalance(data);

  return (
    <div style={styles.container}>
      <div style={styles.yearLabel}>{basicInfo.year - 1}년</div>
      <div style={styles.item}>이월금 ₩ {formatNumber(basicInfo.carryover)}</div>
      <div style={{ ...styles.yearLabel, ...styles.spacer }}>{basicInfo.year}년</div>
      <div style={styles.item}>수 입 ₩ {formatNumber(totalIncome)}</div>
      <div style={styles.item}>지 출 ₩ {formatNumber(totalExpense)}</div>
      <div style={styles.balance}>잔 액 ₩ {formatNumber(balance)}</div>
    </div>
  );
}
