import { useEffect, useState } from 'react'
import type { EntryInput, FrequentChoice } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'
import { AmountDisplay } from '../../ui/AmountDisplay'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { OptionList } from '../../ui/OptionList'
import { PickRow } from '../../ui/PickRow'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { TextField } from '../../ui/TextField'
import { BackToLedger } from '../BackToLedger'
import type { SheetHistory } from '../useScreenHistory'
import { EntryDateSheet, ENTRY_DATE_SHEET } from './EntryDateSheet'
import { checkDraft, isDraftChanged, type EntryDraft } from './entryDraft'
import { itemOptions, TYPE_SEGMENTS } from './entryOptions'
import './entry.css'

type EditEntryFormProps = {
  // 장부 연도 (그 달 마지막 날, 2월 윤년)
  year: number
  // 고칠 기록의 처음 값. 날짜 없는 예전 기록이면 day 가 undefined
  initial: EntryDraft
  // 이번 달·오늘 (날짜 선택 창 테두리). 올해 장부가 아니면 주지 않는다
  currentMonth?: number
  currentDay?: number
  // 자주 쓴 항목 목록. 고른 종류의 항목만
  frequentChoices: (type?: EntryType) => FrequentChoice[]
  sheets: SheetHistory
  onSave: (input: EntryInput) => void
  onBack: () => void
  // 처음 값에서 바뀐 것이 있는지 알린다. 바뀌었으면 닫기 전에 "적던 내용을 버릴까요?" 를 묻는다
  onDirtyChange?: (dirty: boolean) => void
  // 맨 아래 [이 내역 지우기] → 확인 후 불린다
  onDelete: () => void
}

// 날짜 줄 값: "10월 7일", 날짜 없는 예전 기록은 "10월 · 날짜 없음"
function dateLabel({ month, day }: EntryDraft): string {
  return day === undefined ? `${month}월 · 날짜 없음` : `${month}월 ${day}일`
}

// 내역 고치기 (SPEC-001): 값을 한눈에 봐야 해서 펼친 모양 — 날짜(한 줄 + 바꾸기 → 날짜 선택 창) / 수입·지출 스위치 /
// 항목 목록(지금 이름 체크) + 직접 적기 칸 / 금액, 질문 사이 넓은 간격, 맨 아래 [이 내역 지우기], 아래 고정 [저장].
// 날짜 없는 예전 기록은 날짜 없이 그대로 저장할 수 있다 (AC-25)
export function EditEntryForm({
  year,
  initial,
  currentMonth,
  currentDay,
  frequentChoices,
  sheets,
  onSave,
  onBack,
  onDirtyChange,
  onDelete,
}: EditEntryFormProps) {
  const [draft, setDraft] = useState(initial)
  const [askingDelete, setAskingDelete] = useState(false)
  const check = checkDraft(draft)
  const dirty = isDraftChanged(initial, draft)
  const choices = frequentChoices(draft.type)
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
        <h2 className="entry__question">며칠인가요?</h2>
        <PickRow icon="calendar" value={dateLabel(draft)} onClick={() => sheets.openSheet(ENTRY_DATE_SHEET)} />
      </section>

      <section className="entry__part">
        <h2 className="entry__question">수입인가요, 지출인가요?</h2>
        <SegmentedControl
          label="수입인가요, 지출인가요?"
          options={TYPE_SEGMENTS}
          value={draft.type ?? null}
          onChange={(type) => change({ type })}
        />
      </section>

      <section className="entry__part">
        <h2 className="entry__question">무엇인가요?</h2>
        {/* 답: 항목 목록 → "직접 적기" 칸. 칸 이름은 다른 질문처럼 보이지 않게 보조 이름으로 낮춘다 (#42) */}
        <div className="entry__answer">
          <OptionList
            label="자주 쓴 항목"
            options={itemOptions(choices)}
            value={choices.some((choice) => choice.name === pickedName) ? pickedName : null}
            onChange={(name) => {
              // 이름과 함께 그 항목을 마지막으로 쓴 종류를 고른다 (AC-4)
              const choice = choices.find((item) => item.name === name)
              if (choice) change({ name: choice.name, type: choice.type })
            }}
          />
          <TextField
            label="직접 적기"
            labelRole="label"
            value={draft.name}
            placeholder="예: 꽃값"
            onChange={(name) => change({ name })}
          />
        </div>
      </section>

      <section className="entry__part">
        <h2 className="entry__question">얼마인가요?</h2>
        <AmountDisplay label="얼마인가요?" value={draft.amount} onChange={(amount) => change({ amount })} />
      </section>

      {/* 지우기는 적는 흐름과 다른 큰 구획이라 질문 묶음보다 더 띄운다 */}
      <div className="entry__danger-zone">
        <Button variant="danger-text" onClick={() => setAskingDelete(true)}>
          이 내역 지우기
        </Button>
        <ConfirmDialog
          open={askingDelete}
          title="이 내역을 정말 지울까요?"
          confirmLabel="지우기"
          danger
          onConfirm={() => {
            setAskingDelete(false)
            onDelete()
          }}
          onCancel={() => setAskingDelete(false)}
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

      <EntryDateSheet
        sheets={sheets}
        year={year}
        month={draft.month}
        day={draft.day}
        currentMonth={currentMonth}
        currentDay={currentDay}
        onChange={change}
      />
    </div>
  )
}
