import { describe, expect, it, vi } from 'vitest'
import { calculateTotals } from '../domain/ledger'
import { yearReport } from '../domain/report'
import { ledger, V1_EXAMPLE_YEAR } from '../test/ledgerFixtures'
import { FIRST_BOOK_ID, InvalidDataError, migrate, NewerSchemaError, type MigrationSteps } from './migrate'

const v3Data = { schemaVersion: 3, books: [], settings: {} }

describe('SPEC-002 마이그레이션', () => {
  it('AC-2 현재 버전(3) 데이터는 그대로 읽는다', () => {
    expect(migrate(v3Data)).toEqual(v3Data)
  })

  it('AC-2 낮은 버전 데이터는 버전별 마이그레이션 함수를 차례로 거쳐 읽힌다', () => {
    // 가상의 v1 → v2 → v3 체인으로 구조를 확인한다
    const fromV1 = vi.fn((data: unknown) => ({ schemaVersion: 2, prev: data }))
    const fromV2 = vi.fn(() => ({ schemaVersion: 3, books: [], settings: { lastChangedAt: 'migrated' } }))
    const steps: MigrationSteps = { 1: fromV1, 2: fromV2 }

    const result = migrate({ schemaVersion: 1 }, steps)

    expect(fromV1).toHaveBeenCalledWith({ schemaVersion: 1 })
    expect(fromV2).toHaveBeenCalledWith({ schemaVersion: 2, prev: { schemaVersion: 1 } })
    expect(result).toEqual({ schemaVersion: 3, books: [], settings: { lastChangedAt: 'migrated' } })
  })

  it('AC-2 낮은 버전인데 올릴 마이그레이션 함수가 없으면 거부한다', () => {
    expect(() => migrate({ schemaVersion: 1 })).toThrow(InvalidDataError)
  })

  it('AC-2 마이그레이션 함수가 다음 버전을 만들지 못하면 거부한다', () => {
    const steps: MigrationSteps = { 2: () => ({ schemaVersion: 2 }) }

    expect(() => migrate({ schemaVersion: 2 }, steps)).toThrow(InvalidDataError)
  })

  it('AC-2 마이그레이션 결과가 스키마 검증을 통과하지 못하면 거부한다', () => {
    const steps: MigrationSteps = { 2: () => ({ schemaVersion: 3 }) }

    expect(() => migrate({ schemaVersion: 2 }, steps)).toThrow(InvalidDataError)
  })

  it('AC-2 앱보다 높은 버전 데이터는 거부한다', () => {
    expect(() => migrate({ schemaVersion: 4, books: [], settings: {} })).toThrow(NewerSchemaError)
  })

  it.each([
    ['객체가 아님', 'text'],
    ['schemaVersion 없음', { books: [] }],
    ['schemaVersion 이 문자열', { schemaVersion: '3' }],
    ['현재 버전인데 형식이 틀림', { schemaVersion: 3, books: {} }],
  ])('형식이 틀린 데이터는 거부한다: %s', (_label, raw) => {
    expect(() => migrate(raw)).toThrow(InvalidDataError)
  })
})

// v2 저장 데이터 (연도 → 장부, 장부마다 동아리 이름)
function v2Data(ledgers: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  return { schemaVersion: 2, ledgers, settings }
}

// v2 장부 = 지금 장부 + 동아리 이름
function v2Ledger(clubName: string, overrides: Parameters<typeof ledger>[1] = {}, specs = V1_EXAMPLE_YEAR) {
  return { ...ledger(specs, overrides), clubName }
}

describe('SPEC-005 지금 기록 옮기기 (v2 → v3)', () => {
  it('AC-1 v2 장부들을 이름 = 동아리 이름, 종류 동아리·모임인 장부 하나로 옮기고 마지막에 본 장부로 정한다', () => {
    const raw = v2Data(
      { '2025': v2Ledger('한랑드림'), '2026': v2Ledger('한랑드림', { year: 2026, carryover: 152_905 }, []) },
      { lastBackupAt: '2026-09-01T00:00:00.000Z', lastChangedAt: '2026-10-01T00:00:00.000Z' },
    )

    const data = migrate(raw)

    expect(data).toEqual({
      schemaVersion: 3,
      books: [
        {
          id: FIRST_BOOK_ID,
          name: '한랑드림',
          kind: 'club',
          ledgers: { '2025': ledger(V1_EXAMPLE_YEAR), '2026': ledger([], { year: 2026, carryover: 152_905 }) },
          createdAt: expect.any(String),
        },
      ],
      settings: {
        lastBackupAt: '2026-09-01T00:00:00.000Z',
        lastChangedAt: '2026-10-01T00:00:00.000Z',
        lastBookId: FIRST_BOOK_ID,
      },
    })
  })

  it('AC-1 v1 예시 1년치를 옮겨도 잔액·결산 숫자가 같다 (수입 1,777,203 / 지출 1,994,780 / 잔액 152,905)', () => {
    const before = ledger(V1_EXAMPLE_YEAR)

    const moved = migrate(v2Data({ '2025': v2Ledger('한랑드림') })).books[0]?.ledgers['2025']
    if (!moved) throw new Error('2025년 장부가 옮겨지지 않았다')

    expect(calculateTotals(moved)).toEqual({ income: 1_777_203, expense: 1_994_780, balance: 152_905 })
    expect(yearReport(moved)).toEqual(yearReport(before))
  })

  it('연도마다 동아리 이름이 달랐으면 가장 최근 연도의 이름을 장부 이름으로 쓴다', () => {
    const raw = v2Data({
      '2024': v2Ledger('옛이름', { year: 2024 }, []),
      '2026': v2Ledger('한랑드림', { year: 2026 }, []),
      '2025': v2Ledger('중간이름', { year: 2025 }, []),
    })

    expect(migrate(raw).books[0]?.name).toBe('한랑드림')
  })

  it('장부가 없는 v2 데이터(첫 실행 전)는 장부 없이 옮겨 첫 실행 화면이 그대로 뜬다', () => {
    expect(migrate(v2Data({}, { lastBackupAt: '2026-09-01T00:00:00.000Z' }))).toEqual({
      schemaVersion: 3,
      books: [],
      settings: { lastBackupAt: '2026-09-01T00:00:00.000Z' },
    })
  })

  it('날짜(일)·묶음이 있는 기록도 그대로 옮긴다', () => {
    const dated = { ...v2Ledger('한랑드림', { year: 2026 }, []), entries: [{ id: 'a', month: 3, day: 9, type: 'expense', name: '대관료', amount: 40_000, createdAt: '2026-03-09T00:00:00.000Z', batchId: 'b1' }] }

    expect(migrate(v2Data({ '2026': dated })).books[0]?.ledgers['2026']?.entries).toEqual(dated.entries)
  })

  it.each([
    ['ledgers 가 배열', { schemaVersion: 2, ledgers: [], settings: {} }],
    ['ledgers 없음', { schemaVersion: 2, settings: {} }],
    ['동아리 이름이 문자열이 아님', v2Data({ '2026': { ...ledger([], { year: 2026 }), clubName: 3 } })],
    ['금액이 0 인 기록', v2Data({ '2026': v2Ledger('한랑드림', { year: 2026 }, [[1, 'income', '회비', 0]]) })],
  ])('형식이 틀린 v2 데이터는 옮기지 않고 거부한다 (깨진 데이터와 같이): %s', (_label, raw) => {
    expect(() => migrate(raw)).toThrow(InvalidDataError)
  })
})
