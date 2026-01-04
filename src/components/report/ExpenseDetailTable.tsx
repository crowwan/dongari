import type { MonthlyData, IncomeItem } from '../../types/accounting';
import { formatNumber } from '../../utils/formatters';
import { sumIncomeItems, sumYearlyExpense } from '../../utils/calculations';

interface ExpenseDetailTableProps {
  monthlyData: MonthlyData[];
  incomeItems: IncomeItem[];
  year?: number;
}

const styles = {
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '11px',
  },
  headerCell: {
    border: '1px solid #9ca3af',
    padding: '2px 4px',
    backgroundColor: '#f3f4f6',
  },
  monthCell: {
    border: '1px solid #9ca3af',
    padding: '2px 4px',
    textAlign: 'center' as const,
    backgroundColor: '#f9fafb',
    width: '32px',
  },
  nameCell: {
    border: '1px solid #9ca3af',
    padding: '2px 4px',
  },
  amountCell: {
    border: '1px solid #9ca3af',
    padding: '2px 4px',
    textAlign: 'right' as const,
    width: '64px',
  },
  emptyCell: {
    border: '1px solid #9ca3af',
    padding: '2px 4px',
  },
  incomeSection: {
    fontSize: '11px',
    marginTop: '16px',
  },
  incomeTitle: {
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  incomeList: {
    paddingLeft: '16px',
  },
  incomeItem: {
    display: 'flex',
    justifyContent: 'space-between',
    maxWidth: '192px',
  },
  incomeTotal: {
    borderTop: '1px solid #9ca3af',
    marginTop: '4px',
    paddingTop: '4px',
    display: 'flex',
    justifyContent: 'flex-end',
    maxWidth: '192px',
    fontWeight: 'bold',
  },
  expenseTotal: {
    textAlign: 'right' as const,
    fontSize: '11px',
    fontWeight: 'bold',
    marginTop: '16px',
  },
};

export function ExpenseDetailTable({ monthlyData, incomeItems, year }: ExpenseDetailTableProps) {
  const leftMonths = monthlyData.slice(0, 6);
  const rightMonths = monthlyData.slice(6, 12);

  const getMaxRows = (months: MonthlyData[]) => {
    return Math.max(...months.map(m => Math.max(m.expenseItems.length, 1)));
  };

  const leftMaxRows = getMaxRows(leftMonths);
  const rightMaxRows = getMaxRows(rightMonths);
  const maxRows = Math.max(leftMaxRows, rightMaxRows);

  const totalExpense = sumYearlyExpense(monthlyData);
  const totalIncome = sumIncomeItems(incomeItems);
  const displayYear = year || new Date().getFullYear();

  const renderMonthCells = (months: MonthlyData[], rowIdx: number) => {
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
              <td style={styles.monthCell} rowSpan={itemCount}>
                {month.month}
              </td>
            ) : null}
            <td style={styles.nameCell}>{item?.name || ''}</td>
            <td style={styles.amountCell}>{item ? formatNumber(item.amount) : ''}</td>
          </>
        );
      }
      currentRow += itemCount;
    }
    return (
      <>
        <td style={styles.emptyCell}></td>
        <td style={styles.emptyCell}></td>
        <td style={styles.emptyCell}></td>
      </>
    );
  };

  return (
    <div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.headerCell, width: '32px' }}>월</th>
            <th style={styles.headerCell}>지출내역</th>
            <th style={{ ...styles.headerCell, width: '64px' }}>금액</th>
            <th style={{ ...styles.headerCell, width: '32px' }}>월</th>
            <th style={styles.headerCell}>지출내역</th>
            <th style={{ ...styles.headerCell, width: '64px' }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {renderMonthCells(leftMonths, rowIdx)}
              {renderMonthCells(rightMonths, rowIdx)}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={styles.incomeSection}>
        <div style={styles.incomeTitle}>◈ 수입내역</div>
        <div style={styles.incomeList}>
          {incomeItems.map(item => (
            <div key={item.id} style={styles.incomeItem}>
              <span>{item.name}</span>
              <span>{formatNumber(item.amount)}</span>
            </div>
          ))}
          <div style={styles.incomeTotal}>
            <span>₩ {formatNumber(totalIncome)}</span>
          </div>
        </div>
      </div>

      <div style={styles.expenseTotal}>
        {displayYear}년 지출 합계 ₩{formatNumber(totalExpense)}
      </div>
    </div>
  );
}
