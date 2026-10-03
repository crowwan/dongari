import { describe, expect, it } from 'vitest'
import { ENTRY_AMOUNT_MAX } from '../domain/types'
import { createEmptyData, isStoredData } from './schema'

function validData(): unknown {
  return {
    schemaVersion: 2,
    ledgers: {
      '2026': {
        year: 2026,
        clubName: '꽃동산 동아리',
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
    },
    settings: { lastBackupAt: '2026-03-01T00:00:00.000Z' },
  }
}

// 유효한 데이터 일부를 바꿔 잘못된 데이터를 만든다
function withLedgerPatch(patch: Record<string, unknown>): unknown {
  return {
    schemaVersion: 2,
    ledgers: { '2026': { year: 2026, clubName: '동아리', carryover: 0, entries: [], ...patch } },
    settings: {},
  }
}

function withEntryPatch(patch: Record<string, unknown>): unknown {
  const entry = { id: 'e1', month: 1, type: 'income', name: '회비', amount: 1000, createdAt: '2026-01-01T00:00:00.000Z' }
  return withLedgerPatch({ entries: [{ ...entry, ...patch }] })
}

describe('SPEC-002 저장 스키마 검증', () => {
  it('AC-2 빈 초기값은 schemaVersion 2 이고 스스로 검증을 통과한다', () => {
    const empty = createEmptyData()

    expect(empty).toEqual({ schemaVersion: 2, ledgers: {}, settings: {} })
    expect(isStoredData(empty)).toBe(true)
  })

  it('AC-2 장부와 기록이 형식에 맞으면 저장 데이터로 인정한다', () => {
    expect(isStoredData(validData())).toBe(true)
  })

  it.each([
    ['금액 1원', withEntryPatch({ amount: 1 })],
    ['금액 상한', withEntryPatch({ amount: ENTRY_AMOUNT_MAX })],
    ['이월금 음수 (전년도 적자)', withLedgerPatch({ carryover: -50_000 })],
  ])('경계 안의 값은 인정한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(true)
  })

  it.each([
    ['null', null],
    ['배열', []],
    ['문자열', 'hello'],
    ['schemaVersion 없음', { ledgers: {}, settings: {} }],
    ['schemaVersion 이 1', { schemaVersion: 1, ledgers: {}, settings: {} }],
    ['ledgers 없음', { schemaVersion: 2, settings: {} }],
    ['settings 없음', { schemaVersion: 2, ledgers: {} }],
    ['settings.lastBackupAt 이 숫자', { schemaVersion: 2, ledgers: {}, settings: { lastBackupAt: 1 } }],
  ])('최상위 형식이 틀리면 거부한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(false)
  })

  it.each([
    ['장부 키와 연도가 다름', withLedgerPatch({ year: 2025 })],
    ['연도가 정수가 아님', withLedgerPatch({ year: 2026.5 })],
    ['동아리 이름이 문자열이 아님', withLedgerPatch({ clubName: null })],
    ['이월금이 숫자가 아님', withLedgerPatch({ carryover: '0' })],
    ['entries 가 배열이 아님', withLedgerPatch({ entries: {} })],
  ])('장부 형식이 틀리면 거부한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(false)
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
  ])('기록 형식이 틀리면 거부한다: %s', (_label, raw) => {
    expect(isStoredData(raw)).toBe(false)
  })
})
