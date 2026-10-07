import { monthGroup, type LedgerTotals, type MonthGroup } from '../../domain/ledger'
import { itemIcon } from '../../domain/itemIcon'
import type { EntryType, Ledger } from '../../domain/types'
import { AmountText } from '../../ui/AmountText'
import { BalanceCard } from '../../ui/BalanceCard'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { BottomSheet } from '../../ui/BottomSheet'
import { IconButton } from '../../ui/IconButton'
import { ListRow } from '../../ui/ListRow'
import { formatAmount } from '../../ui/money'
import { MonthPicker } from '../../ui/MonthPicker'
import { MonthStepper } from '../../ui/MonthStepper'
import { BACKUP_DOT_LABEL } from '../backup/backupReminder'
import type { SheetHistory } from '../useScreenHistory'
import './ledger.css'

// 장부 화면의 선택 창 이름
const MONTH_SHEET = 'ledger-month'

// 줄 보조 줄: 색만으로 구분하지 않게 수입/지출을 글자로도
const TYPE_LABEL: Record<EntryType, string> = { income: '수입', expense: '지출' }

type LedgerScreenProps = {
  year: number
  ledger: Ledger
  totals: LedgerTotals
  // 보고 있는 달 (1~12). 다른 화면에 다녀와도 그대로이도록 App 이 들고 있다
  month: number
  // 이번 달 (달 선택 창에 테두리). 올해 장부가 아니면 없다
  currentMonth?: number
  onChangeMonth: (month: number) => void
  // 달 선택 창을 여닫는 방문 기록 (안드로이드 뒤로 버튼으로 창만 닫히게)
  sheets: SheetHistory
  onOpenMonthSummary: (month: number) => void
  onOpenYearSummary: () => void
  onOpenSettings: () => void
  // 백업이 필요하면 [설정] 에 점 표시 (SPEC-002 30일 백업 안내)
  settingsNeedsBackup?: boolean
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

// 장부 첫 화면 (SPEC-001): 위쪽 이름·연도와 [결산][설정] → 잔액 카드 → ‹ N월 ▾ › → 그 달 카드 → 아래 고정 [+ 내역 적기]
export function LedgerScreen({
  year,
  ledger,
  totals,
  month,
  currentMonth,
  onChangeMonth,
  sheets,
  onOpenMonthSummary,
  onOpenYearSummary,
  onOpenSettings,
  settingsNeedsBackup = false,
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
          <IconButton icon="chart" onClick={onOpenYearSummary}>
            결산
          </IconButton>
          <IconButton
            icon="settings"
            onClick={onOpenSettings}
            dotLabel={settingsNeedsBackup ? BACKUP_DOT_LABEL : undefined}
          >
            설정
          </IconButton>
        </div>
      </header>

      <BalanceCard label="지금 잔액" amount={totals.balance} note={carryoverNote(ledger.carryover)} />

      <div className="ledger__month-group">
        <MonthStepper
          month={month}
          onPrevious={() => onChangeMonth(month - 1)}
          onNext={() => onChangeMonth(month + 1)}
          previousDisabled={month === 1}
          nextDisabled={month === 12}
          onPickMonth={() => sheets.openSheet(MONTH_SHEET)}
        />

        <MonthCard
          group={monthGroup(ledger.entries, month)}
          onEditEntry={onEditEntry}
          onOpenMonthSummary={onOpenMonthSummary}
        />
      </div>

      <BottomActionBar icon="plus" label="내역 적기" onClick={() => onAddEntry?.(month)} />

      <BottomSheet open={sheets.sheet === MONTH_SHEET} title="몇 월을 볼까요?" onClose={sheets.closeSheet}>
        <MonthPicker
          value={month}
          currentMonth={currentMonth}
          onChange={(picked) => {
            onChangeMonth(picked)
            sheets.closeSheet()
          }}
        />
      </BottomSheet>
    </div>
  )
}

type MonthCardProps = {
  group: MonthGroup
  onEditEntry?: (id: string) => void
  onOpenMonthSummary: (month: number) => void
}

// 그 달 카드: 수입·지출 소계 두 칸 → 기록 줄(입력 순, 원형 아이콘) → [N월 정리 보기]. 기록이 없으면 안내 한 줄만
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
          <div className="ledger__rows">
            {group.entries.map((entry) => (
              <ListRow
                key={entry.id}
                icon={itemIcon(entry.name)}
                tone={entry.type === 'income' ? 'income' : 'neutral'}
                title={entry.name}
                description={TYPE_LABEL[entry.type]}
                end={<AmountText type={entry.type} amount={entry.amount} />}
                onClick={() => onEditEntry?.(entry.id)}
              />
            ))}
          </div>
          <div className="ledger__month-action">
            <IconButton icon="receipt" variant="fill" onClick={() => onOpenMonthSummary(month)}>
              {`${month}월 정리 보기`}
            </IconButton>
          </div>
        </>
      )}
    </section>
  )
}
