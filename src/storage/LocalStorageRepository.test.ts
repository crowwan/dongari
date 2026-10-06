import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredData } from '../domain/types'
import { BROKEN_KEY_PREFIX, LocalStorageRepository, STORAGE_KEY } from './LocalStorageRepository'

function sampleData(): StoredData {
  return {
    schemaVersion: 2,
    ledgers: {
      '2026': {
        year: 2026,
        clubName: '꽃동산 동아리',
        carryover: 120_000,
        entries: [
          { id: 'e1', month: 3, type: 'expense', name: '간식', amount: 15_000, createdAt: '2026-03-02T10:00:00.000Z' },
        ],
      },
    },
    settings: { lastChangedAt: '2026-03-02T10:00:00.000Z' },
  }
}

function brokenKeys(): string[] {
  return Object.keys(localStorage).filter((key) => key.startsWith(BROKEN_KEY_PREFIX))
}

function quotaError(): DOMException {
  return new DOMException('용량 초과', 'QuotaExceededError')
}

describe('SPEC-002 저장 (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AC-1 기록을 저장하고 새로고침(새 저장소 인스턴스)해도 그대로 남아 있다', () => {
    const data = sampleData()
    expect(new LocalStorageRepository().save(data)).toEqual({ ok: true })

    // 새로고침 = 같은 localStorage 를 새 인스턴스로 다시 읽는다
    expect(new LocalStorageRepository().load()).toEqual({ status: 'ok', data })
  })

  it('AC-2 dongari:v2 키 하나에 schemaVersion 2 로 저장한다', () => {
    new LocalStorageRepository().save(sampleData())

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(STORAGE_KEY).toBe('dongari:v2')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '')).toMatchObject({ schemaVersion: 2 })
  })

  it('저장된 데이터가 없으면 빈 초기값으로 정상(ok) 시작한다', () => {
    expect(new LocalStorageRepository().load()).toEqual({ status: 'ok', data: { schemaVersion: 2, ledgers: {}, settings: {} } })
  })

  it('v1 키(accounting_YYYY)는 읽거나 지우거나 바꾸지 않는다', () => {
    const v1Raw = JSON.stringify({ basicInfo: { year: 2025 }, monthlyData: [] })
    localStorage.setItem('accounting_2025', v1Raw)

    const repository = new LocalStorageRepository()
    expect(repository.load().data).toEqual({ schemaVersion: 2, ledgers: {}, settings: {} })
    repository.save(sampleData())

    expect(localStorage.getItem('accounting_2025')).toBe(v1Raw)
  })

  describe('깨진 데이터', () => {
    it.each([
      ['JSON 이 깨짐', '{"schemaVersion": 2,'],
      ['형식이 다름', JSON.stringify({ schemaVersion: 2, ledgers: [] })],
    ])('%s: 원본을 별도 키에 옮기고 빈 초기값으로 시작했다(recovered)고 알린다', (_label, raw) => {
      localStorage.setItem(STORAGE_KEY, raw)

      const repository = new LocalStorageRepository()
      expect(repository.load()).toEqual({ status: 'recovered', data: { schemaVersion: 2, ledgers: {}, settings: {} } })

      const keys = brokenKeys()
      expect(keys).toHaveLength(1)
      expect(localStorage.getItem(keys[0])).toBe(raw)
    })

    it('원본을 보존한 뒤에는 새 기록을 정상 저장한다', () => {
      localStorage.setItem(STORAGE_KEY, 'not json')
      const repository = new LocalStorageRepository()
      repository.load()

      expect(repository.save(sampleData())).toEqual({ ok: true })
      expect(new LocalStorageRepository().load()).toEqual({ status: 'ok', data: sampleData() })
      expect(localStorage.getItem(brokenKeys()[0])).toBe('not json')
    })

    it('저장 없이 앱을 다시 열어도 같은 원본을 또 보존하지 않는다', () => {
      localStorage.setItem(STORAGE_KEY, 'not json')

      new LocalStorageRepository().load()
      // 두 번째 실행은 원래 키가 비어 있어 처음 실행과 같다
      expect(new LocalStorageRepository().load().status).toBe('ok')

      expect(brokenKeys()).toHaveLength(1)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('보존 후 원래 키를 비우지 못해도 빈 장부로 시작하고 저장할 수 있다', () => {
      localStorage.setItem(STORAGE_KEY, 'not json')
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
        throw new Error('삭제 실패')
      })
      const repository = new LocalStorageRepository()

      expect(repository.load()).toEqual({ status: 'recovered', data: { schemaVersion: 2, ledgers: {}, settings: {} } })
      expect(localStorage.getItem(brokenKeys()[0])).toBe('not json')
      expect(repository.save(sampleData())).toEqual({ ok: true })
    })

    it('원본을 보존하지 못하면 읽기 전용으로 알리고 저장을 막아 원본을 덮어쓰지 않는다', () => {
      localStorage.setItem(STORAGE_KEY, 'not json')
      vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw quotaError()
      })
      const repository = new LocalStorageRepository()
      expect(repository.load()).toEqual({ status: 'read-only', reason: 'unreadable-original', data: { schemaVersion: 2, ledgers: {}, settings: {} } })

      expect(repository.save(sampleData())).toEqual({ ok: false, reason: 'unreadable-original' })
      expect(localStorage.getItem(STORAGE_KEY)).toBe('not json')
    })
  })

  describe('상위 버전 데이터', () => {
    it('빈 초기값의 읽기 전용으로 알리고 저장을 막아 상위 버전 원본을 덮어쓰지 않는다', () => {
      const newer = JSON.stringify({ schemaVersion: 3, ledgers: {}, settings: {} })
      localStorage.setItem(STORAGE_KEY, newer)

      const repository = new LocalStorageRepository()
      expect(repository.load()).toEqual({ status: 'read-only', reason: 'newer-version', data: { schemaVersion: 2, ledgers: {}, settings: {} } })
      expect(repository.save(sampleData())).toEqual({ ok: false, reason: 'newer-version' })
      expect(localStorage.getItem(STORAGE_KEY)).toBe(newer)
    })
  })

  describe('저장 실패', () => {
    it('용량이 부족하면 quota-exceeded 로 알린다', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError()
      })

      expect(new LocalStorageRepository().save(sampleData())).toEqual({ ok: false, reason: 'quota-exceeded' })
    })

    it('그 밖의 오류는 unknown 으로 알리고 원인 오류를 함께 넘긴다', () => {
      const cause = new Error('보안 정책으로 차단')
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw cause
      })

      expect(new LocalStorageRepository().save(sampleData())).toEqual({ ok: false, reason: 'unknown', error: cause })
    })
  })
})
