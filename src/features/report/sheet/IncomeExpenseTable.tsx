import type { CSSProperties } from 'react'
import type { LedgerTotals } from '../../../domain/ledger'
import type { MonthTotal } from '../../../domain/report'
import { formatAmount } from '../../../ui/money'
import { SHEET_COLOR, sheetCell, sheetHeadCell, sheetTable } from './sheetStyles'

// 인라인 hex 이유는 sheetStyles.ts
const styles = {
  table: { ...sheetTable, fontSize: '12px' },
  headCell: { ...sheetHeadCell, padding: '4px 8px' },
  monthCell: {
    ...sheetCell,
    padding: '4px 8px',
    textAlign: 'center',
    // "10월" 이 두 줄로 꺾이지 않게
    whiteSpace: 'nowrap',
    backgroundColor: SHEET_COLOR.monthFill,
    width: '48px',
  },
  amountCell: { ...sheetCell, padding: '4px 8px', textAlign: 'right' },
  totalRow: { backgroundColor: SHEET_COLOR.headFill, fontWeight: 'bold' },
} satisfies Record<string, CSSProperties>

type IncomeExpenseTableProps = {
  months: MonthTotal[]
  totals: LedgerTotals
}

// 양식 위쪽 왼쪽: 1~12월 수입·지출과 계
export function IncomeExpenseTable({ months, totals }: IncomeExpenseTableProps) {
  return (
    <table style={styles.table} data-testid="year-month-table">
      <thead>
        <tr>
          <th style={styles.headCell}></th>
          <th style={styles.headCell}>수 입</th>
          <th style={styles.headCell}>지 출</th>
        </tr>
      </thead>
      <tbody>
        {months.map(({ month, income, expense }) => (
          <tr key={month}>
            <td style={styles.monthCell}>{month}월</td>
            <td style={styles.amountCell}>{formatAmount(income)}</td>
            <td style={styles.amountCell}>{formatAmount(expense)}</td>
          </tr>
        ))}
        <tr style={styles.totalRow}>
          <td style={{ ...styles.monthCell, backgroundColor: SHEET_COLOR.headFill }}>계</td>
          <td style={styles.amountCell}>{formatAmount(totals.income)}</td>
          <td style={styles.amountCell}>{formatAmount(totals.expense)}</td>
        </tr>
      </tbody>
    </table>
  )
}
