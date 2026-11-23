import { describe, expect, it } from 'vitest'
import { ENTRY_AMOUNT_MAX } from '../domain/types'
import { createEmptyData, isStoredData } from './schema'

// 장부 하나에 연도별 장부들
function withBooks(books: unknown[], settings: Record<string, unknown> = {}): unknown {
  return { schemaVersion: 4, books, settings }
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
    { lastBackupAt: '2026-03-01T00:00:00.000Z', lastBookId: 'book-2', recoveryCode: 'HK7M-29QF-MX4P-8R2D' },
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
  it('AC-2 빈 초기값은 schemaVersion 4 이고 장부가 없으며 스스로 검증을 통과한다 (SPEC-010)', () => {
    const empty = createEmptyData()

    expect(empty).toEqual({ schemaVersion: 4, books: [], settings: {} })
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
    ['SPEC-010 schemaVersion 이 3 (옮기기 전 형식)', { schemaVersion: 3, books: [], settings: {} }],
    ['books 없음', { schemaVersion: 4, settings: {} }],
    ['books 가 객체', { schemaVersion: 4, books: {}, settings: {} }],
    ['settings 없음', { schemaVersion: 4, books: [] }],
    ['settings.lastBackupAt 이 숫자', withBooks([], { lastBackupAt: 1 })],
    ['settings.lastBookId 가 숫자', withBooks([], { lastBookId: 1 })],
    ['SPEC-006 settings.recoveryCode 가 숫자', withBooks([], { recoveryCode: 1 })],
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

// 회원 한 분 (SPEC-010 1절): 번호·이름·들어온 달·쉬는 달, 그만둔 달·시작할 때 남은 돈은 있을 때만
function member(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'm1', name: '김도윤', joined: '2026-01', off: [], ...patch }
}

// 그만둔 달·쉬는 달·시작할 때 덜 낸 돈까지 있는 회원
const LEFT_MEMBER = member({ id: 'm2', name: '강민지', joined: '2025-07', left: '2026-12', off: ['2026-02', '2026-03'], opening: -30_000 })

interface DuesPatch {
  book?: Record<string, unknown>
  ledger?: Record<string, unknown>
  entry?: Record<string, unknown>
}

// v4 칸이 모두 든 동아리 장부: 회원 둘, 회비 표 시작 달, 2026년 월 회비, 두 분이 낸 회비 기록(엑셀 글 포함)
function duesData(patch: DuesPatch = {}): unknown {
  const entry = {
    id: 'e1',
    month: 3,
    day: 5,
    type: 'income',
    name: '회비',
    amount: 40_000,
    createdAt: '2026-03-05T00:00:00.000Z',
    payers: [
      { memberId: 'm1', amount: 20_000 },
      { memberId: 'm2', amount: 20_000 },
    ],
    sourceText: '3월 -2명: 김도윤,강민지',
    ...patch.entry,
  }
  return withBooks([
    bookOf(
      { '2026': { year: 2026, carryover: 0, monthlyFee: 20_000, entries: [entry], ...patch.ledger } },
      { members: [member(), LEFT_MEMBER], dues: { startMonth: '2026-01', hideUnassigned: true }, ...patch.book },
    ),
  ])
}

// 두 분이 낸 금액만 바꾼 데이터 (기록 금액은 40,000원)
function withPayers(...payers: unknown[]): unknown {
  return duesData({ entry: { payers } })
}

describe('SPEC-010 저장 형식 v4 가드', () => {
  it('회원 명단·회비 표 시작 달·월 회비·낸 분·엑셀 글이 든 장부를 인정한다', () => {
    expect(isStoredData(duesData())).toBe(true)
  })

  it.each([
    ['가계부 장부에 있어도 (종류를 바꾸면 지우지 않고 숨긴다, 6절)', duesData({ book: { kind: 'household' } })],
    ['낸 분 없는 회비 기록', duesData({ entry: { payers: undefined } })],
    ['엑셀 글 없는 기록', duesData({ entry: { sourceText: undefined } })],
    ['한 분이 낸 회비', withPayers({ memberId: 'm1', amount: 40_000 })],
    ['금액이 다른 두 분', withPayers({ memberId: 'm1', amount: 1 }, { memberId: 'm2', amount: 39_999 })],
    ['그만둔 분이 낸 분 (그만둔 분도 명단에 남는다)', withPayers({ memberId: 'm2', amount: 40_000 })],
    ['빈 명단, 낸 분 없음', duesData({ book: { members: [] }, entry: { payers: undefined } })],
    ['회비 값 없음 (명단을 아직 넣지 않음)', duesData({ book: { dues: undefined } })],
    ['카드 숨김 여부 없음', duesData({ book: { dues: { startMonth: '2026-01' } } })],
    ['월 회비 없는 해', duesData({ ledger: { monthlyFee: undefined } })],
    ['월 회비 상한', duesData({ ledger: { monthlyFee: ENTRY_AMOUNT_MAX } })],
    ['시작할 때 미리 낸 돈 (양수)', duesData({ book: { members: [member({ opening: 50_000 }), LEFT_MEMBER] } })],
    ['시작할 때 남은 돈 0', duesData({ book: { members: [member({ opening: 0 }), LEFT_MEMBER] } })],
    ['12월에 들어온 분', duesData({ book: { members: [member({ joined: '2026-12' }), LEFT_MEMBER] } })],
  ])('경계 안의 값은 인정한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(true)
  })

  it.each([
    ['낸 분 금액 합이 기록 금액과 다름', withPayers({ memberId: 'm1', amount: 20_000 }, { memberId: 'm2', amount: 10_000 })],
    ['같은 회원이 두 번', withPayers({ memberId: 'm1', amount: 20_000 }, { memberId: 'm1', amount: 20_000 })],
    ['명단에 없는 회원 번호', withPayers({ memberId: 'm1', amount: 20_000 }, { memberId: 'm9', amount: 20_000 })],
    ['명단이 없는데 낸 분이 있음', duesData({ book: { members: undefined } })],
  ])('AC-2 낸 분이 맞지 않는 데이터는 깨진 데이터로 본다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(false)
  })

  it.each([
    ['낸 분이 빈 목록', withPayers()],
    ['낸 분이 배열이 아님', duesData({ entry: { payers: { m1: 40_000 } } })],
    ['낸 분 금액 0', withPayers({ memberId: 'm1', amount: 0 }, { memberId: 'm2', amount: 40_000 })],
    ['낸 분 금액 음수', withPayers({ memberId: 'm1', amount: -10_000 }, { memberId: 'm2', amount: 50_000 })],
    ['낸 분 금액 소수', withPayers({ memberId: 'm1', amount: 19_999.5 }, { memberId: 'm2', amount: 20_000.5 })],
    ['낸 분 금액이 문자열', withPayers({ memberId: 'm1', amount: '20000' }, { memberId: 'm2', amount: 20_000 })],
    ['낸 분 회원 번호가 숫자', withPayers({ memberId: 1, amount: 20_000 }, { memberId: 'm2', amount: 20_000 })],
    ['엑셀 글이 문자열이 아님', duesData({ entry: { sourceText: 3 } })],
  ])('낸 분·엑셀 글 형식이 틀리면 거부한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(false)
  })

  it.each([
    ['월 회비 0', duesData({ ledger: { monthlyFee: 0 } })],
    ['월 회비 음수', duesData({ ledger: { monthlyFee: -20_000 } })],
    ['월 회비 소수', duesData({ ledger: { monthlyFee: 20_000.5 } })],
    ['월 회비 상한 + 1', duesData({ ledger: { monthlyFee: ENTRY_AMOUNT_MAX + 1 } })],
    ['월 회비가 문자열', duesData({ ledger: { monthlyFee: '20000' } })],
  ])('월 회비 형식이 틀리면 거부한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(false)
  })

  it.each([
    ['명단이 배열이 아님', { members: { m1: member() } }],
    ['회원 번호가 겹침', { members: [member(), LEFT_MEMBER, member({ name: '김도윤(동명이인)' })] }],
    ['회원 번호가 빈 문자열', { members: [member({ id: '' }), LEFT_MEMBER] }],
    ['회원 이름이 문자열이 아님', { members: [member({ name: null }), LEFT_MEMBER] }],
    ['들어온 달 없음', { members: [member({ joined: undefined }), LEFT_MEMBER] }],
    ['들어온 달 한 자리 달 (2026-1)', { members: [member({ joined: '2026-1' }), LEFT_MEMBER] }],
    ['들어온 달 13월', { members: [member({ joined: '2026-13' }), LEFT_MEMBER] }],
    ['들어온 달 0월', { members: [member({ joined: '2026-00' }), LEFT_MEMBER] }],
    ['들어온 달 두 자리 해 (26-01)', { members: [member({ joined: '26-01' }), LEFT_MEMBER] }],
    ['들어온 달 빗금 (2026/01)', { members: [member({ joined: '2026/01' }), LEFT_MEMBER] }],
    ['들어온 달 날짜까지 (2026-01-05)', { members: [member({ joined: '2026-01-05' }), LEFT_MEMBER] }],
    ['들어온 달이 숫자', { members: [member({ joined: 202601 }), LEFT_MEMBER] }],
    ['그만둔 달 형식', { members: [member(), { ...LEFT_MEMBER, left: '2026-13' }] }],
    ['쉬는 달 없음', { members: [member({ off: undefined }), LEFT_MEMBER] }],
    ['쉬는 달이 배열이 아님', { members: [member({ off: '2026-02' }), LEFT_MEMBER] }],
    ['쉬는 달 형식', { members: [member({ off: ['2026-02', '2026-3'] }), LEFT_MEMBER] }],
    ['시작할 때 남은 돈 소수', { members: [member({ opening: 1000.5 }), LEFT_MEMBER] }],
    ['시작할 때 남은 돈 문자열', { members: [member({ opening: '-30000' }), LEFT_MEMBER] }],
    ['시작할 때 남은 돈 상한 밖', { members: [member({ opening: -(ENTRY_AMOUNT_MAX + 1) }), LEFT_MEMBER] }],
  ])('회원 명단 형식이 틀리면 거부한다: %s', (_label, book) => {
    expect(isStoredData(duesData({ book }))).toBe(false)
  })

  it.each([
    ['회비 값이 객체가 아님', '2026-01'],
    ['시작 달 없음', { hideUnassigned: true }],
    ['시작 달 형식 (2026-1)', { startMonth: '2026-1' }],
    ['카드 숨김 여부가 불리언이 아님', { startMonth: '2026-01', hideUnassigned: 'yes' }],
  ])('회비 값 형식이 틀리면 거부한다: %s', (_label, dues) => {
    expect(isStoredData(duesData({ book: { dues } }))).toBe(false)
  })
})
