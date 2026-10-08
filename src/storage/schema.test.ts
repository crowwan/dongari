import { describe, expect, it } from 'vitest'
import { ENTRY_AMOUNT_MAX } from '../domain/types'
import { createEmptyData, isStoredData } from './schema'

// 장부 하나에 연도별 장부들
function withBooks(books: unknown[], settings: Record<string, unknown> = {}): unknown {
  return { schemaVersion: 3, books, settings }
}

function bookOf(ledgers: Record<string, unknown>, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'book-1', name: '꽃동산 동아리', kind: 'club', ledgers, createdAt: '2026-01-01T00:00:00.000Z', ...patch }
}

function validData(): unknown {
  return withBooks(
    [
      bookOf({
        '2026': {
          year: 2026,
          carryover: 120_000,
          entries: [
            {
              id: 'e1',
              month: 3,
              type: 'expense',
              name: '간식',
              amount: 15_000,
              createdAt: '2026-03-02T10:00:00.000Z',
            },
            {
              id: 'e2',
              month: 3,
              type: 'income',
              name: '회비',
              amount: 50_000,
              createdAt: '2026-03-02T10:01:00.000Z',
              batchId: 'b1',
            },
          ],
        },
      }),
      bookOf({}, { id: 'book-2', name: '우리집 가계부', kind: 'household' }),
    ],
    { lastBackupAt: '2026-03-01T00:00:00.000Z', lastBookId: 'book-2' },
  )
}

// 유효한 데이터 일부를 바꿔 잘못된 데이터를 만든다
function withLedgerPatch(patch: Record<string, unknown>): unknown {
  return withBooks([bookOf({ '2026': { year: 2026, carryover: 0, entries: [], ...patch } })])
}

function withEntryPatch(patch: Record<string, unknown>): unknown {
  const entry = { id: 'e1', month: 1, type: 'income', name: '회비', amount: 1000, createdAt: '2026-01-01T00:00:00.000Z' }
  return withLedgerPatch({ entries: [{ ...entry, ...patch }] })
}

// 그 해 장부에 기록 하나 (2월 29일처럼 장부 연도에 따라 갈리는 날짜)
function withYearEntry(year: number, patch: Record<string, unknown>): unknown {
  const entry = { id: 'e1', month: 1, type: 'income', name: '회비', amount: 1000, createdAt: `${year}-01-01T00:00:00.000Z` }
  return withBooks([bookOf({ [String(year)]: { year, carryover: 0, entries: [{ ...entry, ...patch }] } })])
}

describe('SPEC-002·SPEC-005 저장 스키마 검증', () => {
  it('AC-2 빈 초기값은 schemaVersion 3 이고 장부가 없으며 스스로 검증을 통과한다', () => {
    const empty = createEmptyData()

    expect(empty).toEqual({ schemaVersion: 3, books: [], settings: {} })
    expect(isStoredData(empty)).toBe(true)
  })

  it('AC-2 장부(여러 개)와 기록이 형식에 맞으면 저장 데이터로 인정한다', () => {
    expect(isStoredData(validData())).toBe(true)
  })

  it.each([
    ['금액 1원', withEntryPatch({ amount: 1 })],
    ['금액 상한', withEntryPatch({ amount: ENTRY_AMOUNT_MAX })],
    ['이월금 음수 (전년도 적자)', withLedgerPatch({ carryover: -50_000 })],
    ['날짜(일) 없는 예전 기록 (v2.2 전)', withEntryPatch({})],
    ['날짜 1일', withEntryPatch({ day: 1 })],
    ['날짜 그 달 마지막 날 (1월 31일)', withEntryPatch({ day: 31 })],
    ['윤년 2월 29일 (2028년 장부)', withYearEntry(2028, { month: 2, day: 29 })],
  ])('경계 안의 값은 인정한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(true)
  })

  it.each([
    ['null', null],
    ['배열', []],
    ['문자열', 'hello'],
    ['schemaVersion 없음', { books: [], settings: {} }],
    ['schemaVersion 이 2 (옮기기 전 형식)', { schemaVersion: 2, ledgers: {}, settings: {} }],
    ['books 없음', { schemaVersion: 3, settings: {} }],
    ['books 가 객체', { schemaVersion: 3, books: {}, settings: {} }],
    ['settings 없음', { schemaVersion: 3, books: [] }],
    ['settings.lastBackupAt 이 숫자', withBooks([], { lastBackupAt: 1 })],
    ['settings.lastBookId 가 숫자', withBooks([], { lastBookId: 1 })],
  ])('최상위 형식이 틀리면 거부한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(false)
  })

  it.each([
    ['장부 키와 연도가 다름', withLedgerPatch({ year: 2025 })],
    ['연도가 정수가 아님', withLedgerPatch({ year: 2026.5 })],
    ['이월금이 숫자가 아님', withLedgerPatch({ carryover: '0' })],
    ['entries 가 배열이 아님', withLedgerPatch({ entries: {} })],
  ])('연도별 장부 형식이 틀리면 거부한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(false)
  })

  it.each([
    ['id 가 빈 문자열', withBooks([bookOf({}, { id: '' })])],
    ['id 가 겹침', withBooks([bookOf({}), bookOf({}, { name: '다른 장부' })])],
    ['이름이 문자열이 아님', withBooks([bookOf({}, { name: null })])],
    ['종류가 club/household 가 아님', withBooks([bookOf({}, { kind: 'company' })])],
    ['ledgers 가 배열', withBooks([bookOf({}, { ledgers: [] })])],
    ['createdAt 없음', withBooks([bookOf({}, { createdAt: undefined })])],
  ])('장부 형식이 틀리면 거부한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(false)
  })

  it('마지막에 본 장부 id 가 없는 장부를 가리켜도 형식은 맞다 (첫 장부를 연다)', () => {
    expect(isStoredData(withBooks([bookOf({})], { lastBookId: 'gone' }))).toBe(true)
  })

  it.each([
    ['id 가 빈 문자열', withEntryPatch({ id: '' })],
    ['월이 0', withEntryPatch({ month: 0 })],
    ['월이 13', withEntryPatch({ month: 13 })],
    ['월이 소수', withEntryPatch({ month: 1.5 })],
    ['종류가 income/expense 가 아님', withEntryPatch({ type: 'refund' })],
    ['이름이 문자열이 아님', withEntryPatch({ name: 3 })],
    ['금액이 0', withEntryPatch({ amount: 0 })],
    ['금액이 음수', withEntryPatch({ amount: -1000 })],
    ['금액이 소수', withEntryPatch({ amount: 1000.5 })],
    ['금액이 상한 + 1', withEntryPatch({ amount: ENTRY_AMOUNT_MAX + 1 })],
    ['금액이 NaN', withEntryPatch({ amount: Number.NaN })],
    ['금액이 문자열', withEntryPatch({ amount: '1000' })],
    ['createdAt 없음', withEntryPatch({ createdAt: undefined })],
    ['batchId 가 숫자', withEntryPatch({ batchId: 1 })],
    ['날짜 0', withEntryPatch({ day: 0 })],
    ['날짜 32', withEntryPatch({ day: 32 })],
    ['날짜 소수', withEntryPatch({ day: 1.5 })],
    ['날짜 문자열', withEntryPatch({ day: '7' })],
    ['날짜 null', withEntryPatch({ day: null })],
    ['그 달에 없는 날 (4월 31일)', withEntryPatch({ month: 4, day: 31 })],
    ['윤년이 아닌 해 2월 29일 (2026년 장부)', withYearEntry(2026, { month: 2, day: 29 })],
  ])('기록 형식이 틀리면 거부한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(false)
  })
})
