import type { CSSProperties } from 'react'
import type { LedgerTotals } from '../../../domain/ledger'
import { formatAmount } from '../../../ui/money'

// 인라인 스타일 이유는 sheetStyles.ts
const styles = {
  box: { fontSize: '12px' },
  year: { fontWeight: 'bold' },
  nextYear: { fontWeight: 'bold', marginTop: '8px' },
  item: { paddingLeft: '8px' },
  balance: { paddingLeft: '8px', fontWeight: 'bold' },
} satisfies Record<string, CSSProperties>

type SummaryBoxProps = {
  year: number
  carryover: number
  totals: LedgerTotals
}

// 양식 위쪽 오른쪽: 작년 이월금, 올해 수입·지출·잔액
export function SummaryBox({ year, carryover, totals }: SummaryBoxProps) {
  return (
    <div style={styles.box} data-testid="year-summary-box">
      <div style={styles.year}>{year - 1}년</div>
      <div style={styles.item}>이월금 ₩ {formatAmount(carryover)}</div>
      <div style={styles.nextYear}>{year}년</div>
      <div style={styles.item}>수 입 ₩ {formatAmount(totals.income)}</div>
      <div style={styles.item}>지 출 ₩ {formatAmount(totals.expense)}</div>
      <div style={styles.balance}>잔 액 ₩ {formatAmount(totals.balance)}</div>
    </div>
  )
}
