import { describe, expect, it } from 'vitest'
import { isDuesEntry, isEvenSplit, splitEvenly } from './dues'

describe('SPEC-010 회비 기록 판정 ("말": 수입이면서 항목 이름이 "회비"로 시작)', () => {
  it.each([
    ['회비', '회비'],
    ['회비(14인)', '회비(14인)'],
    ['앞뒤 띄어쓰기는 무시한다', ' 회비 '],
  ])('수입 기록이면 회비 기록이다: %s', (_label, name) => {
    expect(isDuesEntry({ type: 'income', name })).toBe(true)
  })

  it.each([
    ['지출 "회비" (상급 단체에 내는 돈)', 'expense', '회비'],
    ['수입 "찬조금"', 'income', '찬조금'],
    ['수입 "월회비" ("회비"로 시작하지 않음)', 'income', '월회비'],
  ] as const)('회비 기록이 아니다: %s', (_label, type, name) => {
    expect(isDuesEntry({ type, name })).toBe(false)
  })
})

describe('SPEC-010 낸 분 똑같이 나누기 (3절)', () => {
  it('금액이 사람 수로 나눠떨어지면 한 분 몫이 같은 낸 분 목록이 된다', () => {
    expect(splitEvenly(['m1', 'm2', 'm3', 'm4'], 80_000)).toEqual([
      { memberId: 'm1', amount: 20_000 },
      { memberId: 'm2', amount: 20_000 },
      { memberId: 'm3', amount: 20_000 },
      { memberId: 'm4', amount: 20_000 },
    ])
  })

  it.each([
    ['나눠떨어지지 않음', ['m1', 'm2', 'm3'], 50_000],
    ['한 분 몫이 1원도 안 됨', ['m1', 'm2'], 1],
    ['아무도 없음', [], 20_000],
  ])('똑같이 나눌 수 없으면 없다: %s', (_label, memberIds, amount) => {
    expect(splitEvenly(memberIds, amount)).toBeUndefined()
  })

  it('낸 분이 모두 같은 금액이면 똑같이 나눈 것이다', () => {
    expect(
      isEvenSplit([
        { memberId: 'm1', amount: 20_000 },
        { memberId: 'm2', amount: 20_000 },
      ]),
    ).toBe(true)
    expect(
      isEvenSplit([
        { memberId: 'm1', amount: 20_000 },
        { memberId: 'm2', amount: 120_000 },
      ]),
    ).toBe(false)
  })
})
