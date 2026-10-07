// 내역 적기 "하나씩 채우기" 단계 (SPEC-001 기록 입력, ADR 004). 화면과 떨어진 순수 상태 기계
//
//   item ─ 항목 고름 ──────────────────────────────┐
//    │                                              ▼
//    └─ 직접 적기 → custom-name ─ 예전에 쓴 이름 ─→ amount → [저장]
//                       │                           ▲
//                       └─ 처음 쓰는 이름 → custom-type ─ 고르고 [다음]
//
// 달은 처음부터 정해져 있고(보던 달) 어느 단계에서든 바꿀 수 있다. "지금 적는 내역" 카드 항목 줄 [바꾸기] 를 누르면 item 으로 돌아간다(금액 유지)
import type { FrequentChoice } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'
import { checkDraft, emptyDraft, isDraftChanged, type EntryDraft } from './entryDraft'

export type EntryStep = 'item' | 'custom-name' | 'custom-type' | 'amount'

export interface StepState {
  step: EntryStep
  draft: EntryDraft
  // 직접 적기 칸에 적는 중인 이름 ([다음] 을 누르면 draft.name 이 된다)
  customName: string
}

export type StepAction =
  | { kind: 'change-month'; month: number }
  | { kind: 'pick-item'; choice: FrequentChoice }
  | { kind: 'start-custom' }
  | { kind: 'type-custom-name'; name: string }
  // knownType: 그 이름을 예전에 쓴 종류. 처음 쓰는 이름이면 undefined (화면이 기록에서 찾아 넣는다)
  | { kind: 'submit-custom-name'; knownType: EntryType | undefined }
  | { kind: 'pick-type'; entryType: EntryType }
  | { kind: 'submit-type' }
  | { kind: 'change-amount'; amount: number }
  | { kind: 'revisit-item' }

// "지금 적는 내역" 카드 답한 줄 (위에서부터 달 / 항목). 항목 줄은 이름과 수입/지출을 한 줄에 ("대관료 · 지출")
export type AnswerRow = { kind: 'month'; month: number } | { kind: 'item'; name: string; type: EntryType | undefined }

// 지금 단계의 아래 고정 버튼. missing 이 있으면 비활성 + 버튼 위 안내 (AC-5)
export type StepButton = { label: '다음' | '저장'; missing: string | undefined }

export function startSteps(month: number): StepState {
  return { step: 'item', draft: emptyDraft(month), customName: '' }
}

export function stepReducer(state: StepState, action: StepAction): StepState {
  const { draft } = state
  switch (action.kind) {
    case 'change-month':
      return { ...state, draft: { ...draft, month: action.month } }
    case 'pick-item':
      return { ...state, step: 'amount', draft: { ...draft, name: action.choice.name, type: action.choice.type } }
    case 'start-custom':
      return { ...state, step: 'custom-name' }
    case 'type-custom-name':
      return { ...state, customName: action.name }
    case 'submit-custom-name': {
      const name = state.customName.trim()
      if (name === '') return state
      if (action.knownType !== undefined) return { ...state, step: 'amount', draft: { ...draft, name, type: action.knownType } }
      // 처음 쓰는 이름: 종류는 기본값 없이 묻는다
      return { ...state, step: 'custom-type', draft: { ...draft, name, type: undefined } }
    }
    case 'pick-type':
      return { ...state, draft: { ...draft, type: action.entryType } }
    case 'submit-type':
      if (draft.type === undefined) return state
      return { ...state, step: 'amount' }
    case 'change-amount':
      return { ...state, draft: { ...draft, amount: action.amount } }
    case 'revisit-item':
      return { ...state, step: 'item' }
  }
}

// 항목 고르기 단계는 누르면 바로 넘어가서 버튼이 없다
export function stepButton({ step, draft, customName }: StepState): StepButton | null {
  switch (step) {
    case 'item':
      return null
    case 'custom-name':
      return { label: '다음', missing: customName.trim() === '' ? '무엇인지 적어 주세요' : undefined }
    case 'custom-type':
      return { label: '다음', missing: draft.type === undefined ? '수입인지 지출인지 골라 주세요' : undefined }
    case 'amount': {
      const check = checkDraft(draft)
      return { label: '저장', missing: check.ok ? undefined : check.missing }
    }
  }
}

// 답한 것만 카드에. 지금 묻고 있는 값(이름 적기 중인 이름, 새 이름의 종류)은 올리지 않는다
export function answerRows({ step, draft }: StepState): AnswerRow[] {
  const rows: AnswerRow[] = [{ kind: 'month', month: draft.month }]
  if (draft.name !== '' && step !== 'custom-name') {
    rows.push({ kind: 'item', name: draft.name, type: step === 'custom-type' ? undefined : draft.type })
  }
  return rows
}

// 처음 상태(보던 달만 있음)에서 답한 것이 하나라도 있나 — 있으면 닫기 전에 "적던 내용을 버릴까요?"
export function isStepDirty(state: StepState, initialMonth: number): boolean {
  return isDraftChanged(emptyDraft(initialMonth), state.draft) || state.customName.trim() !== ''
}
