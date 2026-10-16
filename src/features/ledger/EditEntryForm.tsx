import { useEffect, useState } from 'react'
import type { EntryInput, FrequentChoice } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'
import { AmountDisplay } from '../../ui/AmountDisplay'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { DayInput } from '../../ui/DayInput'
import { MonthButton } from '../../ui/MonthButton'
import { OptionList } from '../../ui/OptionList'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { TextField } from '../../ui/TextField'
import { BackToLedger } from '../BackToLedger'
import type { SheetHistory } from '../useScreenHistory'
import { EntryMonthSheet } from './EntryMonthSheet'
import {
  checkDayText,
  checkDraft,
  dayTextForMonth,
  isDraftChanged,
  tidyDayText,
  type DraftCheck,
  type EntryDraft,
} from './entryDraft'
import { ENTRY_MONTH_SHEET, itemOptions, TYPE_SEGMENTS } from './entryOptions'
import './entry.css'

type EditEntryFormProps = {
  // 장부 연도 (그 달 마지막 날, 2월 윤년)
  year: number
  // 고칠 기록의 처음 값. 날짜 없는 예전 기록이면 day 가 undefined
  initial: EntryDraft
  // 이번 달 (달 선택 창 테두리). 올해 장부가 아니면 주지 않는다
  currentMonth?: number
  // 자주 쓴 항목 목록 (수입·지출 함께, 내역 적기와 같다)
  frequentChoices: () => FrequentChoice[]
  sheets: SheetHistory
  onSave: (input: EntryInput) => void
  onBack: () => void
  // 처음 값에서 바뀐 것이 있는지 알린다. 바뀌었으면 닫기 전에 "적던 내용을 버릴까요?" 를 묻는다
  onDirtyChange?: (dirty: boolean) => void
  // 맨 아래 [이 내역 지우기] → 확인 후 불린다. 부른 쪽이 장부로 돌아간다 (backToLedger 가 확인 창 칸까지 되돌린다)
  onDelete: () => void
}

// 지우기 확인 창 이름 (방문 기록 한 칸 — 뒤로 버튼은 확인 창만 닫는다, #110)
const DELETE_DIALOG = 'edit-entry-delete'

// 고치는 내역의 이름이 목록에 없으면 맨 위에 그 내역의 종류로 더한다. 목록에 있으면 그 줄의 종류를 그 내역의 종류로 보인다 (AC-32)
function choicesWithInitial(choices: readonly FrequentChoice[], initial: EntryDraft): FrequentChoice[] {
  if (initial.type === undefined) return [...choices]
  const own: FrequentChoice = { name: initial.name, type: initial.type }
  if (!choices.some((choice) => choice.name === own.name)) return [own, ...choices]
  return choices.map((choice) => (choice.name === own.name ? own : choice))
}

// 내역 고치기 (SPEC-001 v2.6): 값을 한눈에 봐야 해서 펼친 모양, 순서는 내역 적기와 같다 (AC-31) —
// 며칠인가요?(제목 옆 [10월 ▾] + 날 숫자 칸, #80) / 무엇인가요?(수입·지출 항목 함께, 지금 이름 체크 + [직접 적기] 를 누를 때만 이름 칸·수입/지출 스위치) /
// 얼마인가요?, 질문 사이 넓은 간격, 맨 아래 크게 띄운 [이 내역 지우기], 아래 고정 [저장].
// 날짜 없는 예전 기록은 날 칸을 비운 채 그대로 저장할 수 있다. 날짜가 있던 기록은 날짜를 떼지 않는다 (AC-25)
export function EditEntryForm({
  year,
  initial,
  currentMonth,
  frequentChoices,
  sheets,
  onSave,
  onBack,
  onDirtyChange,
  onDelete,
}: EditEntryFormProps) {
  // draft.day 는 처음 값 그대로 두고, 고친 날은 날 숫자 칸 글자(dayText)로 든다 (빈칸·없는 날도 칸에는 남는다)
  const [draft, setDraft] = useState(initial)
  const initialDayText = initial.day === undefined ? '' : String(initial.day)
  const [dayText, setDayText] = useState(initialDayText)
  // [직접 적기] 칸 (AC-33): 열려 있는 동안은 칸의 이름·스위치의 종류가 답이다. 닫으면 목록에서 고른 항목(draft)으로 돌아간다
  // 화면 안 상태라 방문 기록에 쌓지 않는다
  const [custom, setCustom] = useState<{ name: string; type: EntryType | undefined } | null>(null)
  // 저장·버릴까요가 보는 값. 칸을 열기만 하고 글자를 적지 않았으면 고른 항목 그대로 (바뀐 것이 아니다)
  const answered: EntryDraft = custom && custom.name !== '' ? { ...draft, name: custom.name, type: custom.type } : draft
  const dayCheck = checkDayText(year, draft.month, dayText)
  // 날짜 없는 예전 기록을 날 칸을 비운 채 저장 (AC-25)
  const keepsUndated = initial.day === undefined && dayText === ''
  // 칸이 열려 있으면 빈 이름도 그대로 본다 ("무엇인지 적어 주세요")
  const checked: EntryDraft = custom ? { ...answered, name: custom.name } : answered
  const check: DraftCheck =
    dayCheck.ok || keepsUndated ? checkDraft({ ...checked, day: dayCheck.ok ? dayCheck.day : undefined }) : dayCheck
  const dirty = isDraftChanged(initial, answered) || dayText !== initialDayText
  const choices = choicesWithInitial(frequentChoices(), initial)
  const pickedName = draft.name.trim()

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  function change(next: Partial<EntryDraft>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  return (
    <div className="screen screen--groups entry" data-testid="edit-entry-form">
      <BackToLedger onBack={onBack} />
      <h1 className="screen__title">내역 고치기</h1>

      <section className="entry__part">
        <div className="entry__question-row">
          <h2 className="entry__question">며칠인가요?</h2>
          <MonthButton month={draft.month} onClick={() => sheets.openSheet(ENTRY_MONTH_SHEET)} />
        </div>
        <DayInput label="며칠인가요?" value={dayText} onChange={(text) => setDayText(tidyDayText(text))} />
        {initial.day === undefined && <p className="screen__note">날짜 없이 적은 예전 내역이에요. 비워 둬도 저장돼요</p>}
      </section>

      <section className="entry__part">
        <h2 className="entry__question">무엇인가요?</h2>
        <OptionList
          label="자주 쓴 항목"
          options={itemOptions(choices)}
          // 직접 적기 칸이 열려 있는 동안은 체크를 지운다 (같은 이름이 두 번 보이지 않게, 점검 12)
          value={custom === null && choices.some((choice) => choice.name === pickedName) ? pickedName : null}
          onChange={(name) => {
            // 이름과 함께 그 항목을 마지막으로 쓴 종류를 고른다 (AC-4, AC-32). 직접 적기 칸은 닫고 적던 글자는 지운다
            const choice = choices.find((item) => item.name === name)
            if (choice) change({ name: choice.name, type: choice.type })
            setCustom(null)
          }}
          action={{
            label: '직접 적기',
            icon: 'pen',
            expanded: custom !== null,
            // 열면 빈 이름 칸 + 지금 내역의 종류로 골라진 스위치, 다시 누르면 닫고 적던 글자를 지운다
            onClick: () => setCustom(custom === null ? { name: '', type: draft.type } : null),
            panel: custom && (
              <>
                {/* 칸 이름은 다른 질문처럼 보이지 않게 보조 이름으로 낮춘다 (#42) */}
                <TextField
                  label="무엇인지 적어 주세요"
                  labelRole="label"
                  value={custom.name}
                  placeholder="예: 꽃값"
                  onChange={(name) => setCustom({ ...custom, name })}
                />
                <div className="entry__field">
                  {/* 보이는 이름. 화면 읽기는 스위치 묶음 이름으로 한 번만 읽는다 */}
                  <p className="entry__field-label" aria-hidden="true">
                    수입인가요, 지출인가요?
                  </p>
                  <SegmentedControl
                    label="수입인가요, 지출인가요?"
                    options={TYPE_SEGMENTS}
                    value={custom.type ?? null}
                    onChange={(type) => setCustom({ ...custom, type })}
                  />
                </div>
              </>
            ),
          }}
        />
        <p className="screen__note">항목을 고르면 수입·지출도 같이 바뀌어요</p>
      </section>

      <section className="entry__part">
        <h2 className="entry__question">얼마인가요?</h2>
        <AmountDisplay label="얼마인가요?" value={draft.amount} onChange={(amount) => change({ amount })} />
      </section>

      {/* 지우기는 적는 흐름과 다른 큰 구획이라 질문 묶음보다 더 띄운다 */}
      <div className="entry__danger-zone">
        <Button variant="danger-text" onClick={() => sheets.openDialog(DELETE_DIALOG)}>
          이 내역 지우기
        </Button>
        <ConfirmDialog
          open={sheets.dialog === DELETE_DIALOG}
          title="이 내역을 정말 지울까요?"
          confirmLabel="지우기"
          danger
          onConfirm={onDelete}
          onCancel={sheets.closeDialog}
        />
      </div>

      <BottomActionBar
        label="저장"
        icon="check"
        disabled={!check.ok}
        note={check.ok ? undefined : check.missing}
        onClick={() => {
          if (check.ok) onSave(check.input)
        }}
      />

      <EntryMonthSheet
        sheets={sheets}
        month={draft.month}
        currentMonth={currentMonth}
        onChange={(month) => {
          change({ month })
          // 칸의 날이 바꾼 달에 없으면(31일 → 2월) 비워 다시 적게 한다
          setDayText(dayTextForMonth(year, month, dayText))
        }}
      />
    </div>
  )
}
