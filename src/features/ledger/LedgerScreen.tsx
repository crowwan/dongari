import { groupByMonth, type LedgerTotals, type MonthGroup } from '../../domain/ledger'
import type { EntryType, Ledger } from '../../domain/types'
import { Button } from '../../ui/Button'
import { formatAmount } from '../../ui/money'
import './ledger.css'

type LedgerScreenProps = {
  year: number
  ledger: Ledger
  totals: LedgerTotals
  // [돈 들어옴]/[돈 나감] → 그 종류의 입력 화면을 연다 (#13)
  onAddEntry?: (type: EntryType) => void
  // 기록 한 줄 → 그 기록의 수정 화면을 연다 (#14)
  onEditEntry?: (id: string) => void
}

const SIGN: Record<EntryType, string> = { income: '+', expense: '−' }

// 장부 첫 화면 (SPEC-001): 잔액 → 큰 버튼 두 개 → 월별 기록 목록(최신 달이 위)
export function LedgerScreen({ year, ledger, totals, onAddEntry, onEditEntry }: LedgerScreenProps) {
  const groups = groupByMonth(ledger.entries)

  return (
    <div className="screen" data-testid="ledger-screen">
      <header className="ledger__summary">
        <h1 className="ledger__club">
          {year}년 {ledger.clubName}
        </h1>
        <p className="ledger__balance-label">지금 남은 돈</p>
        <p className="ledger__balance" data-testid="ledger-balance">
          {formatAmount(totals.balance)}원
        </p>
        <dl className="ledger__sums" data-testid="ledger-sums">
          <div className="ledger__sum">
            <dt>들어온 돈</dt>
            <dd className="ledger__sum-value" data-kind="income">
              {formatAmount(totals.income)}
            </dd>
          </div>
          <div className="ledger__sum">
            <dt>나간 돈</dt>
            <dd className="ledger__sum-value" data-kind="expense">
              {formatAmount(totals.expense)}
            </dd>
          </div>
          <div className="ledger__sum">
            <dt>작년에서 넘어온 돈</dt>
            <dd className="ledger__sum-value">{formatAmount(ledger.carryover)}</dd>
          </div>
        </dl>
      </header>

      <div className="ledger__actions">
        {/* BigActionButton(ADR 003 으로 제거) 대신 임시로 기본 버튼. 아래 고정 [+ 내역 적기] 하나로 #26 에서 교체 */}
        <Button variant="secondary" onClick={() => onAddEntry?.('income')}>
          + 돈 들어옴
        </Button>
        <Button onClick={() => onAddEntry?.('expense')}>− 돈 나감</Button>
      </div>

      {groups.length === 0 ? (
        <p className="ledger__empty">
          아직 적은 내용이 없어요.
          <br />위 버튼으로 시작하세요.
        </p>
      ) : (
        groups.map((group) => <MonthSection key={group.month} group={group} onEditEntry={onEditEntry} />)
      )}
    </div>
  )
}

// 월 소계: 그 달에 있는 쪽만 "들어옴 … · 나감 …"
function subtotalText(group: MonthGroup): string {
  const parts = [
    group.income > 0 ? `들어옴 ${formatAmount(group.income)}` : undefined,
    group.expense > 0 ? `나감 ${formatAmount(group.expense)}` : undefined,
  ]
  return parts.filter((part) => part !== undefined).join(' · ')
}

function MonthSection({ group, onEditEntry }: { group: MonthGroup; onEditEntry?: (id: string) => void }) {
  return (
    <section className="ledger__month" data-testid="month-group" data-month={group.month}>
      <div className="ledger__month-head">
        <h2 className="ledger__month-title">{group.month}월</h2>
        <span className="ledger__month-subtotal" data-testid="month-subtotal">
          {subtotalText(group)}
        </span>
      </div>
      {group.entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className="ledger__row"
          data-testid="entry-row"
          data-kind={entry.type}
          onClick={() => onEditEntry?.(entry.id)}
        >
          <span className="ledger__row-name">{entry.name}</span>
          <span className="ledger__row-amount" data-kind={entry.type}>
            {SIGN[entry.type]}
            {formatAmount(entry.amount)}원
          </span>
        </button>
      ))}
    </section>
  )
}
