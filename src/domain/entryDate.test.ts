import { describe, expect, it } from 'vitest'
import { byDate, daysInMonth, isDayInMonth } from './entryDate'
import type { Entry } from './types'

function entry(id: string, day: number | undefined, createdAt: string): Entry {
  const base: Entry = { id, month: 10, type: 'expense', name: id, amount: 1_000, createdAt }
  return day === undefined ? base : { ...base, day }
}

describe('SPEC-001 내역 날짜(일)', () => {
  describe('그 달 마지막 날', () => {
    it.each([
      [2026, 1, 31],
      [2026, 4, 30],
      [2026, 10, 31],
      [2026, 12, 31],
      // 2월은 장부 연도의 윤년을 따른다
      [2026, 2, 28],
      [2028, 2, 29],
      [2100, 2, 28],
      [2000, 2, 29],
    ])('%i년 %i월은 %i일까지', (year, month, last) => {
      expect(daysInMonth(year, month)).toBe(last)
    })
  })

  describe('AC-24 그 달에 있는 날', () => {
    it.each([
      [2026, 10, 1],
      [2026, 10, 31],
      [2028, 2, 29],
    ])('%i년 %i월 %i일은 있다', (year, month, day) => {
      expect(isDayInMonth(year, month, day)).toBe(true)
    })

    it.each([
      [2026, 10, 0],
      [2026, 10, 32],
      [2026, 4, 31],
      [2026, 2, 29],
      [2026, 10, 1.5],
      [2026, 10, Number.NaN],
    ])('%i년 %i월 %s일은 없다', (year, month, day) => {
      expect(isDayInMonth(year, month, day)).toBe(false)
    })
  })

  describe('AC-9 날짜순 (장부·월 정리·올해 결산 지출표가 같이 쓴다)', () => {
    it('날짜순, 같은 날은 적은 순, 날짜 없는 예전 기록은 맨 뒤에 적은 순', () => {
      const entries = [
        entry('옛날2', undefined, '2026-10-01T00:00:05.000Z'),
        entry('7일 늦게', 7, '2026-10-09T00:00:00.000Z'),
        entry('3일', 3, '2026-10-08T00:00:00.000Z'),
        entry('옛날1', undefined, '2026-10-01T00:00:01.000Z'),
        entry('7일 먼저', 7, '2026-10-02T00:00:00.000Z'),
      ]

      expect(byDate(entries).map((item) => item.id)).toEqual(['3일', '7일 먼저', '7일 늦게', '옛날1', '옛날2'])
    })

    it('같은 날 같은 시각이면 들어온 순서 그대로', () => {
      const entries = [entry('가', 5, '2026-10-01T00:00:00.000Z'), entry('나', 5, '2026-10-01T00:00:00.000Z')]

      expect(byDate(entries).map((item) => item.id)).toEqual(['가', '나'])
    })

    it('받은 목록은 바꾸지 않는다', () => {
      const entries = [entry('7일', 7, '2026-10-01T00:00:00.000Z'), entry('3일', 3, '2026-10-02T00:00:00.000Z')]

      byDate(entries)

      expect(entries.map((item) => item.id)).toEqual(['7일', '3일'])
    })
  })
})
