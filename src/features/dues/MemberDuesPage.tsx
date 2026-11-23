import { useId, useState } from 'react'
import { monthlyFeeOf, type DuesCell, type DuesRow, type DuesTable } from '../../domain/duesTable'
import { openEndedRestUntil, splitYearMonth, thisMonthOf, yearMonth } from '../../domain/members'
import type { Book, Member, YearMonth } from '../../domain/types'
import { AmountText } from '../../ui/AmountText'
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { ListRow } from '../../ui/ListRow'
import { formatAmount } from '../../ui/money'
import { YearMonthPicker } from '../../ui/YearMonthPicker'
import { BackButton } from '../BackToLedger'
import type { SheetHistory } from '../useScreenHistory'
import { DuesCalendar } from './DuesCalendar'
import { cellSheetNote, openingNote, paidThroughText, paymentNote } from './duesWords'
import './dues.css'

// 한 분 보기 위에 뜨는 선택 창 (확인 창 칸 — 뒤로 버튼은 창만 닫는다). 달 칸 → [N월부터 쉬어요] → "언제까지 쉬나요?" 는 같은 칸을 바꿔 끼운다
const MONTH_SHEET = 'dues-month'
const REST_UNTIL_SHEET = 'dues-rest-until'

type MemberDuesPageProps = {
  book: Book
  member: Member
  table: DuesTable // 보고 있는 해의 회비 표 (회비 표 화면과 같은 계산)
  today: Date
  sheets: SheetHistory
  onBack: () => void // [‹ 회비 표]
  onEdit: () => void // 이름 [›] → 회원 정보 바꾸기
  onRest: (from: YearMonth, until: YearMonth) => void
  onResume: (from: YearMonth) => void
}

// 기록 날짜: "10월 19일", 날짜 없는 예전 기록 "10월"
function dateText(month: number, day: number | undefined): string {
  return day === undefined ? `${month}월` : `${month}월 ${day}일`
}

// 한 분 보기 (SPEC-010 5절): [‹ 회비 표] → 이름 [›](회원 정보) → 요약(그 해 낸 돈·채운 달·덜 낸 돈(N월까지)·시작할 때 남은 돈·남은 돈)
// → 12칸 달력(칸 누르면 쉬는 달 넣기·빼기) → "낸 기록"(최근 것부터, 채운 칸·같이 낸 분). 그 해에 회원도 아니고 낸 돈도 없으면 안내만
export function MemberDuesPage({ book, member, table, today, sheets, onBack, onEdit, onRest, onResume }: MemberDuesPageProps) {
  const [picked, setPicked] = useState<DuesCell>()
  const row = table.rows.find((item) => item.member.id === member.id)
  const { year } = table
  const from = picked && yearMonth(year, picked.month)
  const close = sheets.closeDialog

  return (
    <div className="screen screen--stack dues-member" data-testid="dues-member-screen">
      <div className="dues-member__head">
        <BackButton label="회비 표" onBack={onBack} />
        <h1 className="screen__title">
          <button type="button" className="dues-member__name" onClick={onEdit}>
            {member.name}
            <Icon name="right" />{' '}
            <span className="ui-visually-hidden">회원 정보 바꾸기</span>
          </button>
        </h1>
      </div>
      {row === undefined ? (
        <p className="screen__note">{year}년에는 회원이 아니었어요</p>
      ) : (
        <>
          <MemberSummary row={row} table={table} />
          {table.startMonth !== undefined && splitYearMonth(table.startMonth).year <= year && (
            <DuesCalendar
              cells={row.cells}
              year={year}
              referenceMonth={table.referenceMonth}
              onPick={(cell) => {
                setPicked(cell)
                sheets.openDialog(MONTH_SHEET)
              }}
            />
          )}
          <PaymentHistory row={row} book={book} year={year} />
        </>
      )}

      {picked && from && (
        <>
          <BottomSheet
            open={sheets.dialog === MONTH_SHEET}
            title={`${member.name} · ${year === today.getFullYear() ? '' : `${year}년 `}${picked.month}월`}
            onClose={close}
          >
            <p className="dues-sheet__note">{cellSheetNote(picked, year)}</p>
            <div className="dues-sheet__actions">
              {picked.state === 'off' ? (
                <Button
                  onClick={() => {
                    onResume(from)
                    close()
                  }}
                >
                  {picked.month}월부터 다시 내요
                </Button>
              ) : (
                <Button onClick={() => sheets.openDialog(REST_UNTIL_SHEET)}>{picked.month}월부터 쉬어요</Button>
              )}
              <Button variant="secondary" onClick={close}>
                닫기
              </Button>
            </div>
          </BottomSheet>
          <RestUntilSheet
            open={sheets.dialog === REST_UNTIL_SHEET}
            from={from}
            today={today}
            onPick={(until) => {
              onRest(from, until)
              close()
            }}
            onClose={close}
          />
        </>
      )}
    </div>
  )
}

type RestUntilSheetProps = {
  open: boolean
  from: YearMonth // 쉬기 시작하는 달 (고를 수 있는 첫 달 — 고르면 그 달 하나만)
  today: Date
  onPick: (until: YearMonth) => void
  onClose: () => void
}

// "언제까지 쉬나요?" (5절): 해·달 고르기(그 달부터, 다음 해까지) + [아직 몰라요](고를 수 있는 마지막 달까지, openEndedRestUntil)
function RestUntilSheet({ open, from, today, onPick, onClose }: RestUntilSheetProps) {
  const first = splitYearMonth(from)
  const openEnd = openEndedRestUntil(from, today)
  return (
    <BottomSheet open={open} title="언제까지 쉬나요?" onClose={onClose}>
      <p className="screen__note">고른 달까지 쉬는 달이 돼요</p>
      <YearMonthPicker
        value={null}
        min={first}
        current={splitYearMonth(thisMonthOf(today))}
        firstYear={first.year}
        lastYear={splitYearMonth(openEnd).year}
        onChange={(year, month) => onPick(yearMonth(year, month))}
      />
      <Button variant="secondary" onClick={() => onPick(openEnd)}>
        아직 몰라요
      </Button>
      <p className="screen__note">다시 낼 때는 그 달 칸에서 [다시 내요]를 눌러 주세요</p>
    </BottomSheet>
  )
}

// 요약 (흰 카드): 그 해 낸 돈 / 채운 달 / 덜 낸 돈 (N월까지) / 남은 돈 + 시작할 때 남은 돈 한 줄. 시작 해보다 이른 해는 낸 돈만
function MemberSummary({ row, table }: { row: DuesRow; table: DuesTable }) {
  const { year, startMonth, referenceMonth } = table
  const counted = startMonth !== undefined && splitYearMonth(startMonth).year <= year
  const opening = counted && startMonth !== undefined ? openingNote(row.opening, startMonth) : undefined
  return (
    <section className="dues-member__summary" aria-label="요약" data-testid="dues-member-summary">
      <dl className="dues-facts">
        <div className="dues-facts__item">
          <dt>{year}년에 낸 돈</dt>
          <dd>{formatAmount(row.yearPaid)}원</dd>
        </div>
        {counted && (
          <div className="dues-facts__item">
            <dt>채운 달</dt>
            <dd>{row.paidThrough ? paidThroughText(row.paidThrough, year) : '아직 없어요'}</dd>
          </div>
        )}
        {counted && referenceMonth !== undefined && (
          <div className="dues-facts__item" data-behind={row.shortfall > 0}>
            <dt>덜 낸 돈 ({referenceMonth}월까지)</dt>
            <dd>{row.shortfall > 0 ? `${formatAmount(row.shortfall)}원` : '없어요'}</dd>
          </div>
        )}
        {row.remaining > 0 && (
          <div className="dues-facts__item">
            <dt>남은 돈</dt>
            <dd>{formatAmount(row.remaining)}원</dd>
          </div>
        )}
      </dl>
      {opening && <p className="screen__note">{opening}</p>}
    </section>
  )
}

// 낸 기록 (5절): 그 해 입금, 최근 것부터. 날짜 · 채운 칸·같이 낸 분 · 이 분 몫 금액
function PaymentHistory({ row, book, year }: { row: DuesRow; book: Book; year: number }) {
  const titleId = useId()
  const entries = book.ledgers[String(year)]?.entries ?? []
  const payerCount = (entryId: string) => entries.find((entry) => entry.id === entryId)?.payers?.length ?? 1
  const feeOf = (target: number) => monthlyFeeOf(book, target)
  const payments = [...row.payments].reverse()
  return (
    <section className="dues-member__history" aria-labelledby={titleId}>
      <h2 className="dues-member__title" id={titleId}>
        낸 기록
      </h2>
      {payments.length === 0 ? (
        <p className="screen__note">{year}년에 낸 기록이 없어요</p>
      ) : (
        <ul className="dues-payments">
          {payments.map((payment) => (
            <li key={payment.entryId}>
              <ListRow
                title={dateText(payment.month, payment.day)}
                description={paymentNote(payment, payerCount(payment.entryId), feeOf, year)}
                end={<AmountText type="income" amount={payment.amount} />}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
