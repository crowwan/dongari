import type { CSSProperties } from 'react'
import type { YearReport } from '../../../domain/report'
import { formatAmount } from '../../../ui/money'
import { ExpenseDetailTable } from './ExpenseDetailTable'
import { IncomeExpenseTable } from './IncomeExpenseTable'
import { ItemTotalsTable } from './ItemTotalsTable'
import { sheetPaper } from './sheetStyles'
import { SummaryBox } from './SummaryBox'

// 인라인 hex 이유는 sheetStyles.ts. 글자 크기·여백은 v1 양식 그대로
const styles = {
  paper: sheetPaper,
  section: { marginBottom: '24px' },
  title: { margin: '0 0 12px', textAlign: 'center', fontWeight: 'bold', fontSize: '14px' },
  top: { display: 'flex', gap: '16px' },
  monthTable: { flex: 1 },
  summary: { width: '128px' },
  // 지출내역 표의 합계라 표 바로 아래에 둔다 (v1 은 수입내역 목록 다음이었다, v2.3)
  expenseTotal: { textAlign: 'right', fontSize: '11px', fontWeight: 'bold', marginTop: '8px' },
} satisfies Record<string, CSSProperties>

// 올해 결산 양식 한 장 (v1 연말 양식, PLANS.md 6장. v1 수입내역 목록 자리는 항목별 합계 표, v2.3). 값은 domain/report.ts yearReport 가 다 계산해 온다
export function YearReportSheet({ report }: { report: YearReport }) {
  const { year, clubName, carryover, months, totals, expenseRows, incomeItems, expenseItems } = report
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

      <section style={styles.section}>
        <h2 style={styles.title}>
          &lt;{year}년 {clubName} 지출내역&gt;
        </h2>
        <ExpenseDetailTable rows={expenseRows} />
        <div style={styles.expenseTotal} data-testid="year-expense-total">
          {year}년 지출 합계 ₩{formatAmount(totals.expense)}
        </div>
      </section>

      <section>
        <h2 style={styles.title}>
          &lt;{year}년 {clubName} 항목별 합계&gt;
        </h2>
        <ItemTotalsTable incomeItems={incomeItems} expenseItems={expenseItems} income={totals.income} expense={totals.expense} />
      </section>
    </div>
  )
}
