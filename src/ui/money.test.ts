import { describe, expect, it } from 'vitest'
import { formatMoney, parseMoney, MONEY_MAX } from './money'

describe('금액 글자 변환', () => {
  it('숫자가 아닌 글자를 버리고 숫자로 읽는다', () => {
    expect(parseMoney('12,300원')).toBe(12300)
  })

  it('빈칸이면 0 으로 읽는다', () => {
    expect(parseMoney('')).toBe(0)
  })

  it('상한 999,999,999 를 넘으면 상한으로 자른다', () => {
    expect(parseMoney('1234567890')).toBe(MONEY_MAX)
    expect(MONEY_MAX).toBe(999_999_999)
  })

  it('천 단위 콤마를 붙여 보여준다', () => {
    expect(formatMoney(1234567)).toBe('1,234,567')
  })

  it('0 은 빈칸으로 보여준다', () => {
    expect(formatMoney(0)).toBe('')
  })
})
