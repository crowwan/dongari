// 내역 적기 "하나씩 채우기" 단계 (SPEC-001 기록 입력, ADR 004). 화면과 떨어진 순수 상태 기계
//
//   day ─ 날 고름 → item ─ 항목 고름 ──────────────────────────────┐
//                   │                                              ▼
//                   └─ 직접 적기 → custom-name ─ 예전에 쓴 이름 ─→ amount → [저장]
//                                      │                           ▲
//                                      └─ 처음 쓰는 이름 → custom-type ─ 고르고 [다음]
//
// 공책 순서(날짜 → 항목 → 금액)대로 날짜(일)를 맨 처음 묻는다(v2.2). 달은 처음부터 정해져 있고(보던 달) "며칠인가요?" 에서 바꾼다.
// "지금 적는 내역" 카드 날짜 줄 [바꾸기] 를 누르면 day 로 돌아갔다가 날을 고르면 하던 질문으로 돌아온다(항목·금액 유지).
// 항목 줄 [바꾸기] 를 누르면 item 으로 돌아간다(금액 유지)
import { isDayInMonth } from '../../domain/entryDate'
import type { FrequentChoice } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'
import { checkDraft, emptyDraft, isDraftChanged, type DraftCheck, type EntryDraft } from './entryDraft'

export type EntryStep = 'day' | 'item' | 'custom-name' | 'custom-type' | 'amount'

export interface StepState {
  step: EntryStep
  // 장부 연도 (그 달 마지막 날, 2월 윤년)
  year: number
  draft: EntryDraft
  // 직접 적기 칸에 적는 중인 이름 ([다음] 을 누르면 draft.name 이 된다)
  customName: string
  // 날을 고르면 갈 질문: 처음엔 "무엇인가요?", 날짜 줄 [바꾸기] 로 왔으면 그때 하던 질문
  afterDay: Exclude<EntryStep, 'day'>
}

export type StepAction =
  | { kind: 'pick-day'; day: number }
  | { kind: 'revisit-day' }
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

// "지금 적는 내역" 카드 답한 줄 (위에서부터 날짜 / 항목). 날짜 줄은 날을 고르기 전에는 달만 ("10월" → "10월 7일").
// 항목 줄은 이름과 수입/지출을 한 줄에 ("대관료 · 지출")
export type AnswerRow =
  | { kind: 'date'; month: number; day: number | undefined }
  | { kind: 'item'; name: string; type: EntryType | undefined }

// 지금 단계의 아래 고정 버튼. missing 이 있으면 비활성 + 버튼 위 안내 (AC-5)
export type StepButton = { label: '다음' | '저장'; missing: string | undefined }

export function startSteps({ year, month }: { year: number; month: number }): StepState {
  return { step: 'day', year, draft: emptyDraft(month), customName: '', afterDay: 'item' }
}

export function stepReducer(state: StepState, action: StepAction): StepState {
  const { draft } = state
  switch (action.kind) {
    case 'pick-day':
      // 그 달에 없는 날(2월 30일 등)은 격자에 없다. 들어와도 받지 않는다
      if (!isDayInMonth(state.year, draft.month, action.day)) return state
      return { ...state, step: state.afterDay, draft: { ...draft, day: action.day } }
    case 'revisit-day':
      if (state.step === 'day') return state
      return { ...state, step: 'day', afterDay: state.step }
    case 'change-month': {
      // 고른 날이 바꾼 달에 없으면(31일 → 2월) 날을 비워 다시 묻는다
      const keepDay = draft.day !== undefined && isDayInMonth(state.year, action.month, draft.day)
      return { ...state, draft: { ...draft, month: action.month, day: keepDay ? draft.day : undefined } }
    }
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

// 저장할 내역. 새로 적는 내역은 날짜(일)가 꼭 있어야 한다 (AC-24, 고치기와 다르게 날짜 없이 저장하지 않는다)
export function stepInput({ draft }: StepState): DraftCheck {
  if (draft.day === undefined) return { ok: false, missing: '며칠인지 골라 주세요' }
  return checkDraft(draft)
}

// 날 고르기·항목 고르기 단계는 누르면 바로 넘어가서 버튼이 없다
export function stepButton(state: StepState): StepButton | null {
  const { step, draft, customName } = state
  switch (step) {
    case 'day':
    case 'item':
      return null
    case 'custom-name':
      return { label: '다음', missing: customName.trim() === '' ? '무엇인지 적어 주세요' : undefined }
    case 'custom-type':
      return { label: '다음', missing: draft.type === undefined ? '수입인지 지출인지 골라 주세요' : undefined }
    case 'amount': {
      const check = stepInput(state)
      return { label: '저장', missing: check.ok ? undefined : check.missing }
    }
  }
}

// 답한 것만 카드에. 지금 묻고 있는 값(이름 적기 중인 이름, 새 이름의 종류)은 올리지 않는다
export function answerRows({ step, draft }: StepState): AnswerRow[] {
  const rows: AnswerRow[] = [{ kind: 'date', month: draft.month, day: draft.day }]
  if (draft.name !== '' && step !== 'custom-name') {
    rows.push({ kind: 'item', name: draft.name, type: step === 'custom-type' ? undefined : draft.type })
  }
  return rows
}

// 처음 상태(보던 달만 있음)에서 답한 것이 하나라도 있나(날만 골라도) — 있으면 닫기 전에 "적던 내용을 버릴까요?"
export function isStepDirty(state: StepState, initialMonth: number): boolean {
  return isDraftChanged(emptyDraft(initialMonth), state.draft) || state.customName.trim() !== ''
}
