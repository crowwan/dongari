// 회비 (SPEC-010) 순수 함수
import type { Entry, Payer } from './types'

// 회비 기록 (SPEC-010 "말"): 수입이면서 항목 이름이 "회비"로 시작하는 기록("회비", "회비(14인)").
// 지출 "회비"(상급 단체에 내는 돈)는 아니다. 내역 적기 "누가 냈어요?"·회비 표·엑셀이 모두 이 판정 하나를 쓴다
export function isDuesEntry(entry: Pick<Entry, 'type' | 'name'>): boolean {
  return entry.type === 'income' && entry.name.trim().startsWith('회비')
}

// 기록 금액을 낸 분 사람 수로 똑같이 나눈 몫 (SPEC-010 3절). 아무도 없거나, 나눠떨어지지 않거나, 한 분 몫이 1원도 안 되면 없다
export function splitEvenly(memberIds: readonly string[], amount: number): Payer[] | undefined {
  if (memberIds.length === 0) return undefined
  const share = amount / memberIds.length
  if (!Number.isInteger(share) || share < 1) return undefined
  return memberIds.map((memberId) => ({ memberId, amount: share }))
}

// 낸 분이 모두 같은 금액을 냈나 (고치기에서 금액을 바꿀 때 똑같이 다시 나눠도 되는지, SPEC-010 3절)
export function isEvenSplit(payers: readonly Payer[]): boolean {
  return new Set(payers.map((payer) => payer.amount)).size <= 1
}
