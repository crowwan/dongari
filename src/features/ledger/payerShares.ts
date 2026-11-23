// 낸 분 몫 정하기 (SPEC-010 3절): 내역 적기 [저장]·고치기 [저장] 이 저장할 몫, "한 분씩 금액" 화면의 처음 값
import { isEvenSplit, splitEvenly } from '../../domain/dues'
import type { Payer } from '../../domain/types'

type ShareSources = {
  // "한 분씩 금액" [이대로 할게요] 로 정한 몫
  shares?: readonly Payer[]
  // 고치기: 그 기록에 원래 있던 낸 분
  before?: readonly Payer[]
}

// 고른 분과 몫의 회원이 같고 몫의 합이 금액이면 그 몫을 그대로 쓸 수 있다
function fits(payers: readonly Payer[] | undefined, memberIds: readonly string[], amount: number): payers is readonly Payer[] {
  if (payers === undefined || payers.length !== memberIds.length) return false
  const ids = new Set(memberIds)
  return payers.every((payer) => ids.has(payer.memberId)) && payers.reduce((sum, payer) => sum + payer.amount, 0) === amount
}

// 저장할 몫. 못 정하면 undefined → 화면이 저장하지 않고 "한 분씩 금액" 으로 보낸다
// 1. "한 분씩 금액"에서 정한 몫이 고른 분·금액과 맞으면 그 몫
// 2. (고치기) 낸 분·금액이 그대로면 원래 몫 — 금액이 서로 달라도
// 3. 원래 몫이 없거나 모두 같았으면, 사람 수로 나눠떨어질 때 똑같이 나눈 몫
//    (원래 몫이 서로 달랐으면 누구 몫이 바뀌는지 몰라 "한 분씩 금액" 으로 묻는다)
export function payerShares(memberIds: readonly string[], amount: number, { shares, before }: ShareSources = {}): Payer[] | undefined {
  if (fits(shares, memberIds, amount)) return [...shares]
  if (fits(before, memberIds, amount)) return [...before]
  if (before !== undefined && !isEvenSplit(before)) return undefined
  return splitEvenly(memberIds, amount)
}

// "한 분씩 금액" 화면의 처음 몫 (SPEC-010 3절 "처음엔 월 회비 또는 똑같이 나눈 값"):
// 그 분의 정한 몫(한 분씩 금액·원래 몫) → 똑같이 나눈 값(나눠떨어질 때) → 월 회비 → 빈칸(0)
export function startingShares(
  memberIds: readonly string[],
  amount: number,
  fee: number | undefined,
  { shares, before }: ShareSources = {},
): Payer[] {
  const known = new Map([...(before ?? []), ...(shares ?? [])].map((payer) => [payer.memberId, payer.amount]))
  const even = splitEvenly(memberIds, amount)?.[0]?.amount
  return memberIds.map((memberId) => ({ memberId, amount: known.get(memberId) ?? even ?? fee ?? 0 }))
}
