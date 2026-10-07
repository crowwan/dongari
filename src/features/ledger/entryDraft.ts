// 입력 중인 기록과 저장 가능 여부 (SPEC-001 기록 입력)
import { daysInMonth, isDayInMonth } from '../../domain/entryDate'
import type { EntryInput } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'

// 날짜(일)·수입/지출은 기본값이 없어 고르기 전엔 undefined(날짜 없는 예전 기록을 고칠 때도 undefined), 금액 0 은 빈칸
export interface EntryDraft {
  month: number
  day: number | undefined
  type: EntryType | undefined
  name: string
  amount: number
}

// 새 기록: 장부에서 보던 달만 채운 빈 입력 (날은 매번 묻는다, 미리 채우지 않음)
export function emptyDraft(month: number): EntryDraft {
  return { month, day: undefined, type: undefined, name: '', amount: 0 }
}

// 처음 값에서 하나라도 바뀌었나 (적던 내용을 버릴지 물을 때)
export function isDraftChanged(initial: EntryDraft, draft: EntryDraft): boolean {
  return (
    initial.month !== draft.month ||
    initial.day !== draft.day ||
    initial.type !== draft.type ||
    initial.name !== draft.name ||
    initial.amount !== draft.amount
  )
}

// 다 채웠으면 저장할 기록, 빠진 게 있으면 위에서부터 첫 번째 빠진 것의 안내 (AC-5)
export type DraftCheck = { ok: true; input: EntryInput } | { ok: false; missing: string }

// 날짜는 보지 않는다: 고치기는 날짜 없는 예전 기록을 그대로 저장할 수 있고(AC-25), 새로 적기는 entrySteps.stepInput 이 먼저 본다
export function checkDraft({ month, day, type, name, amount }: EntryDraft): DraftCheck {
  if (type === undefined) return { ok: false, missing: '수입인지 지출인지 골라 주세요' }
  if (name.trim() === '') return { ok: false, missing: '무엇인지 적어 주세요' }
  if (amount === 0) return { ok: false, missing: '얼마인지 적어 주세요' }
  const input: EntryInput = { month, type, name, amount }
  return { ok: true, input: day === undefined ? input : { ...input, day } }
}

// 날 숫자 칸 (AC-24, v2.2 #80): 숫자만 두 자리까지 ("7일" 을 붙여 넣어도 "7")
export function tidyDayText(text: string): string {
  return text.replace(/\D/g, '').slice(0, 2)
}

export type DayTextCheck = { ok: true; day: number } | { ok: false; missing: string }

// 날 숫자 칸 글자를 그 달의 날로 읽는다. 빈칸이면 "며칠인지 적어 주세요", 그 달에 없는 날(0, 32, 2월 30일)이면 "10월은 31일까지 있어요"
export function checkDayText(year: number, month: number, text: string): DayTextCheck {
  if (text === '') return { ok: false, missing: '며칠인지 적어 주세요' }
  const day = Number(text)
  if (!isDayInMonth(year, month, day)) return { ok: false, missing: `${month}월은 ${daysInMonth(year, month)}일까지 있어요` }
  return { ok: true, day }
}

// 달을 바꿨을 때 칸의 날이 그 달에 없으면(31일 → 2월) 비운다. 빈칸·그 달에 있는 날은 그대로
export function dayTextForMonth(year: number, month: number, text: string): string {
  return text === '' || checkDayText(year, month, text).ok ? text : ''
}
