import { useEffect, useReducer } from 'react'
import { itemIcon } from '../../domain/itemIcon'
import type { EntryInput, FrequentChoice } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'
import { AmountDisplay } from '../../ui/AmountDisplay'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { DayInput } from '../../ui/DayInput'
import { EntryCard, type EntryCardRow } from '../../ui/EntryCard'
import { IconButton } from '../../ui/IconButton'
import { MonthButton } from '../../ui/MonthButton'
import { OptionList } from '../../ui/OptionList'
import { SavedEntries } from '../../ui/SavedEntries'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { TextField } from '../../ui/TextField'
import { BackToLedger } from '../BackToLedger'
import type { SheetHistory } from '../useScreenHistory'
import { EntryMonthSheet } from './EntryMonthSheet'
import { ENTRY_MONTH_SHEET, itemOptions, TYPE_LABELS, TYPE_SEGMENTS } from './entryOptions'
import {
  answerRows,
  isStepDirty,
  offersFinish,
  quickDays,
  startSteps,
  stepButton,
  stepInput,
  stepReducer,
  type AnswerRow,
  type QuickDay,
  type StepAction,
  type StepState,
} from './entrySteps'
import './entry.css'

type AddEntryFormProps = {
  // 장부 연도 (그 달 마지막 날, 2월 윤년)
  year: number
  // 장부에서 보던 달 ("지금 적는 내역" 카드 날짜 줄 기본값, AC-3). 연달아 적을 때는 마지막에 저장한 달
  month: number
  // 이번에 내역 적기 화면에 들어와 저장한 내역 (연달아 적기, AC-20). 저장할 때마다 App 이 이 화면을 처음 상태로 다시 그린다
  saved: EntryInput[]
  // 이번 달 (달 선택 창 테두리)과 오늘 ([오늘 7일] 칩). 올해 장부가 아니면 주지 않는다
  currentMonth?: number
  currentDay?: number
  // 자주 쓴 항목. 종류를 고르기 전이라 두 종류를 섞어서 받는다
  frequentChoices: (type?: EntryType) => FrequentChoice[]
  // 직접 적은 이름을 예전에 쓴 종류. 처음 쓰는 이름이면 undefined (AC-15)
  lastUsedType: (name: string) => EntryType | undefined
  sheets: SheetHistory
  onSave: (input: EntryInput) => void
  onBack: () => void
  // 답한 것이 있는지 알린다. 있으면 닫기 전에 "적던 내용을 버릴까요?" 를 묻는다
  onDirtyChange?: (dirty: boolean) => void
}

// 내역 적기 (SPEC-001 기록 입력, ADR 004): 적는 내역 하나는 "지금 적는 내역" 카드 하나 — 답한 것은 카드 안 한 줄로 접히고,
// 지금 할 질문 하나만 같은 카드 맨 아래에 펼쳐진다(AC-23).
// 며칠인가요?(날 숫자 칸 + 빠른 칩, v2.2 #80) → 무엇인가요?(항목 목록 / 직접 적기 → 처음 쓰는 이름이면 수입·지출) → 얼마인가요? → [저장]. 단계 상태는 entrySteps 순수 함수
// 저장하면 장부로 가지 않고 "며칠인가요?" 부터 다음 내역을 묻는다(연달아 적기 v2.1, 날은 매번 빈칸에서 묻는다). 맨 위 "장부에 넣었어요 · N건" 목록 + 아래 [다 적었어요]
export function AddEntryForm({
  year,
  month,
  saved,
  currentMonth,
  currentDay,
  frequentChoices,
  lastUsedType,
  sheets,
  onSave,
  onBack,
  onDirtyChange,
}: AddEntryFormProps) {
  const [state, dispatch] = useReducer(stepReducer, { year, month }, startSteps)
  const { draft } = state
  const lastSaved = saved.at(-1)
  const dirty = isStepDirty(state, month)
  const continuing = saved.length > 0
  // 연달아 적는 중이면 아래 버튼이 없는 자리(날 칸이 빈 "며칠인가요?"·항목 고르기)에 [다 적었어요] (AC-21)
  const finishing = continuing && offersFinish(state)
  const button = finishing ? null : stepButton(state)

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  function pressButton() {
    switch (state.step) {
      case 'day':
        dispatch({ kind: 'submit-day' })
        return
      case 'custom-name':
        dispatch({ kind: 'submit-custom-name', knownType: lastUsedType(state.customName) })
        return
      case 'custom-type':
        dispatch({ kind: 'submit-type' })
        return
      case 'amount': {
        const check = stepInput(state)
        if (check.ok) onSave(check.input)
        return
      }
      case 'item':
        return
    }
  }

  // "지금 적는 내역" 카드 답한 줄: [날짜 바꾸기] → 며칠인가요?로 (AC-25, 항목·금액 유지), [항목 바꾸기] → 항목 고르기로 (AC-16, 금액 유지).
  // 날짜를 묻고 있는 동안 날짜 줄에는 [바꾸기] 가 없다 (질문 제목 옆 [10월 ▾] 로 달을 바꾼다)
  function cardRow(row: AnswerRow): EntryCardRow {
    switch (row.kind) {
      case 'date':
        return {
          label: '날짜',
          icon: 'calendar',
          value: row.day === undefined ? `${row.month}월` : `${row.month}월 ${row.day}일`,
          onChange: state.step === 'day' ? undefined : () => dispatch({ kind: 'revisit-day' }),
        }
      case 'item':
        return {
          label: '항목',
          icon: itemIcon(row.name),
          value: row.type ? `${row.name} · ${TYPE_LABELS[row.type]}` : row.name,
          onChange: () => dispatch({ kind: 'revisit-item' }),
        }
    }
  }

  return (
    <div className="screen screen--groups entry" data-testid="add-entry-form" data-step={state.step}>
      <BackToLedger onBack={onBack} />
      <h1 className="screen__title">내역 적기</h1>
      <div className="entry__now">
        {continuing && <SavedEntries entries={saved} />}
        <EntryCard rows={answerRows(state).map(cardRow)}>
          {/* 질문이 바뀔 때마다 새로 그려 autoFocus 칸이 포커스를 받는다 (이어서 적을 때도 날 숫자 칸 → 숫자 키패드) */}
          <div className="entry__part" key={state.step}>
            <StepQuestion
              state={state}
              frequentChoices={frequentChoices}
              dispatch={dispatch}
              onSubmit={pressButton}
              onPickMonth={() => sheets.openSheet(ENTRY_MONTH_SHEET)}
              quickDays={quickDays(
                { year, month: draft.month },
                {
                  today: currentMonth === undefined ? undefined : { month: currentMonth, day: currentDay },
                  recent: lastSaved,
                },
              )}
            />
          </div>
        </EntryCard>
      </div>

      {button && (
        <BottomActionBar
          label={button.label}
          icon={button.label === '저장' ? 'check' : undefined}
          disabled={button.missing !== undefined}
          note={button.missing}
          onClick={pressButton}
        />
      )}
      {/* 끝내기도 [← 장부로] 와 같은 길이라 적던 내용이 있으면 묻는다 (AC-21) */}
      {finishing && <BottomActionBar variant="secondary" label="다 적었어요" onClick={onBack} />}

      <EntryMonthSheet
        sheets={sheets}
        month={draft.month}
        currentMonth={currentMonth}
        onChange={(picked) => dispatch({ kind: 'change-month', month: picked })}
      />
    </div>
  )
}

type StepQuestionProps = {
  state: StepState
  frequentChoices: (type?: EntryType) => FrequentChoice[]
  dispatch: (action: StepAction) => void
  onSubmit: () => void
  // "며칠인가요?" 제목 옆 [10월 ▾] → 열두 달 선택 창
  onPickMonth: () => void
  // "며칠인가요?" 빠른 칩 ([오늘 7일]·[방금 5일]). 없으면 칩 줄을 숨긴다
  quickDays: QuickDay[]
}

const QUICK_DAY_TAGS = { today: '오늘', recent: '방금' } as const

// 지금 단계의 질문 하나와 답하는 자리
function StepQuestion({ state, frequentChoices, dispatch, onSubmit, onPickMonth, quickDays }: StepQuestionProps) {
  const { draft } = state
  switch (state.step) {
    case 'day':
      return (
        <>
          <div className="entry__question-row">
            <h2 className="entry__question">며칠인가요?</h2>
            <MonthButton month={draft.month} onClick={onPickMonth} />
          </div>
          {/* 키패드 [완료](Enter) 로도 [다음] 과 같이 넘어간다. 칩은 칸 바로 아래라 키패드가 떠도 칸 → 칩 → [다음] 순서로 보인다 (#70) */}
          <form
            className="entry__answer"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            <DayInput
              label="며칠인가요?"
              value={state.dayText}
              autoFocus
              onChange={(text) => dispatch({ kind: 'type-day', text })}
              chips={quickDays.map((quick) => ({ tag: QUICK_DAY_TAGS[quick.kind], day: quick.day }))}
              onPick={(day) => dispatch({ kind: 'pick-day', day })}
            />
          </form>
        </>
      )
    case 'item': {
      const choices = frequentChoices()
      return (
        <>
          <h2 className="entry__question">무엇인가요?</h2>
          <OptionList
            label="자주 쓴 항목"
            options={itemOptions(choices)}
            value={choices.some((choice) => choice.name === draft.name) ? draft.name : null}
            onChange={(name) => {
              const choice = choices.find((item) => item.name === name)
              if (choice) dispatch({ kind: 'pick-item', choice })
            }}
            action={{ label: '직접 적기', icon: 'pen', onClick: () => dispatch({ kind: 'start-custom' }) }}
          />
          <p className="screen__note">누르면 바로 다음으로 넘어가요</p>
        </>
      )
    }
    case 'custom-name':
      return (
        <>
          <h2 className="entry__question">
            무엇인가요?
          </h2>
          {/* 키패드 [완료](Enter) 로도 [다음] 과 같이 넘어간다 */}
          <form
            className="entry__answer"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            <TextField
              label="직접 적기"
              labelRole="label"
              value={state.customName}
              placeholder="예: 꽃값"
              autoFocus
              onChange={(name) => dispatch({ kind: 'type-custom-name', name })}
            />
          </form>
          <div className="entry__aside">
            <IconButton icon="left" onClick={() => dispatch({ kind: 'revisit-item' })}>
              목록에서 고르기
            </IconButton>
          </div>
        </>
      )
    case 'custom-type':
      return (
        <>
          <h2 className="entry__question">
            수입인가요, 지출인가요?
          </h2>
          <SegmentedControl
            label="수입인가요, 지출인가요?"
            options={TYPE_SEGMENTS}
            value={draft.type ?? null}
            onChange={(entryType) => dispatch({ kind: 'pick-type', entryType })}
          />
          <p className="screen__note">처음 쓰는 항목이라 한 번만 물어봐요. 다음부터는 목록에서 고르면 저절로 정해져요</p>
        </>
      )
    case 'amount':
      return (
        <>
          <h2 className="entry__question">
            얼마인가요?
          </h2>
          <AmountDisplay
            label="얼마인가요?"
            value={draft.amount}
            autoFocus
            onChange={(amount) => dispatch({ kind: 'change-amount', amount })}
          />
        </>
      )
  }
}
