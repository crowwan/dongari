import type { CarryoverWords } from '../../domain/book'
import { monthGroup, type LedgerTotals, type MonthGroup } from '../../domain/ledger'
import { itemIcon } from '../../domain/itemIcon'
import type { Entry, EntryType, Ledger } from '../../domain/types'
import { AmountText } from '../../ui/AmountText'
import { BalanceCard } from '../../ui/BalanceCard'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { BottomSheet } from '../../ui/BottomSheet'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { ListRow } from '../../ui/ListRow'
import { formatAmount } from '../../ui/money'
import { MonthPicker } from '../../ui/MonthPicker'
import { MonthStepper } from '../../ui/MonthStepper'
import { BACKUP_DOT_LABEL } from '../backup/backupReminder'
import { BookPicker } from '../books/BookPicker'
import type { SheetHistory } from '../useScreenHistory'
import type { BookChoice } from './useLedger'
import './ledger.css'

// 장부 화면의 선택 창 이름
const MONTH_SHEET = 'ledger-month'
const BOOK_SHEET = 'ledger-books'

// 줄 보조 줄: 색만으로 구분하지 않게 수입/지출을 글자로도
const TYPE_LABEL: Record<EntryType, string> = { income: '수입', expense: '지출' }

// 줄 보조 줄: "7일 · 지출", 날짜 없는 예전 기록은 "지출"만 (AC-9)
function rowDescription({ day, type }: Entry): string {
  return day === undefined ? TYPE_LABEL[type] : `${day}일 · ${TYPE_LABEL[type]}`
}

type LedgerScreenProps = {
  bookName: string // 위쪽 제목 (장부 이름, SPEC-005)
  bookId: string // 지금 장부 (장부 고르기 창의 ✓)
  books: readonly BookChoice[] // 장부 고르기 창 목록 (만든 순)
  carryoverWords: CarryoverWords // 잔액 카드 보조 줄의 이월금 이름 (장부 종류별)
  onPickBook: (id: string) => void // 창에서 장부를 골랐다 (창은 이 화면이 닫는다)
  onNewBook: () => void // 창의 [+ 새 장부 만들기] (창의 방문 기록 칸은 새 장부 만들기 화면이 이어 쓴다)
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

// 잔액 카드 보조 줄: 작년 이월금이 잔액에 들어 있다는 것. 적자면 빼기표 대신 "적자", 0원이면 숨긴다.
// 이름은 장부 종류를 따른다 (동아리 "작년 이월 N원 포함", 가계부 첫 해 "처음 남은 돈 N원 포함", SPEC-005)
function carryoverNote(carryover: number, words: CarryoverWords): string | undefined {
  if (carryover > 0) return `${words.surplus} ${formatAmount(carryover)}원 포함`
  if (carryover < 0) return `${words.deficit} ${formatAmount(-carryover)}원 포함`
  return undefined
}

// 장부 첫 화면 (SPEC-001): 위쪽 이름·연도와 [결산][설정] → 잔액 카드 → ‹ N월 ▾ › → 그 달 카드 → 아래 고정 [+ 내역 적기].
// 위쪽 이름·연도는 한 버튼이라 누르면 장부 고르기 창이 열린다 (SPEC-005 A)
export function LedgerScreen({
  bookName,
  bookId,
  books,
  carryoverWords,
  onPickBook,
  onNewBook,
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
    <div className="screen screen--stack ledger" data-testid="ledger-screen">
      <header className="ledger__top">
        <h1 className="ledger__title">
          <button
            type="button"
            className="ledger__book"
            aria-haspopup="dialog"
            data-testid="book-button"
            onClick={() => sheets.openSheet(BOOK_SHEET)}
          >
            <span className="ledger__book-text">
              <span className="ledger__book-name">{bookName}</span>{' '}
              <span className="ledger__year" data-testid="ledger-year">
                {year}년
              </span>
            </span>
            <Icon name="down" />
            <span className="ui-visually-hidden"> 장부 바꾸기</span>
          </button>
        </h1>
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

      <BalanceCard label="지금 잔액" amount={totals.balance} note={carryoverNote(ledger.carryover, carryoverWords)} />

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

      <BottomSheet open={sheets.sheet === BOOK_SHEET} title="어느 장부를 볼까요?" onClose={sheets.closeSheet}>
        <BookPicker
          books={books}
          currentId={bookId}
          onPick={(picked) => {
            onPickBook(picked)
            sheets.closeSheet()
          }}
          onNew={onNewBook}
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

// 그 달 카드: 수입·지출 소계 두 칸 → 기록 줄(날짜순, 원형 아이콘, 보조 줄 "7일 · 지출") → [N월 정리 보기]. 기록이 없으면 안내 한 줄만
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
                description={rowDescription(entry)}
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
