import type { MonthlyData } from '../../types/accounting';
import { formatNumber } from '../../utils/formatters';
import { sumYearlyIncome, sumYearlyExpense } from '../../utils/calculations';

interface IncomeExpenseTableProps {
  monthlyData: MonthlyData[];
}

const styles = {
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
  },
  headerCell: {
    border: '1px solid #9ca3af',
    padding: '4px 8px',
    backgroundColor: '#f3f4f6',
  },
  monthCell: {
    border: '1px solid #9ca3af',
    padding: '4px 8px',
    textAlign: 'center' as const,
    backgroundColor: '#f9fafb',
    width: '48px',
  },
  dataCell: {
    border: '1px solid #9ca3af',
    padding: '4px 8px',
    textAlign: 'right' as const,
  },
  totalRow: {
    backgroundColor: '#f3f4f6',
    fontWeight: 'bold',
  },
};

export function IncomeExpenseTable({ monthlyData }: IncomeExpenseTableProps) {
  const totalIncome = sumYearlyIncome(monthlyData);
  const totalExpense = sumYearlyExpense(monthlyData);

  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.headerCell}></th>
          <th style={styles.headerCell}>수 입</th>
          <th style={styles.headerCell}>지 출</th>
        </tr>
      </thead>
      <tbody>
        {monthlyData.map(month => (
          <tr key={month.month}>
            <td style={styles.monthCell}>{month.month}월</td>
            <td style={styles.dataCell}>{formatNumber(month.income)}</td>
            <td style={styles.dataCell}>{formatNumber(month.expense)}</td>
          </tr>
        ))}
        <tr style={styles.totalRow}>
          <td style={{ ...styles.monthCell, fontWeight: 'bold' }}>계</td>
          <td style={{ ...styles.dataCell, fontWeight: 'bold' }}>{formatNumber(totalIncome)}</td>
          <td style={{ ...styles.dataCell, fontWeight: 'bold' }}>{formatNumber(totalExpense)}</td>
        </tr>
      </tbody>
    </table>
  );
}
