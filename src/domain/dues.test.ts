import { describe, expect, it } from 'vitest'
import { isDuesEntry } from './dues'

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
