import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredData } from '../domain/types'
import { BROKEN_KEY_PREFIX, LocalStorageRepository, OLD_VERSION_KEY_PREFIX, STORAGE_KEY } from './LocalStorageRepository'
import { FIRST_BOOK_ID } from './migrate'

const EMPTY: StoredData = { schemaVersion: 3, books: [], settings: {} }

const LEDGER_2026 = {
  year: 2026,
  carryover: 120_000,
  entries: [{ id: 'e1', month: 3, type: 'expense' as const, name: '간식', amount: 15_000, createdAt: '2026-03-02T10:00:00.000Z' }],
}

function sampleData(): StoredData {
  return {
    schemaVersion: 3,
    books: [{ id: 'book-1', name: '꽃동산 동아리', kind: 'club', ledgers: { '2026': structuredClone(LEDGER_2026) }, createdAt: '2026-01-01T00:00:00.000Z' }],
    settings: { lastChangedAt: '2026-03-02T10:00:00.000Z', lastBookId: 'book-1' },
  }
}

// v2.2 까지 앱이 저장한 형식 (연도 → 장부, 장부마다 동아리 이름)
function v2Raw(): string {
  return JSON.stringify({
    schemaVersion: 2,
    ledgers: { '2026': { ...LEDGER_2026, clubName: '꽃동산 동아리' } },
    settings: { lastChangedAt: '2026-03-02T10:00:00.000Z' },
  })
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

  it('AC-2 키 이름은 그대로 dongari:v2 하나에 schemaVersion 3 으로 저장한다 (설치한 앱·기록 유지)', () => {
    new LocalStorageRepository().save(sampleData())

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(STORAGE_KEY).toBe('dongari:v2')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '')).toMatchObject({ schemaVersion: 3 })
  })

  it('저장된 데이터가 없으면 빈 초기값으로 정상(ok) 시작한다', () => {
    expect(new LocalStorageRepository().load()).toEqual({ status: 'ok', data: EMPTY })
  })

  it('v1 키(accounting_YYYY)는 읽거나 지우거나 바꾸지 않는다', () => {
    const v1Raw = JSON.stringify({ basicInfo: { year: 2025 }, monthlyData: [] })
    localStorage.setItem('accounting_2025', v1Raw)

    const repository = new LocalStorageRepository()
    expect(repository.load().data).toEqual(EMPTY)
    repository.save(sampleData())

    expect(localStorage.getItem('accounting_2025')).toBe(v1Raw)
  })

  describe('SPEC-005 지금 기록 옮기기 (v2 → v3)', () => {
    function oldVersionKeys(): string[] {
      return Object.keys(localStorage).filter((key) => key.startsWith(OLD_VERSION_KEY_PREFIX))
    }

    it('AC-1 v2 기록을 장부 하나로 옮겨 읽고, 옮기기 전 원본을 그대로 따로 보관한다', () => {
      const raw = v2Raw()
      localStorage.setItem(STORAGE_KEY, raw)

      const result = new LocalStorageRepository().load()

      expect(result).toEqual({
        status: 'ok',
        data: {
          schemaVersion: 3,
          books: [{ id: FIRST_BOOK_ID, name: '꽃동산 동아리', kind: 'club', ledgers: { '2026': LEDGER_2026 }, createdAt: expect.any(String) }],
          settings: { lastChangedAt: '2026-03-02T10:00:00.000Z', lastBookId: FIRST_BOOK_ID },
        },
      })
      expect(localStorage.getItem(`${OLD_VERSION_KEY_PREFIX}2`)).toBe(raw)
      expect(oldVersionKeys()).toEqual(['dongari:v2:schema-2'])
    })

    it('옮긴 데이터를 저장하면 v3 로 바뀌고, 보관한 v2 원본은 그대로 남는다', () => {
      const raw = v2Raw()
      localStorage.setItem(STORAGE_KEY, raw)
      const repository = new LocalStorageRepository()
      const { data } = repository.load()

      expect(repository.save(data)).toEqual({ ok: true })

      expect(new LocalStorageRepository().load()).toEqual({ status: 'ok', data })
      expect(localStorage.getItem(`${OLD_VERSION_KEY_PREFIX}2`)).toBe(raw)
    })

    it('저장 없이 다시 열어도 보관 키는 하나다 (같은 원본을 다시 쓰지 않는다)', () => {
      localStorage.setItem(STORAGE_KEY, v2Raw())
      new LocalStorageRepository().load()
      const setItem = vi.spyOn(Storage.prototype, 'setItem')

      expect(new LocalStorageRepository().load().status).toBe('ok')
      expect(setItem).not.toHaveBeenCalled()
      expect(oldVersionKeys()).toHaveLength(1)
    })

    it('원본을 보관하지 못하면 옮긴 기록은 보여 주되 읽기 전용으로 알리고 저장을 막아 원본을 덮어쓰지 않는다', () => {
      const raw = v2Raw()
      localStorage.setItem(STORAGE_KEY, raw)
      vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw quotaError()
      })
      const repository = new LocalStorageRepository()

      const result = repository.load()

      expect(result).toMatchObject({ status: 'read-only', reason: 'old-version-unpreserved' })
      expect(result.data.books[0]?.ledgers['2026']).toEqual(LEDGER_2026)
      expect(repository.save(result.data)).toEqual({ ok: false, reason: 'old-version-unpreserved' })
      expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
    })

    it('원본을 보관하지 못해 막아 둔 저장은 백업 불러오기로 풀린다 (사용자가 바꾸기로 했으므로)', () => {
      localStorage.setItem(STORAGE_KEY, v2Raw())
      vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw quotaError()
      })
      const repository = new LocalStorageRepository()
      repository.load()

      expect(repository.restore(sampleData())).toEqual({ ok: true })
      expect(repository.save(sampleData())).toEqual({ ok: true })
    })
  })

  describe('깨진 데이터', () => {
    it.each([
      ['JSON 이 깨짐', '{"schemaVersion": 2,'],
      ['형식이 다름', JSON.stringify({ schemaVersion: 3, books: {} })],
      ['옮기기 전(v2) 형식이 다름', JSON.stringify({ schemaVersion: 2, ledgers: [] })],
      [
        '그 달에 없는 날짜 (2026년 2월 29일)',
        JSON.stringify({
          schemaVersion: 2,
          ledgers: {
            '2026': {
              year: 2026,
              clubName: '동아리',
              carryover: 0,
              entries: [{ id: 'e1', month: 2, day: 29, type: 'income', name: '회비', amount: 1, createdAt: '2026-02-28T00:00:00.000Z' }],
            },
          },
          settings: {},
        }),
      ],
    ])('%s: 원본을 별도 키에 옮기고 빈 초기값으로 시작했다(recovered)고 알린다', (_label, raw) => {
      localStorage.setItem(STORAGE_KEY, raw)

      const repository = new LocalStorageRepository()
      expect(repository.load()).toEqual({ status: 'recovered', data: EMPTY })

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

      expect(repository.load()).toEqual({ status: 'recovered', data: EMPTY })
      expect(localStorage.getItem(brokenKeys()[0])).toBe('not json')
      expect(repository.save(sampleData())).toEqual({ ok: true })
    })

    it('원본을 보존하지 못하면 읽기 전용으로 알리고 저장을 막아 원본을 덮어쓰지 않는다', () => {
      localStorage.setItem(STORAGE_KEY, 'not json')
      vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw quotaError()
      })
      const repository = new LocalStorageRepository()
      expect(repository.load()).toEqual({ status: 'read-only', reason: 'unreadable-original', data: EMPTY })

      expect(repository.save(sampleData())).toEqual({ ok: false, reason: 'unreadable-original' })
      expect(localStorage.getItem(STORAGE_KEY)).toBe('not json')
    })
  })

  describe('상위 버전 데이터', () => {
    it('빈 초기값의 읽기 전용으로 알리고 저장을 막아 상위 버전 원본을 덮어쓰지 않는다', () => {
      const newer = JSON.stringify({ schemaVersion: 4, books: [], settings: {} })
      localStorage.setItem(STORAGE_KEY, newer)

      const repository = new LocalStorageRepository()
      expect(repository.load()).toEqual({ status: 'read-only', reason: 'newer-version', data: EMPTY })
      expect(repository.save(sampleData())).toEqual({ ok: false, reason: 'newer-version' })
      expect(localStorage.getItem(STORAGE_KEY)).toBe(newer)
    })
  })

  describe('백업 파일로 바꾸기 (restore)', () => {
    it('AC-3 백업 데이터로 통째로 바꿔 저장하고 새로고침해도 그대로다', () => {
      const repository = new LocalStorageRepository()
      repository.load()

      expect(repository.restore(sampleData())).toEqual({ ok: true })
      expect(new LocalStorageRepository().load()).toEqual({ status: 'ok', data: sampleData() })
    })

    it('원본을 옮기지 못해 막아 둔 저장은 불러오기로 풀린다 (사용자가 바꾸기로 했으므로) — 이후 저장도 된다', () => {
      localStorage.setItem(STORAGE_KEY, 'not json')
      vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw quotaError()
      })
      const repository = new LocalStorageRepository()
      expect(repository.load().status).toBe('read-only')

      expect(repository.restore(sampleData())).toEqual({ ok: true })
      expect(repository.save({ ...sampleData(), settings: {} })).toEqual({ ok: true })
      expect(new LocalStorageRepository().load()).toEqual({ status: 'ok', data: { ...sampleData(), settings: {} } })
    })

    it('불러오기를 저장하지 못하면 원본을 옮기지 못한 막힘은 그대로 남는다', () => {
      localStorage.setItem(STORAGE_KEY, 'not json')
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError()
      })
      const repository = new LocalStorageRepository()
      repository.load()

      expect(repository.restore(sampleData())).toEqual({ ok: false, reason: 'quota-exceeded' })
      setItem.mockRestore()
      expect(repository.save(sampleData())).toEqual({ ok: false, reason: 'unreadable-original' })
      expect(localStorage.getItem(STORAGE_KEY)).toBe('not json')
    })

    it('상위 버전 원본이 있으면 불러오기도 막아 새 앱의 기록을 덮어쓰지 않는다', () => {
      const newer = JSON.stringify({ schemaVersion: 4, books: [], settings: {} })
      localStorage.setItem(STORAGE_KEY, newer)
      const repository = new LocalStorageRepository()
      repository.load()

      expect(repository.restore(sampleData())).toEqual({ ok: false, reason: 'newer-version' })
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
