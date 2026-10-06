import type { CSSProperties } from 'react'
import type { ExpenseTableCell, ExpenseTableRow } from '../../../domain/report'
import { formatAmount } from '../../../ui/money'
import { SHEET_COLOR, SHEET_LINE, sheetCell, sheetHeadCell, sheetTable } from './sheetStyles'

// 인라인 hex 이유는 sheetStyles.ts
const styles = {
  table: { ...sheetTable, fontSize: '11px' },
  headCell: { ...sheetHeadCell, padding: '2px 4px' },
  monthHeadCell: { ...sheetHeadCell, padding: '2px 4px', width: '32px' },
  amountHeadCell: { ...sheetHeadCell, padding: '2px 4px', width: '64px' },
  monthCell: {
    ...sheetCell,
    padding: '2px 4px',
    textAlign: 'center',
    // "10월" 이 두 줄로 꺾이지 않게
    whiteSpace: 'nowrap',
    backgroundColor: SHEET_COLOR.monthFill,
    width: '32px',
  },
  nameCell: { borderRight: SHEET_LINE, padding: '2px 4px' },
  amountCell: { borderRight: SHEET_LINE, padding: '2px 4px', textAlign: 'right', width: '64px' },
} satisfies Record<string, CSSProperties>

// 같은 달 안에서는 줄 사이 선이 없고, 달이 바뀌는 곳(짝의 마지막 줄 아래)에만 가로 선 (v1 PLANS.md 6.3)
function rowBottom(pairEnd: boolean): CSSProperties {
  return { borderBottom: pairEnd ? SHEET_LINE : 'none' }
}

// 한쪽(왼쪽 1~6월 / 오른쪽 7~12월)의 달·지출내역·금액 칸. 달 칸은 짝 첫 줄에서만 짝 높이만큼 합쳐 그린다
function SideCells({ cell, pairEnd }: { cell: ExpenseTableCell; pairEnd: boolean }) {
  const bottom = rowBottom(pairEnd)
  return (
    <>
      {cell.monthRowSpan > 0 && (
        <td style={styles.monthCell} rowSpan={cell.monthRowSpan} data-testid="year-expense-month">
          {cell.month}월
        </td>
      )}
      <td style={{ ...styles.nameCell, ...bottom }} data-testid="year-expense-name">
        {cell.item?.name}
      </td>
      <td style={{ ...styles.amountCell, ...bottom }}>{cell.item && formatAmount(cell.item.amount)}</td>
    </>
  )
}

// 양식 아래쪽 지출내역 표: 1월↔7월 … 6월↔12월 짝마다 좌우 행 수가 같다 (domain/report.ts expenseRows)
export function ExpenseDetailTable({ rows }: { rows: ExpenseTableRow[] }) {
  return (
    <table style={styles.table} data-testid="year-expense-table">
      <thead>
        <tr>
          <th style={styles.monthHeadCell}>월</th>
          <th style={styles.headCell}>지출내역</th>
          <th style={styles.amountHeadCell}>금액</th>
          <th style={styles.monthHeadCell}>월</th>
          <th style={styles.headCell}>지출내역</th>
          <th style={styles.amountHeadCell}>금액</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          // 다음 줄이 새 짝으로 시작하면(또는 마지막 줄이면) 이 줄이 짝의 끝
          const pairEnd = (rows[index + 1]?.left.monthRowSpan ?? 1) > 0
          return (
            <tr key={index}>
              <SideCells cell={row.left} pairEnd={pairEnd} />
              <SideCells cell={row.right} pairEnd={pairEnd} />
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
