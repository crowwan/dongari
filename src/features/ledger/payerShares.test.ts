import { describe, expect, it } from 'vitest'
import { payerShares, startingShares } from './payerShares'

const FOUR = ['m1', 'm2', 'm3', 'm4']
const even = (ids: readonly string[], amount: number) => ids.map((memberId) => ({ memberId, amount }))
// 한 분(m4)만 12만 원을 낸 몫 (엑셀 "정하늘(12만원)")
const UNEVEN = [...even(['m1', 'm2', 'm3'], 20_000), { memberId: 'm4', amount: 120_000 }]

describe('SPEC-010 낸 분 몫 정하기 (3절)', () => {
  describe('저장할 몫', () => {
    it('AC-11 사람 수로 나눠떨어지면 똑같이 나눈다', () => {
      expect(payerShares(FOUR, 80_000)).toEqual(even(FOUR, 20_000))
      expect(payerShares(FOUR, 100_000)).toEqual(even(FOUR, 25_000))
    })

    it('AC-12 나눠떨어지지 않으면 정하지 못한다 ("한 분씩 금액"으로)', () => {
      expect(payerShares(FOUR, 90_001)).toBeUndefined()
    })

    it('AC-12 "한 분씩 금액"에서 정한 몫이 고른 분·금액과 맞으면 그 몫을 쓴다', () => {
      expect(payerShares(FOUR, 180_000, { shares: UNEVEN })).toEqual(UNEVEN)
    })

    it('한 분씩 정한 뒤 금액이나 고른 분이 바뀌면 그 몫은 쓰지 않는다', () => {
      expect(payerShares(FOUR, 200_000, { shares: UNEVEN })).toEqual(even(FOUR, 50_000))
      expect(payerShares(['m1', 'm2', 'm3'], 180_000, { shares: UNEVEN })).toEqual(even(['m1', 'm2', 'm3'], 60_000))
    })

    describe('고치기 (원래 낸 분이 있을 때)', () => {
      it('AC-15 낸 분·금액이 그대로면 서로 다른 원래 몫을 그대로 둔다', () => {
        expect(payerShares(['m4', 'm1', 'm2', 'm3'], 180_000, { before: UNEVEN })).toEqual(UNEVEN)
      })

      it('AC-15 원래 모두 같은 몫이었으면 바뀐 금액·사람 수로 똑같이 다시 나눈다', () => {
        expect(payerShares(FOUR, 100_000, { before: even(FOUR, 20_000) })).toEqual(even(FOUR, 25_000))
        expect(payerShares(['m1', 'm2'], 40_000, { before: even(FOUR, 20_000) })).toEqual(even(['m1', 'm2'], 20_000))
      })

      it('AC-15 원래 몫이 서로 달랐는데 금액이나 사람이 바뀌면 "한 분씩 금액"으로 묻는다', () => {
        expect(payerShares(FOUR, 200_000, { before: UNEVEN })).toBeUndefined()
        expect(payerShares(['m1', 'm2', 'm3'], 180_000, { before: UNEVEN })).toBeUndefined()
      })
    })
  })

  describe('"한 분씩 금액" 처음 값', () => {
    it('나눠떨어지면 똑같이 나눈 값', () => {
      expect(startingShares(FOUR, 80_000, 20_000)).toEqual(even(FOUR, 20_000))
    })

    it('나눠떨어지지 않으면 월 회비, 월 회비도 없으면 빈칸(0)', () => {
      expect(startingShares(FOUR, 90_001, 20_000)).toEqual(even(FOUR, 20_000))
      expect(startingShares(FOUR, 90_001, undefined)).toEqual(even(FOUR, 0))
    })

    it('이미 정한 몫(한 분씩 금액·고치기 원래 몫)이 있는 분은 그 몫', () => {
      expect(startingShares(FOUR, 90_001, 20_000, { shares: UNEVEN })).toEqual(UNEVEN)
      expect(startingShares([...FOUR, 'm5'], 90_001, 20_000, { before: UNEVEN })).toEqual([
        ...UNEVEN,
        { memberId: 'm5', amount: 20_000 },
      ])
    })
  })
})
