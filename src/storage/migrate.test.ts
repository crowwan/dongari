import { describe, expect, it, vi } from 'vitest'
import { InvalidDataError, migrate, NewerSchemaError, type MigrationSteps } from './migrate'

const v2Data = { schemaVersion: 2, ledgers: {}, settings: {} }

describe('SPEC-002 마이그레이션', () => {
  it('AC-2 현재 버전(2) 데이터는 그대로 읽는다', () => {
    expect(migrate(v2Data)).toEqual(v2Data)
  })

  it('AC-2 낮은 버전 데이터는 버전별 마이그레이션 함수를 차례로 거쳐 읽힌다', () => {
    // 가상의 v0 → v1 → v2 체인으로 구조를 확인한다 (실제 등록된 이전 버전은 아직 없음)
    const fromV0 = vi.fn((data: unknown) => ({ schemaVersion: 1, prev: data }))
    const fromV1 = vi.fn(() => ({ schemaVersion: 2, ledgers: {}, settings: { lastChangedAt: 'migrated' } }))
    const steps: MigrationSteps = { 0: fromV0, 1: fromV1 }

    const result = migrate({ schemaVersion: 0 }, steps)

    expect(fromV0).toHaveBeenCalledWith({ schemaVersion: 0 })
    expect(fromV1).toHaveBeenCalledWith({ schemaVersion: 1, prev: { schemaVersion: 0 } })
    expect(result).toEqual({ schemaVersion: 2, ledgers: {}, settings: { lastChangedAt: 'migrated' } })
  })

  it('AC-2 낮은 버전인데 올릴 마이그레이션 함수가 없으면 거부한다', () => {
    expect(() => migrate({ schemaVersion: 1 })).toThrow(InvalidDataError)
  })

  it('AC-2 마이그레이션 함수가 다음 버전을 만들지 못하면 거부한다', () => {
    const steps: MigrationSteps = { 1: () => ({ schemaVersion: 1 }) }

    expect(() => migrate({ schemaVersion: 1 }, steps)).toThrow(InvalidDataError)
  })

  it('AC-2 마이그레이션 결과가 스키마 검증을 통과하지 못하면 거부한다', () => {
    const steps: MigrationSteps = { 1: () => ({ schemaVersion: 2 }) }

    expect(() => migrate({ schemaVersion: 1 }, steps)).toThrow(InvalidDataError)
  })

  it('AC-2 앱보다 높은 버전 데이터는 거부한다', () => {
    expect(() => migrate({ schemaVersion: 3, ledgers: {}, settings: {} })).toThrow(NewerSchemaError)
  })

  it.each([
    ['객체가 아님', 'text'],
    ['schemaVersion 없음', { ledgers: {} }],
    ['schemaVersion 이 문자열', { schemaVersion: '2' }],
    ['현재 버전인데 형식이 틀림', { schemaVersion: 2, ledgers: [] }],
  ])('형식이 틀린 데이터는 거부한다: %s', (_label, raw) => {
    expect(() => migrate(raw)).toThrow(InvalidDataError)
  })
})
