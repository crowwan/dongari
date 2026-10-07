import { useEffect, useReducer, type ReactNode } from 'react'
import { itemIcon } from '../../domain/itemIcon'
import type { EntryInput, FrequentChoice } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'
import { AmountDisplay } from '../../ui/AmountDisplay'
import { AnswerChip } from '../../ui/AnswerChip'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { IconButton } from '../../ui/IconButton'
import { OptionList } from '../../ui/OptionList'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { TextField } from '../../ui/TextField'
import { BackToLedger } from '../BackToLedger'
import type { SheetHistory } from '../useScreenHistory'
import { checkDraft } from './entryDraft'
import { EntryMonthSheet } from './EntryMonthSheet'
import { ENTRY_MONTH_SHEET, itemOptions, TYPE_LABELS, TYPE_SEGMENTS } from './entryOptions'
import {
  answerChips,
  isStepDirty,
  startSteps,
  stepButton,
  stepReducer,
  type AnswerChipKind,
  type StepAction,
  type StepState,
} from './entrySteps'
import './entry.css'

type AddEntryFormProps = {
  // 장부에서 보던 달 (달 알약 기본값, AC-3)
  month: number
  // 이번 달 (달 선택 창 테두리). 올해 장부가 아니면 주지 않는다
  currentMonth?: number
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

// 내역 적기 (SPEC-001 기록 입력, ADR 004): 지금 할 질문 하나만 보이고, 답은 위쪽 알약으로 쌓인다.
// 무엇인가요?(항목 목록 / 직접 적기 → 처음 쓰는 이름이면 수입·지출) → 얼마인가요? → [저장]. 단계 상태는 entrySteps 순수 함수
export function AddEntryForm({
  month,
  currentMonth,
  frequentChoices,
  lastUsedType,
  sheets,
  onSave,
  onBack,
  onDirtyChange,
}: AddEntryFormProps) {
  const [state, dispatch] = useReducer(stepReducer, month, startSteps)
  const { draft } = state
  const dirty = isStepDirty(state, month)
  const button = stepButton(state)

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  function pressButton() {
    switch (state.step) {
      case 'custom-name':
        dispatch({ kind: 'submit-custom-name', knownType: lastUsedType(state.customName) })
        return
      case 'custom-type':
        dispatch({ kind: 'submit-type' })
        return
      case 'amount': {
        const check = checkDraft(draft)
        if (check.ok) onSave(check.input)
        return
      }
      case 'item':
        return
    }
  }

  // 위쪽 답 알약: 달 → 달 선택 창, 종류·항목 → 항목 고르기로 (AC-16)
  const chips: Record<AnswerChipKind, ReactNode> = {
    month: (
      <AnswerChip key="month" icon="calendar" onClick={() => sheets.openSheet(ENTRY_MONTH_SHEET)}>
        {`${draft.month}월`}
      </AnswerChip>
    ),
    type: draft.type && (
      <AnswerChip key="type" icon={draft.type} onClick={() => dispatch({ kind: 'revisit-item' })}>
        {TYPE_LABELS[draft.type]}
      </AnswerChip>
    ),
    name: (
      <AnswerChip key="name" icon={itemIcon(draft.name)} onClick={() => dispatch({ kind: 'revisit-item' })}>
        {draft.name}
      </AnswerChip>
    ),
  }

  return (
    <div className="screen entry" data-testid="add-entry-form" data-step={state.step}>
      <BackToLedger onBack={onBack} />
      <h1 className="screen__title">내역 적기</h1>
      <div className="entry__answers" data-testid="entry-answers">
        {answerChips(state).map((kind) => chips[kind])}
      </div>

      {/* 질문이 바뀔 때마다 새로 그려 autoFocus 칸이 포커스를 받는다 */}
      <section className="entry__part" key={state.step}>
        <StepQuestion state={state} frequentChoices={frequentChoices} dispatch={dispatch} onSubmit={pressButton} />
      </section>

      {button && (
        <BottomActionBar
          label={button.label}
          icon={button.label === '저장' ? 'check' : undefined}
          disabled={button.missing !== undefined}
          note={button.missing}
          onClick={pressButton}
        />
      )}

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
}

// 지금 단계의 질문 하나와 답하는 자리
function StepQuestion({ state, frequentChoices, dispatch, onSubmit }: StepQuestionProps) {
  const { draft } = state
  switch (state.step) {
    case 'item': {
      const choices = frequentChoices()
      return (
        <>
          <h2 className="entry__question">
            무엇인가요?
          </h2>
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
