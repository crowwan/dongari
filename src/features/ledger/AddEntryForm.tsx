import { useEffect, useReducer, useRef, type Ref } from 'react'
import { itemIcon } from '../../domain/itemIcon'
import type { EntryInput, FrequentChoice } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'
import { AmountDisplay } from '../../ui/AmountDisplay'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { EntryCard, type EntryCardRow } from '../../ui/EntryCard'
import { IconButton } from '../../ui/IconButton'
import { OptionList } from '../../ui/OptionList'
import { SavedEntries } from '../../ui/SavedEntries'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { TextField } from '../../ui/TextField'
import { BackToLedger } from '../BackToLedger'
import type { SheetHistory } from '../useScreenHistory'
import { checkDraft } from './entryDraft'
import { EntryMonthSheet } from './EntryMonthSheet'
import { ENTRY_MONTH_SHEET, itemOptions, TYPE_LABELS, TYPE_SEGMENTS } from './entryOptions'
import {
  answerRows,
  isStepDirty,
  startSteps,
  stepButton,
  stepReducer,
  type AnswerRow,
  type StepAction,
  type StepState,
} from './entrySteps'
import './entry.css'

type AddEntryFormProps = {
  // 장부에서 보던 달 ("지금 적는 내역" 카드 달 줄 기본값, AC-3). 연달아 적을 때는 마지막에 저장한 달
  month: number
  // 이번에 내역 적기 화면에 들어와 저장한 내역 (연달아 적기, AC-20). 저장할 때마다 App 이 이 화면을 처음 상태로 다시 그린다
  saved: EntryInput[]
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

// 내역 적기 (SPEC-001 기록 입력, ADR 004): 적는 내역 하나는 "지금 적는 내역" 카드 하나 — 답한 것은 카드 안 한 줄로 접히고,
// 지금 할 질문 하나만 같은 카드 맨 아래에 펼쳐진다(AC-23).
// 무엇인가요?(항목 목록 / 직접 적기 → 처음 쓰는 이름이면 수입·지출) → 얼마인가요? → [저장]. 단계 상태는 entrySteps 순수 함수
// 저장하면 장부로 가지 않고 "무엇인가요?" 부터 다음 내역을 묻는다(연달아 적기 v2.1). 맨 위 "장부에 넣었어요 · N건" 목록 + 아래 [다 적었어요]
export function AddEntryForm({
  month,
  saved,
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
  const continuing = saved.length > 0
  const questionRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  // 이어서 적을 때는 화면 읽기 초점을 새 질문 제목으로 (금액 칸이 사라져 키패드도 닫힌다)
  useEffect(() => {
    if (continuing) questionRef.current?.focus()
  }, [continuing])

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

  // "지금 적는 내역" 카드 답한 줄: [달 바꾸기] → 달 선택 창, [항목 바꾸기] → 항목 고르기로 (AC-16, 금액 유지)
  function cardRow(row: AnswerRow): EntryCardRow {
    switch (row.kind) {
      case 'month':
        return { label: '달', icon: 'calendar', value: `${row.month}월`, onChange: () => sheets.openSheet(ENTRY_MONTH_SHEET) }
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
          {/* 질문이 바뀔 때마다 새로 그려 autoFocus 칸이 포커스를 받는다 */}
          <div className="entry__part" key={state.step}>
            <StepQuestion
              state={state}
              frequentChoices={frequentChoices}
              dispatch={dispatch}
              onSubmit={pressButton}
              questionRef={questionRef}
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
      {/* 항목 고르기 단계(버튼 없음)에서만. 끝내기도 [← 장부로] 와 같은 길이라 적던 내용이 있으면 묻는다 (AC-21) */}
      {!button && continuing && <BottomActionBar variant="secondary" label="다 적었어요" onClick={onBack} />}

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
  // 항목 고르기 질문 제목 (이어서 적을 때 초점을 옮긴다)
  questionRef: Ref<HTMLHeadingElement>
}

// 지금 단계의 질문 하나와 답하는 자리
function StepQuestion({ state, frequentChoices, dispatch, onSubmit, questionRef }: StepQuestionProps) {
  const { draft } = state
  switch (state.step) {
    case 'item': {
      const choices = frequentChoices()
      return (
        <>
          <h2 className="entry__question" ref={questionRef} tabIndex={-1}>
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
