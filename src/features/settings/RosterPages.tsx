import { useId, useState } from 'react'
import type { MonthlyFeeSource } from '../../domain/duesTable'
import {
  hasSameName,
  nextMonth,
  previousMonth,
  splitYearMonth,
  yearMonth,
  type MemberChanges,
  type NewMember,
} from '../../domain/members'
import type { Member, YearMonth } from '../../domain/types'
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { ListRow } from '../../ui/ListRow'
import { MoneyInput } from '../../ui/MoneyInput'
import { PickerField } from '../../ui/PickerField'
import { SegmentedControl, type SegmentOptions } from '../../ui/SegmentedControl'
import { TextField } from '../../ui/TextField'
import { YearMonthPicker } from '../../ui/YearMonthPicker'
import { BackButton } from '../BackToLedger'
import type { SheetHistory } from '../useScreenHistory'
import { EditPage } from './EditPage'
import { fullMonthText, MEMBER_ADD_PAGE, MEMBER_PAGE, memberNote, ROSTER_PAGE, rosterGroups } from './roster'
import './settings.css'

// 그 화면 위에 뜨는 달 고르기·확인 창 (확인 창 칸 — 뒤로 버튼은 창만 닫는다)
const START_SHEET = 'settings-roster-start'
const JOINED_SHEET = 'settings-roster-joined'
const LEFT_SHEET = 'settings-roster-left'
const DELETE_MEMBER_DIALOG = 'settings-roster-delete'

// 달 고르기에서 넘겨 볼 수 있는 첫 해 (이모 엑셀이 2011년부터라 그보다 이른 해는 쓸 일이 없다). 마지막 해는 이번 해 + 1
const FIRST_PICK_YEAR = 2000

const SAME_NAME_NOTE = '같은 이름이 있어요. 구분할 수 있게 적어 주세요'

// 설정이 받는 회원 명단·월 회비 값과 바꾸는 동작 (SPEC-010 6절, 동아리·모임 장부)
export interface DuesSettings {
  members: readonly Member[]
  startMonth: YearMonth | undefined // 회비 표 시작 달. 명단을 처음 넣을 때 생긴다
  monthlyFee: MonthlyFeeSource | undefined // 지금 장부 연도에 쓰는 월 회비와 그 값을 정한 해 (그 해에 없으면 그 전 해 값)
  hasRecords: (memberId: string) => boolean // 회비 기록에 낸 분으로 들어간 회원 (지울 수 없다)
  thisMonth: YearMonth // 이번 달: 들어온 달 기본값, 쉬는 달 표시, 달 고르기 테두리
  onAddMember: (member: NewMember) => void
  onUpdateMember: (id: string, changes: MemberChanges) => void
  onDeleteMember: (id: string) => void
  onChangeStartMonth: (month: YearMonth) => void
  onChangeMonthlyFee: (fee: number, year?: number) => void // year: 그 해 (없으면 지금 장부 연도). 회비 표는 보고 있는 해 (#163)
}

type RosterPagesProps = {
  dues: DuesSettings
  sheets: SheetHistory
  backLabel?: string // 회원 명단 맨 위 [‹ …]: 설정에서 열면 "설정", 회비 표에서 열면 "회비 표" (#163)
}

// 회원 명단 → 회원 넣기 / 회원 정보. 회원 넣기·회원 정보는 회원 명단의 칸을 바꿔 끼우고, 뒤로 버튼으로 닫히면 회원 명단을 다시 연다
export function RosterPages({ dues, sheets, backLabel = '설정' }: RosterPagesProps) {
  const [memberId, setMemberId] = useState<string>()
  const backToRoster = () => sheets.openSheet(ROSTER_PAGE)
  const editing = dues.members.find((member) => member.id === memberId)

  if (sheets.sheet === MEMBER_ADD_PAGE) {
    return (
      <MemberAddPage
        members={dues.members}
        thisMonth={dues.thisMonth}
        sheets={sheets}
        onAdd={(member) => {
          dues.onAddMember(member)
          backToRoster()
        }}
        onBack={backToRoster}
      />
    )
  }
  if (sheets.sheet === MEMBER_PAGE && editing) {
    return (
      <MemberEditPage
        key={editing.id}
        member={editing}
        members={dues.members}
        startMonth={dues.startMonth}
        thisMonth={dues.thisMonth}
        hasRecords={dues.hasRecords(editing.id)}
        sheets={sheets}
        onSave={(changes) => {
          dues.onUpdateMember(editing.id, changes)
          backToRoster()
        }}
        onDelete={() => {
          dues.onDeleteMember(editing.id)
          sheets.closeDialog()
          backToRoster()
        }}
        onBack={backToRoster}
      />
    )
  }
  return (
    <RosterScreen
      dues={dues}
      sheets={sheets}
      backLabel={backLabel}
      onAdd={() => sheets.openSheet(MEMBER_ADD_PAGE, backToRoster)}
      onOpen={(id) => {
        setMemberId(id)
        sheets.openSheet(MEMBER_PAGE, backToRoster)
      }}
    />
  )
}

type RosterScreenProps = {
  dues: DuesSettings
  sheets: SheetHistory
  backLabel: string
  onAdd: () => void
  onOpen: (memberId: string) => void
}

// 지금 회원 목록 자리의 안내: 명단 전체가 비면 넣어 달라는 말, 모두 그만둔 분이면 지금 회원이 없다는 말 (SPEC-010 6절)
function emptyCurrentNote(memberCount: number): string {
  return memberCount === 0 ? '아직 회원이 없어요. 회비 표에 나올 분을 넣어 주세요' : '지금 회원이 없어요'
}

// 회원 명단 (SPEC-010 6절, 시안 D): [‹ 설정] → 제목 → 지금 회원 → [+ 회원 넣기] → 그만둔 분 → 회비 표 시작 달 + [시작 달 바꾸기].
// 시작 달 안내는 명단에 한 분이라도(그만둔 분 포함) 있을 때만 — 마지막 회원을 지워도 시작 달 값은 남지만 보여 줄 표가 없다
function RosterScreen({ dues, sheets, backLabel, onAdd, onOpen }: RosterScreenProps) {
  const leftTitleId = useId()
  const { members, startMonth, thisMonth } = dues
  const { current, left } = rosterGroups(members)
  const rows = (group: Member[], label: string) => (
    <ul className="settings__list roster__list" aria-label={label}>
      {group.map((member) => (
        <li key={member.id}>
          <ListRow
            title={member.name}
            description={memberNote(member, { startMonth, thisMonth })}
            onClick={() => onOpen(member.id)}
            chevron
          />
        </li>
      ))}
    </ul>
  )

  return (
    <div className="screen roster" data-testid="roster-screen">
      <div className="settings__edit-head">
        <BackButton label={backLabel} onBack={sheets.closeSheet} />
        <h1 className="screen__title">회원 명단</h1>
      </div>
      {current.length > 0 ? rows(current, '지금 회원') : <p className="screen__note">{emptyCurrentNote(members.length)}</p>}
      {/* 장부 고르기 창 [+ 새 장부 만들기] 와 같은 점선 버튼 — 줄 목록과 다른 일 */}
      <button type="button" className="roster__add" onClick={onAdd}>
        <Icon name="plus" />
        회원 넣기
      </button>
      {left.length > 0 && (
        <section className="roster__group" aria-labelledby={leftTitleId}>
          <h2 className="settings__group-title" id={leftTitleId}>
            그만둔 분
          </h2>
          {rows(left, '그만둔 분 목록')}
          <p className="screen__note">그만둔 분도 예전 해 회비 표와 기록에는 그대로 남아요</p>
        </section>
      )}
      {startMonth && members.length > 0 && (
        <div className="roster__start">
          <p className="screen__note">회비 표는 {fullMonthText(startMonth)}부터 계산해요</p>
          <IconButton icon="calendar" variant="surface" onClick={() => sheets.openDialog(START_SHEET)}>
            시작 달 바꾸기
          </IconButton>
          <MonthSheet
            open={sheets.dialog === START_SHEET}
            title="회비 표를 언제부터 계산할까요?"
            note="바꾸면 그 전 기록은 회비 표에 들어가지 않아요"
            value={startMonth}
            thisMonth={thisMonth}
            onPick={(month) => {
              if (month !== startMonth) dues.onChangeStartMonth(month)
              sheets.closeDialog()
            }}
            onClose={sheets.closeDialog}
          />
        </div>
      )}
    </div>
  )
}

type MonthSheetProps = {
  open: boolean
  title: string
  note?: string // 제목 아래 안내 (Caption)
  value: YearMonth | undefined
  thisMonth: YearMonth
  onPick: (month: YearMonth) => void
  onClose: () => void
}

// 해·달을 고르는 선택 창 (들어온 달·그만둔 달·회비 표 시작 달)
function MonthSheet({ open, title, note, value, thisMonth, onPick, onClose }: MonthSheetProps) {
  const current = splitYearMonth(thisMonth)
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      {note && <p className="screen__note">{note}</p>}
      <YearMonthPicker
        value={value === undefined ? null : splitYearMonth(value)}
        current={current}
        firstYear={FIRST_PICK_YEAR}
        lastYear={current.year + 1}
        onChange={(year, month) => onPick(yearMonth(year, month))}
      />
    </BottomSheet>
  )
}

type MemberAddPageProps = {
  members: readonly Member[]
  thisMonth: YearMonth
  sheets: SheetHistory
  onAdd: (member: NewMember) => void
  onBack: () => void
}

// 회원 넣기: 이름(같은 이름이면 안내만) + 들어온 달(기본 이번 달) → [넣기]
function MemberAddPage({ members, thisMonth, sheets, onAdd, onBack }: MemberAddPageProps) {
  const [name, setName] = useState('')
  const [joined, setJoined] = useState(thisMonth)
  const named = name.trim() !== ''

  return (
    <EditPage
      title="회원 넣기"
      backLabel="회원 명단"
      saveLabel="넣기"
      canSave={named}
      onSave={() => onAdd({ name, joined })}
      onBack={onBack}
    >
      <TextField
        label="이름"
        labelRole="label"
        value={name}
        onChange={setName}
        note={named && hasSameName(members, name) ? SAME_NAME_NOTE : undefined}
      />
      <PickerField label="들어온 달" value={fullMonthText(joined)} onClick={() => sheets.openDialog(JOINED_SHEET)} />
      <MonthSheet
        open={sheets.dialog === JOINED_SHEET}
        title="언제 들어왔나요?"
        value={joined}
        thisMonth={thisMonth}
        onPick={(month) => {
          setJoined(month)
          sheets.closeDialog()
        }}
        onClose={sheets.closeDialog}
      />
    </EditPage>
  )
}

type Owed = 'owed' | 'ahead'

const OPENING_OPTIONS: SegmentOptions<Owed> = [
  { value: 'owed', label: '덜 낸 돈' },
  { value: 'ahead', label: '미리 낸 돈' },
]

type MemberEditPageProps = {
  member: Member
  members: readonly Member[]
  startMonth: YearMonth | undefined
  thisMonth: YearMonth
  hasRecords: boolean
  sheets: SheetHistory
  onSave: (changes: MemberChanges) => void
  onDelete: () => void
  onBack: () => void
  backLabel?: string // 맨 위 [‹ …]: 회원 명단에서 열면 "회원 명단", 회비 표 한 분 보기에서 열면 그분 이름 (#163)
}

// 회원 정보 (SPEC-010 5·6절): 이름, 들어온 달, 그만둔 달([그만뒀어요] → 마지막 회원 달 / [다시 회원으로]),
// 시작할 때 남은 돈(덜 낸 돈·미리 낸 돈 + 금액) → [저장] → [이 회원 지우기](어느 기록에도 없을 때만). 쉬는 달은 한 분 보기(#163).
// 회비 표 한 분 보기의 이름 [›] 도 이 화면을 연다
export function MemberEditPage({
  member,
  members,
  startMonth,
  thisMonth,
  hasRecords,
  sheets,
  onSave,
  onDelete,
  onBack,
  backLabel = '회원 명단',
}: MemberEditPageProps) {
  const [name, setName] = useState(member.name)
  const [joined, setJoined] = useState(member.joined)
  const [left, setLeft] = useState(member.left)
  const [opening, setOpening] = useState(member.opening ?? 0)
  // 금액이 0 이어도 고른 쪽을 기억한다 (처음엔 덜 낸 돈 — 엑셀 "미수합계" 를 옮기는 일이 많다)
  const [owed, setOwed] = useState((member.opening ?? 0) <= 0)
  const named = name.trim() !== ''
  const changed =
    name.trim() !== member.name || joined !== member.joined || left !== member.left || opening !== (member.opening ?? 0)

  const footer = hasRecords ? (
    <p className="screen__note roster__danger">회비 기록이 있어 지울 수 없어요. 그만둔 분으로 옮겨 주세요</p>
  ) : (
    <div className="roster__danger">
      <Button variant="danger-text" onClick={() => sheets.openDialog(DELETE_MEMBER_DIALOG)}>
        이 회원 지우기
      </Button>
    </div>
  )

  return (
    <EditPage
      title="회원 정보 바꾸기"
      backLabel={backLabel}
      canSave={named && changed}
      onSave={() => onSave({ name, joined, left, opening })}
      onBack={onBack}
      footer={footer}
    >
      <TextField
        label="이름"
        labelRole="label"
        value={name}
        onChange={setName}
        error={named ? undefined : '이름을 적어 주세요'}
        note={named && hasSameName(members, name, member.id) ? SAME_NAME_NOTE : undefined}
      />
      <PickerField label="들어온 달" value={fullMonthText(joined)} onClick={() => sheets.openDialog(JOINED_SHEET)} />
      {left === undefined ? (
        <Button variant="secondary" onClick={() => sheets.openDialog(LEFT_SHEET)}>
          그만뒀어요
        </Button>
      ) : (
        <div className="roster__left">
          <PickerField
            label="그만둔 달"
            value={`${fullMonthText(previousMonth(left))}까지`}
            onClick={() => sheets.openDialog(LEFT_SHEET)}
          />
          <Button variant="secondary" onClick={() => setLeft(undefined)}>
            다시 회원으로
          </Button>
        </div>
      )}
      <div className="roster__opening" data-testid="opening-field">
        <MoneyInput
          label="시작할 때 남은 돈"
          labelRole="label"
          value={Math.abs(opening)}
          onChange={(amount) => setOpening(owed ? -amount : amount)}
        />
        <SegmentedControl
          label="덜 냈나요, 미리 냈나요?"
          options={OPENING_OPTIONS}
          value={owed ? 'owed' : 'ahead'}
          onChange={(next) => {
            const nextOwed = next === 'owed'
            setOwed(nextOwed)
            setOpening(nextOwed ? -Math.abs(opening) : Math.abs(opening))
          }}
        />
        {startMonth && (
          <p className="screen__note">회비 표 시작 달({fullMonthText(startMonth)}) 앞까지 덜 냈거나 미리 낸 돈이에요</p>
        )}
      </div>

      <MonthSheet
        open={sheets.dialog === JOINED_SHEET}
        title="언제 들어왔나요?"
        value={joined}
        thisMonth={thisMonth}
        onPick={(month) => {
          setJoined(month)
          sheets.closeDialog()
        }}
        onClose={sheets.closeDialog}
      />
      {/* 그만둔 달은 마지막 회원 달을 고르고, 저장은 그 다음 달(그 달부터 회원이 아니다, SPEC-010 1절) */}
      <MonthSheet
        open={sheets.dialog === LEFT_SHEET}
        title="몇 월까지 회원이었나요?"
        value={left === undefined ? undefined : previousMonth(left)}
        thisMonth={thisMonth}
        onPick={(month) => {
          setLeft(nextMonth(month))
          sheets.closeDialog()
        }}
        onClose={sheets.closeDialog}
      />
      <ConfirmDialog
        open={sheets.dialog === DELETE_MEMBER_DIALOG}
        title={`‘${member.name}’ 님을 명단에서 지울까요?`}
        description="되돌릴 수 없어요"
        confirmLabel="지우기"
        danger
        onConfirm={onDelete}
        onCancel={sheets.closeDialog}
      />
    </EditPage>
  )
}
