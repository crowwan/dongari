// 내역 적기 "하나씩 채우기" 단계 (SPEC-001 기록 입력, ADR 004). 화면과 떨어진 순수 상태 기계
//
//   day ─ 날 정함 → item ─ 항목 고름 ─────────────────────────────┬─ 회비 기록 + 명단 있는 장부 → payers ─ [다음] ──┐
//                   │                                             │                                 └ [이름 없이 적기] ┤
//                   └─ 직접 적기 → custom-name ─ 예전에 쓴 이름 ──┤                                                     ▼
//                                      │                          └─ 그 밖 ───────────────────────────────────────→ amount → [저장]
//                                      └─ 처음 쓰는 이름 → custom-type ─ 수입/지출 누름 ─┘                                │
//                                                                                    금액이 사람 수로 안 나눠짐 → "한 분씩 금액"(화면 위 칸)
//
// 공책 순서(날짜 → 항목 → 금액)대로 날짜(일)를 맨 처음 묻는다(v2.2). 달은 처음부터 정해져 있고(보던 달) "며칠인가요?" 에서 바꾼다.
// 날은 숫자 칸에 쳐서 [다음] 으로 정하거나 빠른 칩([오늘 7일]·[방금 5일])을 눌러 바로 정한다(#80, 날 격자 대신).
// "지금 적는 내역" 카드 날짜 줄 [바꾸기] 를 누르면 day 로 돌아갔다가(칸에 지금 날) 날을 정하면 하던 질문으로 돌아온다(항목·금액 유지).
// 항목 줄 [바꾸기] 를 누르면 item 으로 돌아간다(금액 유지). 새 이름의 수입/지출을 잘못 눌렀으면 이 길로 고친다
//
// 회비 적기 (SPEC-010 3절): 동아리·모임 장부이고 회원 명단에 한 분 이상 있으면(dues) 회비 기록(수입 + "회비"로 시작)을 고른 뒤
// "누가 냈어요?"(payers)를 묻는다. [다음] 은 금액을 고른 사람 수 × 월 회비로 채우고, [이름 없이 적기] 는 낸 분 없이 금액으로.
// 낸 분 줄 [바꾸기] 를 누르면 payers 로 돌아간다. [저장] 때 금액이 사람 수로 안 나눠떨어지면 저장하지 않고 "한 분씩 금액" 으로
// (entryToSave → shares), 거기서 정한 몫(set-shares)의 합이 금액이 된다. 조건이 안 맞으면 v2.7 과 똑같다
import { isDuesEntry } from '../../domain/dues'
import { isDayInMonth } from '../../domain/entryDate'
import type { EntryInput, FrequentChoice } from '../../domain/ledger'
import { ENTRY_AMOUNT_MAX, type EntryType, type Payer } from '../../domain/types'
import { formatAmount } from '../../ui/money'
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
import { payerShares } from './payerShares'

export type EntryStep = 'day' | 'item' | 'custom-name' | 'custom-type' | 'payers' | 'amount'

// "누가 냈어요?" 답 (SPEC-010 3절): 아직 안 물음 / [다음] 으로 고름 / [이름 없이 적기]
export type PayerAnswer = 'pending' | 'picked' | 'nameless'

export interface PayerDraft {
  memberIds: string[] // 체크한 분 (누른 순)
  answer: PayerAnswer
  // "한 분씩 금액" [이대로 할게요] 로 정한 몫. 고른 분·금액이 그대로일 때만 쓴다 (payerShares)
  shares: Payer[] | undefined
}

// "누가 냈어요?" 를 묻는 장부(동아리·모임 + 회원 명단 한 분 이상)의 그 해 월 회비 (없으면 undefined)
export type DuesContext = { fee: number | undefined }

const NO_PAYERS: PayerDraft = { memberIds: [], answer: 'pending', shares: undefined }

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
  // 회비 기록이면 "누가 냈어요?" 를 묻는 장부. 없으면 묻지 않는다 (명단이 빈 장부·개인 가계부, v2.7 과 같음)
  dues: DuesContext | undefined
  // 낸 분. 연달아 적을 때 다음 내역으로 넘기지 않는다 (화면을 처음 상태로 다시 그린다)
  payers: PayerDraft
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
  // 새 이름의 수입/지출: 항목 고르기처럼 누르면 바로 금액으로 (#111)
  | { kind: 'pick-type'; entryType: EntryType }
  | { kind: 'change-amount'; amount: number }
  | { kind: 'revisit-item' }
  // "누가 냈어요?": 체크/해제 · 빠른 고르기 [지난번 낸 분]·[모두] (그 분들로 바꿈) · [다음] · [이름 없이 적기] · 낸 분 줄 [바꾸기]
  | { kind: 'toggle-payer'; memberId: string }
  | { kind: 'pick-payers'; memberIds: string[] }
  | { kind: 'submit-payers' }
  | { kind: 'skip-payers' }
  | { kind: 'revisit-payers' }
  // "한 분씩 금액" [이대로 할게요]: 그 몫의 합이 기록 금액이 된다
  | { kind: 'set-shares'; shares: Payer[] }

// "지금 적는 내역" 카드 답한 줄 (위에서부터 날짜 / 항목 / 낸 분). 날짜 줄은 날을 고르기 전에는 달만 ("10월" → "10월 7일").
// 항목 줄은 이름과 수입/지출을 한 줄에 ("대관료 · 지출"). 낸 분 줄은 "누가 냈어요?" 에 답한 뒤 (고른 분, 또는 이름 없이)
export type AnswerRow =
  | { kind: 'date'; month: number; day: number | undefined }
  | { kind: 'item'; name: string; type: EntryType | undefined }
  | { kind: 'payers'; memberIds: string[]; nameless: boolean }

// 지금 단계의 아래 고정 버튼. missing 이 있으면 비활성 + 버튼 위 안내 (AC-5). note: 누를 수 있을 때 버튼 위 안내 ("4명 · 80,000원 (한 분 20,000원)")
export type StepButton = { label: '다음' | '저장'; missing: string | undefined; note?: string }

// "며칠인가요?" 빠른 칩: [오늘 7일] / [방금 5일]
export type QuickDay = { kind: 'today' | 'recent'; day: number }

// 오늘·방금 저장한 내역의 날짜. 방금 저장한 내역은 날짜 없는 일이 없지만 EntryInput 모양 그대로 받는다
type MonthDay = { month: number; day?: number }

export function startSteps({ year, month, dues }: { year: number; month: number; dues?: DuesContext }): StepState {
  return { step: 'day', year, draft: emptyDraft(month), dayText: '', customName: '', afterDay: 'item', dues, payers: NO_PAYERS }
}

// 지금 고른 항목이면 "누가 냈어요?" 를 묻는가 (SPEC-010 3절 조건)
function asksPayers({ dues }: StepState, draft: EntryDraft): boolean {
  return dues !== undefined && draft.type !== undefined && isDuesEntry({ type: draft.type, name: draft.name })
}

// 항목을 정한 뒤: 회비 기록이면 "누가 냈어요?", 아니면 금액 (회비가 아니게 됐으면 고른 분은 버린다)
function afterItem(state: StepState, draft: EntryDraft): StepState {
  if (asksPayers(state, draft)) return { ...state, step: 'payers', draft }
  return { ...state, step: 'amount', draft, payers: NO_PAYERS }
}

// [다음] 이 채우는 금액: 고른 사람 수 × 월 회비. 월 회비가 없으면(또는 상한을 넘으면) 적던 금액 그대로 (처음엔 빈칸)
function filledAmount({ dues, draft }: StepState, count: number): number {
  const filled = dues?.fee === undefined ? undefined : dues.fee * count
  return filled === undefined || filled > ENTRY_AMOUNT_MAX ? draft.amount : filled
}

function toggled(memberIds: readonly string[], memberId: string): string[] {
  return memberIds.includes(memberId) ? memberIds.filter((id) => id !== memberId) : [...memberIds, memberId]
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
      return afterItem(state, { ...draft, name: action.choice.name, type: action.choice.type })
    case 'start-custom':
      return { ...state, step: 'custom-name' }
    case 'type-custom-name':
      return { ...state, customName: action.name }
    case 'submit-custom-name': {
      const name = state.customName.trim()
      if (name === '') return state
      if (action.knownType !== undefined) return afterItem(state, { ...draft, name, type: action.knownType })
      // 처음 쓰는 이름: 종류는 기본값 없이 묻는다
      return { ...state, step: 'custom-type', draft: { ...draft, name, type: undefined } }
    }
    case 'pick-type':
      // 이름을 정하기 전이면 넘어가지 않는다 (이름 칸의 [다음] 비활성 + "무엇인지 적어 주세요" 그대로)
      if (draft.name === '') return state
      return afterItem(state, { ...draft, type: action.entryType })
    case 'change-amount':
      return { ...state, draft: { ...draft, amount: action.amount } }
    case 'revisit-item':
      return { ...state, step: 'item' }
    case 'toggle-payer':
      return { ...state, payers: { ...state.payers, memberIds: toggled(state.payers.memberIds, action.memberId) } }
    case 'pick-payers':
      return { ...state, payers: { ...state.payers, memberIds: [...action.memberIds] } }
    case 'submit-payers': {
      // 아무도 안 골랐으면 [다음] 이 비활성이다
      const count = state.payers.memberIds.length
      if (state.step !== 'payers' || count === 0) return state
      return {
        ...state,
        step: 'amount',
        draft: { ...draft, amount: filledAmount(state, count) },
        payers: { ...state.payers, answer: 'picked', shares: undefined },
      }
    }
    case 'skip-payers':
      if (state.step !== 'payers') return state
      return { ...state, step: 'amount', payers: { ...state.payers, answer: 'nameless', shares: undefined } }
    case 'revisit-payers':
      return asksPayers(state, draft) ? { ...state, step: 'payers' } : state
    case 'set-shares': {
      const amount = action.shares.reduce((sum, share) => sum + share.amount, 0)
      return {
        ...state,
        draft: { ...draft, amount },
        payers: { ...state.payers, memberIds: action.shares.map((share) => share.memberId), shares: [...action.shares] },
      }
    }
  }
}

// 저장할 내역(낸 분 빼고). 새로 적는 내역은 날짜(일)가 꼭 있어야 한다 (AC-24, 고치기와 다르게 날짜 없이 저장하지 않는다)
export function stepInput({ draft }: StepState): DraftCheck {
  if (draft.day === undefined) return { ok: false, missing: '며칠인지 적어 주세요' }
  return checkDraft(draft)
}

// [저장] 을 누르면: 빠진 것이 있음 / 낸 분 몫을 못 정해 "한 분씩 금액" 으로 / 이 내역(낸 분 포함)을 저장
export type EntrySave = { kind: 'missing'; missing: string } | { kind: 'shares' } | { kind: 'save'; input: EntryInput }

// 낸 분을 고른 회비 기록은 몫까지 정한다 (SPEC-010 3절): 한 분씩 정한 몫 → 사람 수로 똑같이 나눈 몫 → 못 정하면 "한 분씩 금액"
export function entryToSave(state: StepState): EntrySave {
  const check = stepInput(state)
  if (!check.ok) return { kind: 'missing', missing: check.missing }
  const { memberIds, answer, shares } = state.payers
  if (!asksPayers(state, state.draft) || answer !== 'picked' || memberIds.length === 0) return { kind: 'save', input: check.input }
  const payers = payerShares(memberIds, check.input.amount, { shares })
  return payers ? { kind: 'save', input: { ...check.input, payers } } : { kind: 'shares' }
}

// "누가 냈어요?" 아래 안내 (SPEC-010 3절): "4명 · 80,000원 (한 분 20,000원)", 월 회비가 없으면 "4명"
export function payersSummary(count: number, fee: number | undefined): string {
  if (fee === undefined) return `${count}명`
  return `${count}명 · ${formatAmount(count * fee)}원 (한 분 ${formatAmount(fee)}원)`
}

// 항목 고르기·새 이름의 수입/지출 단계는 누르면 바로 넘어가서 버튼이 없다(#111). "며칠인가요?" 는 숫자 칸이라 [다음] (빈칸·없는 날이면 비활성 + 안내)
export function stepButton(state: StepState): StepButton | null {
  const { step, draft, customName } = state
  switch (step) {
    case 'day': {
      const check = checkDayText(state.year, draft.month, state.dayText)
      return { label: '다음', missing: check.ok ? undefined : check.missing }
    }
    case 'item':
    case 'custom-type':
      return null
    case 'custom-name':
      return { label: '다음', missing: customName.trim() === '' ? '무엇인지 적어 주세요' : undefined }
    case 'payers': {
      const count = state.payers.memberIds.length
      if (count === 0) return { label: '다음', missing: '누가 냈는지 골라 주세요' }
      return { label: '다음', missing: undefined, note: payersSummary(count, state.dues?.fee) }
    }
    case 'amount': {
      const save = entryToSave(state)
      return { label: '저장', missing: save.kind === 'missing' ? save.missing : undefined }
    }
  }
}

// 답한 것만 카드에. 지금 묻고 있는 값(이름 적기 중인 이름, 고르는 중인 낸 분)은 올리지 않는다. 새 이름의 종류는 고르면 바로 금액으로 가서 묻는 동안엔 비어 있다
export function answerRows(state: StepState): AnswerRow[] {
  const { step, draft, payers } = state
  const rows: AnswerRow[] = [{ kind: 'date', month: draft.month, day: draft.day }]
  if (draft.name !== '' && step !== 'custom-name') {
    rows.push({ kind: 'item', name: draft.name, type: draft.type })
  }
  const nameless = payers.answer === 'nameless'
  const answered = nameless || (payers.answer === 'picked' && payers.memberIds.length > 0)
  if (step !== 'payers' && answered && asksPayers(state, draft)) {
    rows.push({ kind: 'payers', memberIds: nameless ? [] : payers.memberIds, nameless })
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
