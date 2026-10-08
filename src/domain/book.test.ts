import { describe, expect, it } from 'vitest'
import { book, ledger } from '../test/ledgerFixtures'
import { bookBalance, carryoverWords, currentBook, isFirstYear } from './book'
import { CURRENT_SCHEMA_VERSION, type StoredData } from './types'

const CLUB = book([], { id: 'club', name: '한랑드림' })
const HOUSEHOLD = book([], { id: 'home', name: '우리집 가계부', kind: 'household' })

function dataWith(lastBookId: string | undefined): StoredData {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, books: [CLUB, HOUSEHOLD], settings: { lastBookId } }
}

describe('SPEC-005 지금 장부', () => {
  it('AC-2 마지막에 본 장부가 지금 장부다', () => {
    expect(currentBook(dataWith('home'))).toBe(HOUSEHOLD)
  })

  it('마지막에 본 장부가 없거나 지워졌으면 첫 장부(만든 순)를 연다', () => {
    expect(currentBook(dataWith(undefined))).toBe(CLUB)
    expect(currentBook(dataWith('gone'))).toBe(CLUB)
  })

  it('장부가 하나도 없으면 지금 장부도 없다 (첫 실행)', () => {
    expect(currentBook({ schemaVersion: CURRENT_SCHEMA_VERSION, books: [], settings: {} })).toBeUndefined()
  })
})

describe('SPEC-005 장부 고르기 창의 잔액', () => {
  const lastYear = ledger([[3, 'income', '회비', 100_000]], { year: 2025, carryover: 50_000 })
  const thisYear = ledger([[10, 'expense', '대관료', 40_000]], { year: 2026, carryover: 150_000 })

  it('AC-3 그 장부 올해 장부의 잔액을 보여 준다', () => {
    expect(bookBalance(book([lastYear, thisYear]), 2026)).toBe(110_000)
  })

  it('올해 장부가 없으면 마지막 연도 장부의 잔액이다', () => {
    expect(bookBalance(book([lastYear]), 2026)).toBe(150_000)
  })

  it('연도별 장부가 하나도 없으면 잔액도 없다', () => {
    expect(bookBalance(book([]), 2026)).toBeUndefined()
  })
})

describe('SPEC-005 종류별 이월금 이름', () => {
  it('동아리·모임은 지금처럼 작년 이월금이다', () => {
    expect(carryoverWords('club', true)).toEqual({
      label: '작년 이월금',
      surplus: '작년 이월',
      opening: '작년 이월금',
      deficit: '작년 적자',
      sheet: '이월금',
    })
    expect(carryoverWords('club', false)).toEqual(carryoverWords('club', true))
  })

  it('AC-5 개인 가계부 첫 해의 이월금 이름은 "지금 남은 돈" 이다', () => {
    expect(carryoverWords('household', true)).toMatchObject({ label: '지금 남은 돈', surplus: '처음 남은 돈', deficit: '처음 적자' })
  })

  it('개인 가계부 다음 해부터는 "작년에서 넘어온 돈" 이다', () => {
    expect(carryoverWords('household', false)).toMatchObject({
      label: '작년에서 넘어온 돈',
      surplus: '작년에서 넘어온 돈',
      deficit: '작년 적자',
    })
  })

  it('첫 해는 그 장부에 앞선 연도 장부가 없는 해다', () => {
    const twoYears = book([ledger([], { year: 2025 }), ledger([], { year: 2026 })])

    expect(isFirstYear(twoYears, 2025)).toBe(true)
    expect(isFirstYear(twoYears, 2026)).toBe(false)
    expect(isFirstYear(book([]), 2026)).toBe(true)
    expect(isFirstYear(undefined, 2026)).toBe(true)
  })
})
