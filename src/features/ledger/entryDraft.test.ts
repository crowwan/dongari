import { describe, expect, it } from 'vitest'
import { checkDayText, dayTextForMonth, tidyDayText } from './entryDraft'

describe('SPEC-001 날 숫자 칸 (AC-24)', () => {
  it('숫자만 두 자리까지 받는다', () => {
    expect(tidyDayText('7')).toBe('7')
    expect(tidyDayText('123')).toBe('12')
    expect(tidyDayText('1a2')).toBe('12')
    expect(tidyDayText(' 3일')).toBe('3')
    expect(tidyDayText('')).toBe('')
  })

  it('빈칸이면 "며칠인지 적어 주세요"', () => {
    expect(checkDayText(2026, 10, '')).toEqual({ ok: false, missing: '며칠인지 적어 주세요' })
  })

  it('그 달에 있는 날이면 그 날 (앞의 0 은 떼어 읽는다)', () => {
    expect(checkDayText(2026, 10, '7')).toEqual({ ok: true, day: 7 })
    expect(checkDayText(2026, 10, '07')).toEqual({ ok: true, day: 7 })
    expect(checkDayText(2026, 10, '31')).toEqual({ ok: true, day: 31 })
  })

  it.each([
    [2026, 10, '0', '10월은 31일까지 있어요'],
    [2026, 10, '32', '10월은 31일까지 있어요'],
    [2026, 4, '31', '4월은 30일까지 있어요'],
    [2026, 2, '29', '2월은 28일까지 있어요'],
    [2026, 2, '30', '2월은 28일까지 있어요'],
    [2028, 2, '30', '2월은 29일까지 있어요'],
  ])('%i년 %i월에 "%s" 는 없는 날이라 "%s"', (year, month, text, missing) => {
    expect(checkDayText(year, month, text)).toEqual({ ok: false, missing })
  })

  it('윤년(2028년) 2월 29일은 있는 날이다', () => {
    expect(checkDayText(2028, 2, '29')).toEqual({ ok: true, day: 29 })
  })

  it('달을 바꿨을 때 그 달에 없는 날 글자는 비우고, 있는 날·빈칸은 그대로 둔다', () => {
    expect(dayTextForMonth(2026, 2, '31')).toBe('')
    expect(dayTextForMonth(2026, 2, '0')).toBe('')
    expect(dayTextForMonth(2026, 2, '7')).toBe('7')
    expect(dayTextForMonth(2028, 2, '29')).toBe('29')
    expect(dayTextForMonth(2026, 2, '')).toBe('')
  })
})
