import { monthGroup, type LedgerTotals, type MonthGroup } from '../../domain/ledger'
import type { Ledger } from '../../domain/types'
import { AmountText } from '../../ui/AmountText'
import { BalanceCard } from '../../ui/BalanceCard'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { Button } from '../../ui/Button'
import { formatAmount } from '../../ui/money'
import { MonthStepper } from '../../ui/MonthStepper'
import { TopTextButton } from '../../ui/TopTextButton'
import './ledger.css'

type LedgerScreenProps = {
  year: number
  ledger: Ledger
  totals: LedgerTotals
  // 보고 있는 달 (1~12). 다른 화면에 다녀와도 그대로이도록 App 이 들고 있다
  month: number
  onChangeMonth: (month: number) => void
  onOpenMonthSummary: (month: number) => void
  onOpenYearSummary: () => void
  onOpenSettings: () => void
  // [+ 내역 적기] → 보고 있는 달로 입력 화면을 연다 (#13)
  onAddEntry?: (month: number) => void
  // 기록 한 줄 → 그 기록의 고치기 화면을 연다 (#14)
  onEditEntry?: (id: string) => void
}

// 잔액 카드 보조 줄: 작년 이월금이 잔액에 들어 있다는 것. 적자면 빼기표 대신 "적자", 0원이면 숨긴다
function carryoverNote(carryover: number): string | undefined {
  if (carryover > 0) return `작년 이월 ${formatAmount(carryover)}원 포함`
  if (carryover < 0) return `작년 적자 ${formatAmount(-carryover)}원 포함`
  return undefined
}

// 장부 첫 화면 (SPEC-001): 위쪽 이름·연도와 글자 버튼 → 잔액 카드 → ‹ N월 › → 그 달 카드 → 아래 고정 [+ 내역 적기]
export function LedgerScreen({
  year,
  ledger,
  totals,
  month,
  onChangeMonth,
  onOpenMonthSummary,
  onOpenYearSummary,
  onOpenSettings,
  onAddEntry,
  onEditEntry,
}: LedgerScreenProps) {
  return (
    <div className="screen ledger" data-testid="ledger-screen">
      <header className="ledger__top">
        <div className="ledger__title">
          <h1 className="ledger__club">{ledger.clubName}</h1>
          <p className="ledger__year" data-testid="ledger-year">
            {year}년
          </p>
        </div>
        <div className="ledger__top-actions">
          <TopTextButton onClick={onOpenYearSummary}>올해 결산</TopTextButton>
          <TopTextButton onClick={onOpenSettings}>설정</TopTextButton>
        </div>
      </header>

      <BalanceCard label="지금 잔액" amount={totals.balance} note={carryoverNote(ledger.carryover)} />

      <MonthStepper
        month={month}
        onPrevious={() => onChangeMonth(month - 1)}
        onNext={() => onChangeMonth(month + 1)}
        previousDisabled={month === 1}
        nextDisabled={month === 12}
      />

      <MonthCard
        group={monthGroup(ledger.entries, month)}
        onEditEntry={onEditEntry}
        onOpenMonthSummary={onOpenMonthSummary}
      />

      <BottomActionBar label="+ 내역 적기" onClick={() => onAddEntry?.(month)} />
    </div>
  )
}

type MonthCardProps = {
  group: MonthGroup
  onEditEntry?: (id: string) => void
  onOpenMonthSummary: (month: number) => void
}

// 그 달 카드: 수입·지출 소계 두 칸 → 기록 줄(입력 순) → [N월 정리 보기]. 기록이 없으면 안내 한 줄만
function MonthCard({ group, onEditEntry, onOpenMonthSummary }: MonthCardProps) {
  const { month } = group

  return (
    <section className="ledger__month" data-testid="month-card" data-month={month} aria-label={`${month}월 내역`}>
      {group.entries.length === 0 ? (
        <p className="ledger__empty">{month}월에 적은 내역이 없어요. 아래 [+ 내역 적기] 로 적어 보세요</p>
      ) : (
        <>
          <dl className="ledger__subtotals" data-testid="month-subtotal">
            <div className="ledger__subtotal">
              <dt>수입</dt>
              <dd className="ledger__subtotal-value" data-kind="income">
                {formatAmount(group.income)}원
              </dd>
            </div>
            <div className="ledger__subtotal">
              <dt>지출</dt>
              <dd className="ledger__subtotal-value" data-kind="expense">
                {formatAmount(group.expense)}원
              </dd>
            </div>
          </dl>
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
              <span className="ledger__row-amount">
                <AmountText type={entry.type} amount={entry.amount} />
              </span>
            </button>
          ))}
          <div className="ledger__month-action">
            <Button variant="secondary" onClick={() => onOpenMonthSummary(month)}>
              {month}월 정리 보기
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
