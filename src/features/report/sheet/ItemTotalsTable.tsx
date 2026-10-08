import type { CSSProperties } from 'react'
import type { ItemTotal } from '../../../domain/report'
import { formatAmount } from '../../../ui/money'
import { SHEET_COLOR, sheetCell, sheetHeadCell, sheetTable } from './sheetStyles'

// 금액 칸 폭: "999,999,999" 까지 한 줄. 남은 폭은 수입·지출 이름 칸이 반씩 (한쪽 긴 이름이 다른 쪽 이름 칸을 줄이지 않게)
const AMOUNT_WIDTH = '76px'

// 인라인 hex 이유는 sheetStyles.ts. 선·머리 칸은 위쪽 월별 수입·지출 표(IncomeExpenseTable)와 같다
const styles = {
  table: { ...sheetTable, fontSize: '12px', tableLayout: 'fixed' },
  headCell: { ...sheetHeadCell, padding: '4px 8px' },
  // 360px 양식 폭 안에서 긴 이름은 낱말 단위로 줄을 바꾸고, 띄어쓰기 없이 길면 아무 데서나 끊는다
  nameCell: { ...sheetCell, padding: '4px 6px', wordBreak: 'keep-all', overflowWrap: 'anywhere' },
  amountCell: { ...sheetCell, padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' },
  totalRow: { backgroundColor: SHEET_COLOR.headFill, fontWeight: 'bold' },
} satisfies Record<string, CSSProperties>

type ItemTotalsTableProps = {
  incomeItems: ItemTotal[]
  expenseItems: ItemTotal[]
  income: number
  expense: number
}

// 한쪽(수입 / 지출)의 이름·금액 두 칸. 그쪽 항목이 모자란 줄은 빈 칸
function SideCells({ item }: { item: ItemTotal | undefined }) {
  return (
    <>
      <td style={styles.nameCell}>{item?.name}</td>
      <td style={styles.amountCell}>{item && formatAmount(item.amount)}</td>
    </>
  )
}

// 양식 맨 아래 항목별 합계 표 (v2.3, v1 "◈ 수입내역" 목록 자리): 줄마다 왼쪽 수입·오른쪽 지출 항목, 맨 아래 계
export function ItemTotalsTable({ incomeItems, expenseItems, income, expense }: ItemTotalsTableProps) {
  const rowCount = Math.max(incomeItems.length, expenseItems.length)
  return (
    <table style={styles.table} data-testid="year-item-table">
      <colgroup>
        <col />
        <col style={{ width: AMOUNT_WIDTH }} />
        <col />
        <col style={{ width: AMOUNT_WIDTH }} />
      </colgroup>
      <thead>
        <tr>
          <th style={styles.headCell} colSpan={2}>
            수 입
          </th>
          <th style={styles.headCell} colSpan={2}>
            지 출
          </th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }, (_, index) => (
          <tr key={index}>
            <SideCells item={incomeItems[index]} />
            <SideCells item={expenseItems[index]} />
          </tr>
        ))}
        <tr style={styles.totalRow}>
          <td style={styles.nameCell}>계</td>
          <td style={styles.amountCell}>{formatAmount(income)}</td>
          <td style={styles.nameCell}>계</td>
          <td style={styles.amountCell}>{formatAmount(expense)}</td>
        </tr>
      </tbody>
    </table>
  )
}
