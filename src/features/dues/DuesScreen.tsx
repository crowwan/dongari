import { useRef, useState, type Ref } from 'react'
import { duesTable, duesYears, monthlyFeeSource, unassignedDues, type DuesGroup, type DuesTable } from '../../domain/duesTable'
import { splitYearMonth, thisMonthOf } from '../../domain/members'
import type { Book, YearMonth } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { formatAmount } from '../../ui/money'
import { YearStepper } from '../../ui/YearStepper'
import { BackToLedger } from '../BackToLedger'
import { fullMonthText, isRosterPage, ROSTER_PAGE } from '../settings/roster'
import { MemberEditPage, RosterPages, type DuesSettings } from '../settings/RosterPages'
import { MonthlyFeeEdit } from '../settings/SettingsScreen'
import type { SheetHistory } from '../useScreenHistory'
import { AssignPayersPage } from './AssignPayersPage'
import { DuesStrip } from './DuesStrip'
import { rowStatus } from './duesWords'
import { MemberDuesPage } from './MemberDuesPage'
import { UnassignedDuesCard } from './UnassignedDuesCard'
import './dues.css'

// 회비 표 위에 뜨는 화면 (선택 창 칸 하나를 바꿔 끼운다 — 뒤로 버튼은 한 분 보기 → 회비 표 → 장부)
const MEMBER_PAGE = 'dues-member'
const MEMBER_EDIT_PAGE = 'dues-member-edit'
const FEE_PAGE = 'dues-fee'
const ASSIGN_PAGE = 'dues-assign' // 낸 분 붙이기 (7절)

// 요약 알약 (4절): 덜 낸 분 → 다 낸 분 → 쉬는 분
const GROUPS: readonly { group: DuesGroup; label: string }[] = [
  { group: 'behind', label: '덜 낸 분' },
  { group: 'paid', label: '다 낸 분' },
  { group: 'resting', label: '쉬는 분' },
]

type DuesScreenProps = {
  book: Book // 지금 장부 (동아리·모임)
  today: Date // 기준 달(지난달)·올해
  initialYear?: number // 처음 볼 해 (결산에서 오면 그 해). 해 넘기기 범위 밖이면 올해
  ledgerYears: readonly number[] // 장부가 있는 해: 월 회비를 정할 수 있는 해
  settings: DuesSettings // 회원 명단·회원 정보·월 회비 바꾸기 (설정과 같은 동작·알림)
  onRest: (memberId: string, from: YearMonth, until: YearMonth) => void
  onResume: (memberId: string, from: YearMonth) => void
  sheets: SheetHistory
  onBack: () => void
}

// 회비 표 (SPEC-010 4절): [‹ 장부로] → 해 넘기기 [‹] 2026년 회비 [›](장부 연도는 그대로) → 요약 카드(월 회비 [바꾸기], 알약으로 묶음 거르기)
// → 7절 "낸 분을 안 적은 회비" 카드([낸 분 붙이기] → 붙이기 화면) → 사람별 줄(덜 낸 분 먼저). 줄 → 한 분 보기, 이름 [›] → 회원 정보.
// 명단이 비었으면 안내 + [회원 넣기](회원 명단). 회원 명단·월 회비·회원 정보 화면은 설정 것을 그대로 쓰고 [‹ 회비 표] 로 돌아온다
export function DuesScreen({ book, today, initialYear, ledgerYears, settings, onRest, onResume, sheets, onBack }: DuesScreenProps) {
  const years = duesYears(book, today)
  const firstYear = years[0] ?? today.getFullYear()
  const lastYear = years.at(-1) ?? today.getFullYear()
  const [year, setYear] = useState(() =>
    initialYear !== undefined && years.includes(initialYear) ? initialYear : today.getFullYear(),
  )
  const [filter, setFilter] = useState<DuesGroup | null>(null)
  const [memberId, setMemberId] = useState<string>()
  const [feeYear, setFeeYear] = useState<number>()
  const table = duesTable(book, year, today)
  const unassigned = unassignedDues(book)
  const { assign } = settings
  const summaryRef = useRef<HTMLElement>(null)
  const member = book.members?.find((item) => item.id === memberId)
  const openMember = () => sheets.openSheet(MEMBER_PAGE)

  if (isRosterPage(sheets.sheet)) return <RosterPages dues={settings} sheets={sheets} backLabel="회비 표" />
  if (sheets.sheet === ASSIGN_PAGE && assign) {
    return <AssignPayersPage assign={assign} sheets={sheets} backLabel="회비 표" onClose={sheets.closeSheet} />
  }
  if (sheets.sheet === FEE_PAGE && feeYear !== undefined) {
    return (
      <MonthlyFeeEdit
        year={feeYear}
        fee={monthlyFeeSource(book, feeYear)}
        backLabel="회비 표"
        onSave={(fee) => {
          settings.onChangeMonthlyFee(fee, feeYear)
          sheets.closeSheet()
        }}
        onBack={sheets.closeSheet}
      />
    )
  }
  if (member && sheets.sheet === MEMBER_EDIT_PAGE) {
    return (
      <MemberEditPage
        key={member.id}
        member={member}
        members={settings.members}
        startMonth={settings.startMonth}
        thisMonth={settings.thisMonth}
        hasRecords={settings.hasRecords(member.id)}
        sheets={sheets}
        backLabel={member.name}
        onSave={(changes) => {
          settings.onUpdateMember(member.id, changes)
          openMember()
        }}
        onDelete={() => {
          settings.onDeleteMember(member.id)
          // 지운 분의 한 분 보기는 없으니 확인 창 칸까지 한 번에 닫고 회비 표로
          sheets.closeSheet()
        }}
        onBack={openMember}
      />
    )
  }
  if (member && sheets.sheet === MEMBER_PAGE) {
    return (
      <MemberDuesPage
        book={book}
        member={member}
        table={table}
        today={today}
        sheets={sheets}
        onBack={sheets.closeSheet}
        onEdit={() => sheets.openSheet(MEMBER_EDIT_PAGE, openMember)}
        onRest={(from, until) => onRest(member.id, from, until)}
        onResume={(from) => onResume(member.id, from)}
      />
    )
  }

  const changeYear = (next: number) => {
    setYear(next)
    setFilter(null)
  }
  const openFee = (target: number) => {
    setFeeYear(target)
    sheets.openSheet(FEE_PAGE)
  }

  return (
    <div className="screen screen--stack dues" data-testid="dues-screen">
      <BackToLedger onBack={onBack} />
      <YearStepper
        heading
        label={`${year}년 회비`}
        onPrevious={() => changeYear(year - 1)}
        onNext={() => changeYear(year + 1)}
        previousDisabled={year <= firstYear}
        nextDisabled={year >= lastYear}
      />
      {(book.members ?? []).length === 0 ? (
        <section className="dues__empty" data-testid="dues-empty">
          <p className="dues__empty-text">회원 명단을 넣으면 누가 냈는지 보여요</p>
          <Button icon="plus" onClick={() => sheets.openSheet(ROSTER_PAGE)}>
            회원 넣기
          </Button>
        </section>
      ) : (
        <>
          <DuesSummary
            ref={summaryRef}
            table={table}
            filter={filter}
            onFilter={setFilter}
            canSetFee={(target) => ledgerYears.includes(target)}
            onSetFee={openFee}
          />
          {/* 7절 "낸 분을 안 적은 회비 N건": 대상이 있고 [이 카드 숨기기] 전일 때만 */}
          {assign && !book.dues?.hideUnassigned && unassigned.items.length > 0 && (
            <UnassignedDuesCard
              unassigned={unassigned}
              onAssign={() => sheets.openSheet(ASSIGN_PAGE)}
              onHide={() => {
                // 누른 버튼이 카드와 함께 사라져도 포커스가 화면 밖(body)으로 떨어지지 않게 바로 위 요약 카드로 (#181 리뷰)
                summaryRef.current?.focus()
                assign.onHide()
              }}
            />
          )}
          <DuesRows
            table={table}
            thisMonth={thisMonthOf(today)}
            filter={filter}
            onOpen={(id) => {
              setMemberId(id)
              openMember()
            }}
          />
        </>
      )}
    </div>
  )
}

// 회비 표 시작 해보다 이른 해: 칸 없이 이름과 낸 돈만 (4절)
function isBeforeStart(table: DuesTable): boolean {
  return table.startMonth === undefined || splitYearMonth(table.startMonth).year > table.year
}

// 고른 묶음. 그 묶음이 비면(기록을 바꿔 아무도 없게 됨) 모두 — 알약이 사라져 다시 누를 수 없으니
function activeFilter(table: DuesTable, filter: DuesGroup | null): DuesGroup | null {
  return filter !== null && table.summary[filter] > 0 ? filter : null
}

type DuesSummaryProps = {
  table: DuesTable
  filter: DuesGroup | null
  onFilter: (filter: DuesGroup | null) => void
  canSetFee: (year: number) => boolean // 그 해 장부가 있어 월 회비를 저장할 수 있는가
  onSetFee: (year: number) => void
  // 화면 읽기용 포커스 자리 ([이 카드 숨기기] 뒤, 7절 #181 리뷰)
  ref?: Ref<HTMLElement>
}

// 요약 카드: 월 회비 [바꾸기] / 월 회비가 없는 첫 해 "YYYY년 월 회비를 정해 주세요" [정하기] → 알약 [덜 낸 분 N명][다 낸 분 N명][쉬는 분 N명]
// (누르면 그 묶음만, 다시 누르면 모두. 0명인 묶음은 알약이 없다). 시작 해보다 이른 해는 알약 대신 안내
function DuesSummary({ table, filter, onFilter, canSetFee, onSetFee, ref }: DuesSummaryProps) {
  const { year, monthlyFee, missingFeeYear, summary, startMonth } = table
  const shown = activeFilter(table, filter)
  return (
    <section ref={ref} tabIndex={-1} className="dues-summary" aria-label={`${year}년 회비 요약`} data-testid="dues-summary">
      {monthlyFee !== undefined && (
        <div className="dues-summary__line">
          <span className="dues-summary__fee">
            월 회비 <strong>{formatAmount(monthlyFee)}원</strong>
          </span>
          {canSetFee(year) && (
            <button type="button" className="dues-summary__action" onClick={() => onSetFee(year)}>
              <span className="ui-visually-hidden">월 회비</span> 바꾸기
            </button>
          )}
        </div>
      )}
      {missingFeeYear !== undefined && (
        <div className="dues-summary__line" data-testid="dues-missing-fee">
          <span className="dues-summary__missing">{missingFeeYear}년 월 회비를 정해 주세요</span>
          {canSetFee(missingFeeYear) && (
            <button type="button" className="dues-summary__action" onClick={() => onSetFee(missingFeeYear)}>
              <span className="ui-visually-hidden">월 회비</span> 정하기
            </button>
          )}
        </div>
      )}
      {isBeforeStart(table) ? (
        startMonth && <p className="screen__note">회비 표는 {fullMonthText(startMonth)}부터 계산해요. 이 해는 낸 돈만 보여요</p>
      ) : (
        <div className="dues-summary__pills" role="group" aria-label="묶음으로 보기">
          {GROUPS.filter(({ group }) => summary[group] > 0).map(({ group, label }) => (
            <button
              key={group}
              type="button"
              className="dues-pill"
              data-group={group}
              aria-pressed={shown === group}
              onClick={() => onFilter(shown === group ? null : group)}
            >
              <span className="dues-pill__label">
                {shown === group && <Icon name="check" />}
                {label}
              </span>{' '}
              <span className="dues-pill__count">{summary[group]}명</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

type DuesRowsProps = {
  table: DuesTable
  thisMonth: YearMonth // 이번 달 (그만둔 문구를 과거형으로 쓸지)
  filter: DuesGroup | null
  onOpen: (memberId: string) => void
}

// 사람별 줄 (4절): 이름 + 그 해 낸 돈 / 상태 한 줄(덜 냄은 --info-ink) / 12칸 띠. 덜 낸 분 먼저(계산 순서 그대로), 줄 사이 선 없음.
// 줄 전체가 한 분 보기 버튼 — "김도윤 190,000원 10월 반까지 · 1만 원 덜 냄" 으로 읽힌다
function DuesRows({ table, thisMonth, filter, onOpen }: DuesRowsProps) {
  const shown = activeFilter(table, filter)
  const rows = shown === null ? table.rows : table.rows.filter((row) => row.group === shown)
  const beforeStart = isBeforeStart(table)
  if (rows.length === 0) return <p className="screen__note">{table.year}년에는 회원이 없어요</p>
  return (
    <ul className="dues-rows" aria-label={`${table.year}년 회원`}>
      {rows.map((row) => {
        const status = rowStatus(row, table, thisMonth)
        return (
          <li key={row.member.id}>
            <button type="button" className="dues-row" data-testid="dues-row" data-group={row.group} onClick={() => onOpen(row.member.id)}>
              <span className="dues-row__head">
                <span className="dues-row__name">{row.member.name}</span>{' '}
                <span className="dues-row__paid">{formatAmount(row.yearPaid)}원</span>
                <Icon name="right" />
              </span>
              {status && (
                <>
                  {' '}
                  <span className="dues-row__status">{status}</span>
                </>
              )}
              {!beforeStart && <DuesStrip cells={row.cells} referenceMonth={table.referenceMonth} />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
