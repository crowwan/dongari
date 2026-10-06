import type { CSSProperties } from 'react'
import type { YearReport } from '../../../domain/report'
import { formatAmount } from '../../../ui/money'
import { ExpenseDetailTable } from './ExpenseDetailTable'
import { IncomeExpenseTable } from './IncomeExpenseTable'
import { SHEET_COLOR, SHEET_LINE, SHEET_WIDTH } from './sheetStyles'
import { SummaryBox } from './SummaryBox'

// 인라인 hex 이유는 sheetStyles.ts. 글자 크기·여백은 v1 양식 그대로
const styles = {
  paper: {
    boxSizing: 'border-box',
    width: `${SHEET_WIDTH}px`,
    padding: '16px',
    backgroundColor: SHEET_COLOR.paper,
    color: SHEET_COLOR.ink,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    lineHeight: 1.5,
    letterSpacing: 'normal',
  },
  section: { marginBottom: '24px' },
  title: { margin: '0 0 12px', textAlign: 'center', fontWeight: 'bold', fontSize: '14px' },
  top: { display: 'flex', gap: '16px' },
  monthTable: { flex: 1 },
  summary: { width: '128px' },
  incomeSection: { fontSize: '11px', marginTop: '16px' },
  incomeTitle: { fontWeight: 'bold', marginBottom: '4px' },
  incomeList: { paddingLeft: '16px' },
  incomeItem: { display: 'flex', justifyContent: 'space-between', maxWidth: '192px' },
  incomeTotal: {
    borderTop: SHEET_LINE,
    marginTop: '4px',
    paddingTop: '4px',
    display: 'flex',
    justifyContent: 'flex-end',
    maxWidth: '192px',
    fontWeight: 'bold',
  },
  expenseTotal: { textAlign: 'right', fontSize: '11px', fontWeight: 'bold', marginTop: '16px' },
} satisfies Record<string, CSSProperties>

// 올해 결산 양식 한 장 (v1 연말 양식, PLANS.md 6장). 값은 domain/report.ts yearReport 가 다 계산해 온다
export function YearReportSheet({ report }: { report: YearReport }) {
  const { year, clubName, carryover, months, totals, expenseRows, incomeItems } = report
  return (
    <div style={styles.paper} data-testid="year-report-sheet">
      <section style={styles.section}>
        <h2 style={styles.title}>
          &lt;{year}년 {clubName} 수입 지출 내역&gt;
        </h2>
        <div style={styles.top}>
          <div style={styles.monthTable}>
            <IncomeExpenseTable months={months} totals={totals} />
          </div>
          <div style={styles.summary}>
            <SummaryBox year={year} carryover={carryover} totals={totals} />
          </div>
        </div>
      </section>

      <section>
        <h2 style={styles.title}>
          &lt;{year}년 {clubName} 지출내역&gt;
        </h2>
        <ExpenseDetailTable rows={expenseRows} />

        <div style={styles.incomeSection} data-testid="year-income-items">
          <div style={styles.incomeTitle}>◈ 수입내역</div>
          <div style={styles.incomeList}>
            {incomeItems.map((item) => (
              <div key={item.name} style={styles.incomeItem} data-testid="year-income-item">
                <span>{item.name}</span>
                <span>{formatAmount(item.amount)}</span>
              </div>
            ))}
            <div style={styles.incomeTotal} data-testid="year-income-total">
              <span>₩ {formatAmount(totals.income)}</span>
            </div>
          </div>
        </div>

        <div style={styles.expenseTotal} data-testid="year-expense-total">
          {year}년 지출 합계 ₩{formatAmount(totals.expense)}
        </div>
      </section>
    </div>
  )
}
