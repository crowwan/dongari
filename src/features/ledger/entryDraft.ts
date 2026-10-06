// 입력 중인 기록과 저장 가능 여부 (SPEC-001 기록 입력)
import type { EntryInput } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'

// 수입/지출은 기본값이 없어 고르기 전엔 undefined, 금액 0 은 빈칸
export interface EntryDraft {
  month: number
  type: EntryType | undefined
  name: string
  amount: number
}

// 새 기록: 장부에서 보던 달만 채운 빈 입력
export function emptyDraft(month: number): EntryDraft {
  return { month, type: undefined, name: '', amount: 0 }
}

// 처음 값에서 하나라도 바뀌었나 (적던 내용을 버릴지 물을 때)
export function isDraftChanged(initial: EntryDraft, draft: EntryDraft): boolean {
  return (
    initial.month !== draft.month ||
    initial.type !== draft.type ||
    initial.name !== draft.name ||
    initial.amount !== draft.amount
  )
}

// 다 채웠으면 저장할 기록, 빠진 게 있으면 위에서부터 첫 번째 빠진 것의 안내 (AC-5)
export type DraftCheck = { ok: true; input: EntryInput } | { ok: false; missing: string }

export function checkDraft({ month, type, name, amount }: EntryDraft): DraftCheck {
  if (type === undefined) return { ok: false, missing: '수입인지 지출인지 골라 주세요' }
  if (name.trim() === '') return { ok: false, missing: '무엇인지 적어 주세요' }
  if (amount === 0) return { ok: false, missing: '얼마인지 적어 주세요' }
  return { ok: true, input: { month, type, name, amount } }
}
