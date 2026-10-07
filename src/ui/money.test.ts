import { describe, expect, it } from 'vitest'
import { ENTRY_AMOUNT_MAX } from '../domain/types'
import { addAmount, formatAmount, formatMoney, parseMoney, tidyMoneyText } from './money'

describe('금액 글자 변환', () => {
  it('숫자가 아닌 글자를 버리고 숫자로 읽는다', () => {
    expect(parseMoney('12,300원')).toBe(12300)
  })

  it('빈칸이면 0 으로 읽는다', () => {
    expect(parseMoney('')).toBe(0)
  })

  it('상한 999,999,999 를 넘으면 상한으로 자른다', () => {
    expect(parseMoney('1234567890')).toBe(ENTRY_AMOUNT_MAX)
    expect(ENTRY_AMOUNT_MAX).toBe(999_999_999)
  })

  it('천 단위 콤마를 붙여 보여준다', () => {
    expect(formatMoney(1234567)).toBe('1,234,567')
  })

  it('0 은 빈칸으로 보여준다 (내역 금액 칸: 0원 내역은 없다)', () => {
    expect(formatMoney(0)).toBe('')
  })
})

describe('친 글자 정리 (이월금 칸)', () => {
  it('직접 친 0 은 0 으로 남는다', () => {
    expect(tidyMoneyText('0')).toBe('0')
  })

  it('다 지우면 빈칸이다', () => {
    expect(tidyMoneyText('')).toBe('')
  })

  it('앞자리 0 은 정리한다 (00 → 0, 05 → 5)', () => {
    expect(tidyMoneyText('00')).toBe('0')
    expect(tidyMoneyText('05')).toBe('5')
  })

  it('숫자만 남기고 천 단위 콤마를 붙이며 상한에서 자른다', () => {
    expect(tidyMoneyText('1,2345원')).toBe('12,345')
    expect(tidyMoneyText('1234567890')).toBe('999,999,999')
  })
})

describe('금액 보여주기', () => {
  it('천 단위 콤마를 붙이고 0 도 그대로 보여준다', () => {
    expect(formatAmount(1_777_203)).toBe('1,777,203')
    expect(formatAmount(0)).toBe('0')
  })

  it('음수는 글자 빼기표(−)를 앞에 붙인다', () => {
    expect(formatAmount(-50_000)).toBe('−50,000')
  })
})

describe('SPEC-001 빠른 더하기', () => {
  it('AC-17 [+1만] [+5만] [+10만] 은 지금 금액에 더한다(상한 999,999,999)', () => {
    expect(addAmount(40_000, 10_000)).toBe(50_000)
    expect(addAmount(0, 50_000)).toBe(50_000)
    expect(addAmount(999_990_000, 100_000)).toBe(ENTRY_AMOUNT_MAX)
  })
})
