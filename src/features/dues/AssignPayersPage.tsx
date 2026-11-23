import { useEffect, useId, useRef, useState } from 'react'
import { unassignedDues, type DatedEntry } from '../../domain/duesTable'
import { itemIcon } from '../../domain/itemIcon'
import { yearMonth } from '../../domain/members'
import { payerChoices } from '../../domain/payers'
import type { Payer } from '../../domain/types'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { EntryCard, type EntryCardRow } from '../../ui/EntryCard'
import { IconButton } from '../../ui/IconButton'
import { formatAmount } from '../../ui/money'
import { BackButton } from '../BackToLedger'
import { AddPayerSheet } from '../ledger/AddPayerSheet'
import { PayerPicker } from '../ledger/PayerPicker'
import { PayerSharesPage } from '../ledger/PayerSharesPage'
import { payerShares, startingShares } from '../ledger/payerShares'
import type { SheetHistory } from '../useScreenHistory'
import { assignNote, type PayerAssign } from './payerAssign'
import './dues.css'

// 붙이기 화면 위에 뜨는 칸 (확인 창 칸 — 뒤로 버튼은 그것만 닫는다. 붙이기 화면이 선택 창 칸이라 그 위 한 칸)
const SHARES_PAGE = 'dues-assign-shares'
const ADD_MEMBER_SHEET = 'dues-assign-add-member'

type AssignPayersPageProps = {
  assign: PayerAssign
  sheets: SheetHistory
  backLabel: string // 맨 위 [‹ …]: 회비 표에서 열면 "회비 표", 회원 명단에서 열면 "회원 명단"
  onClose: () => void // [‹ …]·끝·저장 실패
}

// 한 기록에서 고른 분과 "한 분씩 금액" 에서 정한 몫. 고른 분을 바꾸면 정한 몫은 버린다 (몫은 고른 분이 그대로일 때만 쓴다)
type Picks = { memberIds: string[]; shares?: Payer[] }
const NO_PICKS: Picks = { memberIds: [] }

// 날짜 줄: "2월 3일", 날짜 없는 예전 기록 "9월", 올해가 아니면 앞에 해 ("2025년 9월")
function dateText({ year, entry }: DatedEntry, thisYear: number): string {
  const date = entry.day === undefined ? `${entry.month}월` : `${entry.month}월 ${entry.day}일`
  return year === thisYear ? date : `${year}년 ${date}`
}

// 낸 분 붙이기 (SPEC-010 7절): [‹ 회비 표] → 제목 → 진행 "3 / 12" + 막대 → 카드 "이 기록"(날짜·항목·금액 + 엑셀 글 상자 + "누가 냈어요?")
// → 아래 [건너뛰기] [다음](마지막은 [끝]). 대상은 화면을 연 때의 낸 분 없는 회비(오래된 것부터)로 고정하고, [다음] 마다 저장한다.
// 금액은 바꿀 수 없어 사람 수로 똑같이 나누거나, 나눠지지 않으면 [다음] 이 "한 분씩 금액"(합계 = 그 기록 금액)으로 간다
export function AssignPayersPage({ assign, sheets, backLabel, onClose }: AssignPayersPageProps) {
  const { book, thisYear } = assign
  const [items] = useState(() => unassignedDues(book).items)
  const [index, setIndex] = useState(0)
  const [picks, setPicks] = useState(NO_PICKS)
  const [assigned, setAssigned] = useState(0)
  const item = items[index]
  // 다음 기록으로 넘긴 뒤 포커스를 "이 기록" 카드 머리로: 고른 분이 비어 누른 [다음] 이 비활성이 되면 포커스가 화면 밖(body)으로
  // 떨어져 화면 읽기가 맨 위부터 다시 읽게 되므로 (#181 리뷰). 넘길 때만 옮긴다 (처음 열 때는 화면 제목, useScreenHeading)
  const recordTitleRef = useRef<HTMLParagraphElement>(null)
  const focusRecord = useRef(false)

  useEffect(() => {
    if (!focusRecord.current) return
    focusRecord.current = false
    recordTitleRef.current?.focus({ preventScroll: true })
  }, [index])

  if (item === undefined) {
    return (
      <div className="screen screen--stack" data-testid="assign-payers-screen">
        <div className="entry__page-head">
          <BackButton label={backLabel} onBack={onClose} />
          <h1 className="screen__title">낸 분 붙이기</h1>
        </div>
        <p className="screen__note">낸 분을 붙일 회비 기록이 없어요</p>
      </div>
    )
  }

  const { year, entry } = item
  const choices = payerChoices(book, year, entry.month)
  const last = index === items.length - 1
  const status = assignNote(picks.memberIds.length, entry.amount, picks.shares)

  // 다음 기록으로 (마지막이면 끝): 고른 분은 넘기지 않고 화면 맨 위부터, 포커스는 새 기록 카드 머리로
  function advance(done: number) {
    if (last) {
      onClose()
      assign.onFinish(done)
      return
    }
    focusRecord.current = true
    setIndex(index + 1)
    setPicks(NO_PICKS)
    window.scrollTo(0, 0)
  }

  function next() {
    const payers = payerShares(picks.memberIds, entry.amount, { shares: picks.shares })
    if (payers === undefined) {
      sheets.openDialog(SHARES_PAGE)
      return
    }
    // 기기에 저장하지 못하면 화면을 닫아 위쪽 실패 안내를 보인다 (내역 적기와 같음)
    if (!assign.onAssign(year, entry.id, payers)) {
      onClose()
      return
    }
    setAssigned(assigned + 1)
    advance(assigned + 1)
  }

  const choose = (memberIds: string[]) => setPicks({ memberIds })

  // "한 분씩 금액": 합계가 이 기록 금액이어야 [이대로 할게요]. 정한 몫을 들고 붙이기 화면으로 돌아와 [다음] 으로 저장한다
  if (sheets.dialog === SHARES_PAGE) {
    const picked = choices.members.filter((member) => picks.memberIds.includes(member.id))
    return (
      <PayerSharesPage
        backLabel="낸 분 붙이기"
        members={picked}
        initial={startingShares(
          picked.map((member) => member.id),
          entry.amount,
          choices.fee,
          { shares: picks.shares },
        )}
        total={entry.amount}
        onDone={(shares) => {
          setPicks({ memberIds: shares.map((share) => share.memberId), shares })
          sheets.closeDialog()
        }}
        onBack={sheets.closeDialog}
      />
    )
  }

  const rows: EntryCardRow[] = [
    { label: '날짜', icon: 'calendar', value: dateText(item, thisYear) },
    { label: '항목', icon: itemIcon(entry.name), value: entry.name },
    { label: '금액', icon: 'coin', value: `${formatAmount(entry.amount)}원` },
  ]

  return (
    <div className="screen screen--groups entry assign" data-testid="assign-payers-screen">
      <div className="entry__page-head">
        <BackButton label={backLabel} onBack={onClose} />
        <h1 className="screen__title">낸 분 붙이기</h1>
      </div>
      <div className="entry__now">
        <div className="assign__progress">
          <span className="assign__count" aria-hidden="true">
            {index + 1} / {items.length}
          </span>
          <span
            className="assign__bar"
            role="progressbar"
            aria-label="진행"
            aria-valuemin={1}
            aria-valuemax={items.length}
            aria-valuenow={index + 1}
            aria-valuetext={`${items.length}건 중 ${index + 1}번째`}
          >
            <span className="assign__bar-fill" style={{ width: `${((index + 1) / items.length) * 100}%` }} />
          </span>
        </div>
        {/* [다음]·[건너뛰기] 뒤 화면 읽기에 몇 번째 어떤 기록인지 알린다 (포커스는 카드 머리 "이 기록"으로 옮긴다) */}
        <p className="ui-visually-hidden" aria-live="polite">
          {index > 0 ? `${items.length}건 중 ${index + 1}번째 기록이에요. ${dateText(item, thisYear)} ${formatAmount(entry.amount)}원` : ''}
        </p>
        <EntryCard title="이 기록" rows={rows} titleRef={recordTitleRef}>
          <div className="entry__part">
            {entry.sourceText !== undefined && <SourceText text={entry.sourceText} />}
            <h2 className="entry__question">누가 냈어요?</h2>
            <PayerPicker
              key={index}
              choices={choices}
              checked={picks.memberIds}
              onToggle={(memberId) =>
                choose(
                  picks.memberIds.includes(memberId)
                    ? picks.memberIds.filter((id) => id !== memberId)
                    : [...picks.memberIds, memberId],
                )
              }
              onPick={choose}
              onAddMember={() => sheets.openDialog(ADD_MEMBER_SHEET)}
            />
            {picks.memberIds.length > 0 && (
              <div className="entry__aside">
                <IconButton icon="users" onClick={() => sheets.openDialog(SHARES_PAGE)}>
                  한 분만 금액이 달라요
                </IconButton>
              </div>
            )}
          </div>
        </EntryCard>
      </div>

      <BottomActionBar
        label={last ? '끝' : '다음'}
        disabled={'missing' in status}
        note={'missing' in status ? status.missing : status.note}
        onClick={next}
        secondary={{ label: '건너뛰기', onClick: () => advance(assigned) }}
      />

      <AddPayerSheet
        open={sheets.dialog === ADD_MEMBER_SHEET}
        members={book.members ?? []}
        joinedText={`${year}년 ${entry.month}월`}
        onAdd={(name) => {
          const added = assign.onAddMember(name, yearMonth(year, entry.month))
          choose([...picks.memberIds, added])
          sheets.closeDialog()
        }}
        onClose={sheets.closeDialog}
      />
    </div>
  )
}

// 엑셀에서 불러온 기록의 원래 글 (회색 상자, 엑셀에서 온 기록만): 누가 냈는지 고를 때 보고 맞춘다
function SourceText({ text }: { text: string }) {
  const labelId = useId()
  return (
    <div className="assign__source" role="note" aria-labelledby={labelId}>
      <p className="assign__source-label" id={labelId}>
        엑셀에 적혀 있던 글
      </p>
      <p className="assign__source-text">{text}</p>
    </div>
  )
}
