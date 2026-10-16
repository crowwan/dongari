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
  // 화면 읽기에만 들리는 글자 (보이는 양식·사진은 v1 그대로 빈 칸). html2canvas 는 투명한 글자를 그리지 않는다
  readerOnly: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', opacity: 0, whiteSpace: 'nowrap' },
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
          {/* 왼쪽 위 빈 머리 칸: 달 칸의 이름 "월" (SPEC-003 v2.6 AC-18, 접근성 점검 03 axe 지적) */}
          <th style={styles.headCell}>
            <span style={styles.readerOnly}>월</span>
          </th>
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
