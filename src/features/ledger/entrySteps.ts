// 내역 적기 "하나씩 채우기" 단계 (SPEC-001 기록 입력, ADR 004). 화면과 떨어진 순수 상태 기계
//
//   day ─ 날 정함 → item ─ 항목 고름 ──────────────────────────────┐
//                   │                                              ▼
//                   └─ 직접 적기 → custom-name ─ 예전에 쓴 이름 ─→ amount → [저장]
//                                      │                           ▲
//                                      └─ 처음 쓰는 이름 → custom-type ─ 고르고 [다음]
//
// 공책 순서(날짜 → 항목 → 금액)대로 날짜(일)를 맨 처음 묻는다(v2.2). 달은 처음부터 정해져 있고(보던 달) "며칠인가요?" 에서 바꾼다.
// 날은 숫자 칸에 쳐서 [다음] 으로 정하거나 빠른 칩([오늘 7일]·[방금 5일])을 눌러 바로 정한다(#80, 날 격자 대신).
// "지금 적는 내역" 카드 날짜 줄 [바꾸기] 를 누르면 day 로 돌아갔다가(칸에 지금 날) 날을 정하면 하던 질문으로 돌아온다(항목·금액 유지).
// 항목 줄 [바꾸기] 를 누르면 item 으로 돌아간다(금액 유지)
import { isDayInMonth } from '../../domain/entryDate'
import type { FrequentChoice } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'
import {
  checkDayText,
  checkDraft,
  dayTextForMonth,
  emptyDraft,
  isDraftChanged,
  tidyDayText,
  type DraftCheck,
  type EntryDraft,
} from './entryDraft'

export type EntryStep = 'day' | 'item' | 'custom-name' | 'custom-type' | 'amount'

export interface StepState {
  step: EntryStep
  // 장부 연도 (그 달 마지막 날, 2월 윤년)
  year: number
  draft: EntryDraft
  // 날 숫자 칸에 친 글자 ([다음] 을 누르면 draft.day 가 된다). 연달아 적을 때도 매번 빈칸에서 시작한다
  dayText: string
  // 직접 적기 칸에 적는 중인 이름 ([다음] 을 누르면 draft.name 이 된다)
  customName: string
  // 날을 정하면 갈 질문: 처음엔 "무엇인가요?", 날짜 줄 [바꾸기] 로 왔으면 그때 하던 질문
  afterDay: Exclude<EntryStep, 'day'>
}

export type StepAction =
  | { kind: 'type-day'; text: string }
  | { kind: 'submit-day' }
  // 빠른 칩: 그 날로 정하고 바로 넘어간다
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

// "며칠인가요?" 빠른 칩: [오늘 7일] / [방금 5일]
export type QuickDay = { kind: 'today' | 'recent'; day: number }

// 오늘·방금 저장한 내역의 날짜. 방금 저장한 내역은 날짜 없는 일이 없지만 EntryInput 모양 그대로 받는다
type MonthDay = { month: number; day?: number }

export function startSteps({ year, month }: { year: number; month: number }): StepState {
  return { step: 'day', year, draft: emptyDraft(month), dayText: '', customName: '', afterDay: 'item' }
}

// 날을 정하고 하던 질문으로 (칸 글자도 그 날로 맞춘다)
function settleDay(state: StepState, day: number): StepState {
  return { ...state, step: state.afterDay, dayText: String(day), draft: { ...state.draft, day } }
}

export function stepReducer(state: StepState, action: StepAction): StepState {
  const { draft } = state
  switch (action.kind) {
    case 'type-day':
      return { ...state, dayText: tidyDayText(action.text) }
    case 'submit-day': {
      // 빈칸·그 달에 없는 날이면 [다음] 이 비활성이다. 키패드 [완료] 로 들어와도 넘어가지 않는다
      const check = checkDayText(state.year, draft.month, state.dayText)
      return check.ok ? settleDay(state, check.day) : state
    }
    case 'pick-day':
      // 칩은 지금 달에 있는 날만 낸다. 들어와도 그 달에 없는 날은 받지 않는다
      if (!isDayInMonth(state.year, draft.month, action.day)) return state
      return settleDay(state, action.day)
    case 'revisit-day':
      if (state.step === 'day') return state
      return { ...state, step: 'day', afterDay: state.step, dayText: draft.day === undefined ? '' : String(draft.day) }
    case 'change-month': {
      // 정한 날·친 날이 바꾼 달에 없으면(31일 → 2월) 비워 다시 묻는다
      const keepDay = draft.day !== undefined && isDayInMonth(state.year, action.month, draft.day)
      return {
        ...state,
        dayText: dayTextForMonth(state.year, action.month, state.dayText),
        draft: { ...draft, month: action.month, day: keepDay ? draft.day : undefined },
      }
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
  if (draft.day === undefined) return { ok: false, missing: '며칠인지 적어 주세요' }
  return checkDraft(draft)
}

// 항목 고르기 단계는 누르면 바로 넘어가서 버튼이 없다. "며칠인가요?" 는 숫자 칸이라 [다음] (빈칸·없는 날이면 비활성 + 안내)
export function stepButton(state: StepState): StepButton | null {
  const { step, draft, customName } = state
  switch (step) {
    case 'day': {
      const check = checkDayText(state.year, draft.month, state.dayText)
      return { label: '다음', missing: check.ok ? undefined : check.missing }
    }
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

// 처음 상태(보던 달만 있음)에서 답한 것이 하나라도 있나(날만 정해도, 날 숫자 칸·직접 적기 칸에 글자만 있어도) — 있으면 닫기 전에 "적던 내용을 버릴까요?"
export function isStepDirty(state: StepState, initialMonth: number): boolean {
  return isDraftChanged(emptyDraft(initialMonth), state.draft) || state.dayText !== '' || state.customName.trim() !== ''
}

// 연달아 적을 때 [다 적었어요] 를 둘 자리 (AC-21): 아래 버튼이 없는 항목 고르기, 또는 날 숫자 칸이 빈 "며칠인가요?".
// 날을 치기 시작하면 [다음] 으로 바뀐다 (두 버튼을 나란히 두지 않는다)
export function offersFinish({ step, dayText }: StepState): boolean {
  return step === 'item' || (step === 'day' && dayText === '')
}

// "며칠인가요?" 빠른 칩 (AC-24): 올해 장부의 이번 달이면 [오늘 N일], 방금 저장한 내역이 같은 달이면 [방금 N일].
// 두 날이 같으면 [방금 N일] 하나만. 지금 달에 없는 날은 내지 않는다
export function quickDays(
  { year, month }: { year: number; month: number },
  { today, recent }: { today?: MonthDay; recent?: MonthDay },
): QuickDay[] {
  const inMonth = (date: MonthDay | undefined): date is { month: number; day: number } =>
    date !== undefined && date.month === month && date.day !== undefined && isDayInMonth(year, month, date.day)
  const days: QuickDay[] = []
  if (inMonth(today) && !(inMonth(recent) && recent.day === today.day)) days.push({ kind: 'today', day: today.day })
  if (inMonth(recent)) days.push({ kind: 'recent', day: recent.day })
  return days
}
