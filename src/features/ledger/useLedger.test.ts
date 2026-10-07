import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ledger, StoredData } from '../../domain/types'
import type { LedgerRepository, LoadResult, SaveResult } from '../../storage/LedgerRepository'
import { LocalStorageRepository, STORAGE_KEY } from '../../storage/LocalStorageRepository'
import { MemoryRepository } from '../../storage/MemoryRepository'
import { createEmptyData } from '../../storage/schema'
import { useLedger, type UseLedgerOptions } from './useLedger'

const TODAY = new Date('2026-10-03T09:00:00.000+09:00')

function ledger2026(overrides: Partial<Ledger> = {}): Ledger {
  return {
    year: 2026,
    clubName: '한랑드림',
    carryover: 100_000,
    entries: [
      { id: 'a', month: 9, type: 'income', name: '회비', amount: 140_000, createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 'b', month: 10, type: 'expense', name: '대관료', amount: 40_000, createdAt: '2026-10-01T00:00:00.000Z' },
    ],
    ...overrides,
  }
}

function storedWith(...ledgers: Ledger[]): StoredData {
  return {
    ...createEmptyData(),
    ledgers: Object.fromEntries(ledgers.map((item) => [String(item.year), item])),
  }
}

function options(): UseLedgerOptions {
  let seq = 0
  return { now: () => TODAY, createId: () => `id-${++seq}` }
}

// 진입점처럼 저장소를 한 번만 읽고 그 결과를 훅에 넘긴다
function renderLedger(repository: LedgerRepository, loaded: LoadResult = repository.load()) {
  const deps = options()
  return renderHook(() => useLedger(repository, loaded, deps))
}

describe('SPEC-001 useLedger', () => {
  describe('시작', () => {
    it('기본으로 오늘이 속한 연도의 장부를 연다', () => {
      const { result } = renderLedger(new MemoryRepository(storedWith(ledger2026(), { ...ledger2026(), year: 2025 })))

      expect(result.current.year).toBe(2026)
      expect(result.current.ledger?.year).toBe(2026)
      expect(result.current.isFirstRun).toBe(false)
    })

    it('장부가 하나도 없으면 첫 실행이다', () => {
      const { result } = renderLedger(new MemoryRepository())

      expect(result.current.isFirstRun).toBe(true)
      expect(result.current.ledger).toBeUndefined()
      expect(result.current.totals).toBeUndefined()
    })

    it('첫 실행에서 동아리 이름·이월금으로 올해 장부를 시작하고 저장한다', () => {
      const repository = new MemoryRepository()
      const { result } = renderLedger(repository)

      act(() => result.current.startLedger({ clubName: '한랑드림', carryover: 30_000 }))

      expect(result.current.isFirstRun).toBe(false)
      expect(result.current.ledger).toEqual({ year: 2026, clubName: '한랑드림', carryover: 30_000, entries: [] })
      expect(repository.load().data.ledgers['2026']?.clubName).toBe('한랑드림')
    })

    it('렌더 중에 저장소를 다시 읽지 않고 진입점이 넘긴 시작 결과를 쓴다', () => {
      const memory = new MemoryRepository(storedWith(ledger2026()))
      const loaded = memory.load()
      let loadCalls = 0
      const counting: LedgerRepository = {
        load: () => {
          loadCalls += 1
          return memory.load()
        },
        save: (data) => memory.save(data),
        restore: (data) => memory.restore(data),
      }

      const { result, rerender } = renderLedger(counting, loaded)
      rerender()

      expect(loadCalls).toBe(0)
      expect(result.current.ledger?.clubName).toBe('한랑드림')
    })

    it('이미 있는 연도의 장부를 다시 시작하면 기록을 지키려고 거부한다', () => {
      const { result } = renderLedger(new MemoryRepository(storedWith(ledger2026())))

      expect(() => result.current.startLedger({ clubName: '새이름', carryover: 0 })).toThrow()
      expect(result.current.ledger?.entries).toHaveLength(2)
    })
  })

  describe('기록 바꾸기', () => {
    it('AC-2 기록을 추가하면 잔액이 즉시 다시 계산되고 저장된다', () => {
      const repository = new MemoryRepository(storedWith(ledger2026()))
      const { result } = renderLedger(repository)
      expect(result.current.totals?.balance).toBe(200_000)

      act(() => result.current.addEntry({ month: 10, day: 3, type: 'expense', name: '간식비', amount: 28_340 }))

      expect(result.current.totals).toEqual({ income: 140_000, expense: 68_340, balance: 171_660 })
      expect(repository.load().data.ledgers['2026']?.entries.at(-1)).toEqual({
        id: 'id-1',
        month: 10,
        day: 3,
        type: 'expense',
        name: '간식비',
        amount: 28_340,
        createdAt: TODAY.toISOString(),
      })
    })

    it('AC-2 기록을 수정하면 잔액이 즉시 다시 계산되고 저장된다', () => {
      const repository = new MemoryRepository(storedWith(ledger2026()))
      const { result } = renderLedger(repository)

      act(() => result.current.updateEntry('b', { month: 10, type: 'expense', name: '대관료', amount: 10_000 }))

      expect(result.current.totals?.balance).toBe(230_000)
      expect(repository.load().data.ledgers['2026']?.entries[1]?.amount).toBe(10_000)
    })

    it('AC-2 기록을 지우면 잔액이 즉시 다시 계산되고 저장된다', () => {
      const repository = new MemoryRepository(storedWith(ledger2026()))
      const { result } = renderLedger(repository)

      act(() => result.current.deleteEntry('b'))

      expect(result.current.totals?.balance).toBe(240_000)
      expect(repository.load().data.ledgers['2026']?.entries.map((item) => item.id)).toEqual(['a'])
    })

    it('한 번에 이어서 여러 번 바꿔도 앞의 변경을 잃지 않는다', () => {
      const repository = new MemoryRepository(storedWith(ledger2026({ entries: [] })))
      const { result } = renderLedger(repository)

      act(() => {
        result.current.addEntry({ month: 1, day: 3, type: 'income', name: '회비', amount: 1_000 })
        result.current.addEntry({ month: 2, day: 3, type: 'income', name: '회비', amount: 2_000 })
      })

      expect(result.current.ledger?.entries.map((item) => item.amount)).toEqual([1_000, 2_000])
      expect(repository.load().data.ledgers['2026']?.entries).toHaveLength(2)
    })

    it('동아리 이름·이월금을 고치면 잔액에 반영되고 저장된다', () => {
      const repository = new MemoryRepository(storedWith(ledger2026()))
      const { result } = renderLedger(repository)

      act(() => result.current.updateClubInfo({ clubName: '꽃동산', carryover: 0 }))

      expect(result.current.ledger?.clubName).toBe('꽃동산')
      expect(result.current.totals?.balance).toBe(100_000)
      expect(repository.load().data.ledgers['2026']?.clubName).toBe('꽃동산')
    })

    it('바꿀 때마다 마지막 변경 시각을 남긴다 (백업 안내용)', () => {
      const repository = new MemoryRepository(storedWith(ledger2026()))
      const { result } = renderLedger(repository)

      act(() => result.current.deleteEntry('a'))

      expect(repository.load().data.settings.lastChangedAt).toBe(TODAY.toISOString())
    })

    it('자주 쓴 항목은 지난 연도 기록까지 포함해 최근 사용 순이다', () => {
      const lastYear: Ledger = {
        year: 2025,
        clubName: '한랑드림',
        carryover: 0,
        entries: [{ id: 'x', month: 12, type: 'expense', name: '꽃값', amount: 5_000, createdAt: '2025-12-01T00:00:00.000Z' }],
      }
      const { result } = renderLedger(new MemoryRepository(storedWith(lastYear, ledger2026())))

      expect(result.current.frequentChoices('expense').map((choice) => choice.name)).toEqual(['대관료', '꽃값', '간식비'])
      expect(result.current.frequentChoices()).toEqual([
        { name: '대관료', type: 'expense' },
        { name: '회비', type: 'income' },
        { name: '꽃값', type: 'expense' },
        { name: '간식비', type: 'expense' },
      ])
    })
  })

  describe('연도', () => {
    it('연도를 바꾸면 그 해 장부를 연다', () => {
      const { result } = renderLedger(new MemoryRepository(storedWith(ledger2026(), { ...ledger2026(), year: 2025, clubName: '작년' })))

      act(() => result.current.changeYear(2025))

      expect(result.current.year).toBe(2025)
      expect(result.current.ledger?.clubName).toBe('작년')
      expect(result.current.years).toEqual([2026, 2025])
    })

    it('AC-3 처음 보이는 달은 올해 장부면 이번 달, 지난 연도로 바꾸면 12월이다', () => {
      const { result } = renderLedger(new MemoryRepository(storedWith(ledger2026(), { ...ledger2026(), year: 2025 })))

      expect(result.current.firstMonth).toBe(10)

      act(() => result.current.changeYear(2025))

      expect(result.current.firstMonth).toBe(12)
    })

    it('고를 수 있는 연도는 장부가 있는 연도와 올해, 최신 순이다', () => {
      const { result } = renderLedger(
        new MemoryRepository(storedWith({ ...ledger2026(), year: 2024 }, { ...ledger2026(), year: 2025 })),
      )

      expect(result.current.yearChoices).toEqual([2026, 2025, 2024])
    })

    it('올해 장부가 이미 있으면 올해를 두 번 넣지 않는다', () => {
      const { result } = renderLedger(new MemoryRepository(storedWith(ledger2026(), { ...ledger2026(), year: 2025 })))

      expect(result.current.yearChoices).toEqual([2026, 2025])
    })

    it('AC-8 새 연도 장부를 만들면 전년도 잔액이 이월금 기본값으로 들어간다', () => {
      const repository = new MemoryRepository(storedWith(ledger2026()))
      const { result } = renderLedger(repository)

      act(() => result.current.changeYear(2027))

      expect(result.current.ledger).toBeUndefined()
      expect(result.current.isFirstRun).toBe(false)
      expect(result.current.newLedgerDefaults).toEqual({ clubName: '한랑드림', carryover: 200_000 })

      act(() => result.current.startLedger(result.current.newLedgerDefaults))

      expect(result.current.ledger).toEqual({ year: 2027, clubName: '한랑드림', carryover: 200_000, entries: [] })
      expect(repository.load().data.ledgers['2027']?.carryover).toBe(200_000)
    })
  })

  describe('SPEC-002 저장 상태', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('정상으로 읽으면 시작 상태는 ok 이고 저장 실패가 없다', () => {
      const { result } = renderLedger(new MemoryRepository())

      expect(result.current.startup).toEqual({ status: 'ok' })
      expect(result.current.saveFailure).toBeUndefined()
    })

    it('깨진 데이터를 옮기고 빈 장부로 시작했으면 recovered 로 알린다', () => {
      localStorage.setItem(STORAGE_KEY, 'not json')

      const { result } = renderLedger(new LocalStorageRepository())

      expect(result.current.startup).toEqual({ status: 'recovered' })
      expect(result.current.isFirstRun).toBe(true)
    })

    it('새 버전 데이터라 저장할 수 없으면 read-only 로 알리고, 바꾸면 저장 실패를 노출한다', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 3 }))
      const { result } = renderLedger(new LocalStorageRepository())

      expect(result.current.startup).toEqual({ status: 'read-only', reason: 'newer-version' })

      act(() => result.current.startLedger({ clubName: '한랑드림', carryover: 0 }))

      expect(result.current.saveFailure).toBe('newer-version')
    })

    it('저장에 실패해도 화면의 장부는 바뀐 대로 두고 실패 이유를 노출한다', () => {
      let next: SaveResult = { ok: false, reason: 'quota-exceeded' }
      const memory = new MemoryRepository(storedWith(ledger2026()))
      const flaky: LedgerRepository = {
        load: () => memory.load(),
        save: (data) => (next.ok ? memory.save(data) : next),
        restore: (data) => (next.ok ? memory.restore(data) : next),
      }
      const { result } = renderLedger(flaky)

      act(() => result.current.deleteEntry('b'))

      expect(result.current.saveFailure).toBe('quota-exceeded')
      expect(result.current.ledger?.entries).toHaveLength(1)

      // 화면이 성공 알림을 띄울지 고르도록 저장 결과를 돌려준다
      let saved = true
      act(() => {
        saved = result.current.updateClubInfo({ clubName: '꽃동산', carryover: 0 })
      })
      expect(saved).toBe(false)

      // 다음 저장이 성공하면 실패 안내를 거둔다
      next = { ok: true }
      act(() => {
        saved = result.current.updateClubInfo({ clubName: '한랑드림', carryover: 0 })
      })
      expect(saved).toBe(true)

      // 기록 추가도 같은 방식으로 저장 결과를 돌려준다 (실패면 "저장했어요" 를 띄우지 않게)
      next = { ok: false, reason: 'quota-exceeded' }
      act(() => {
        saved = result.current.addEntry({ month: 10, day: 3, type: 'expense', name: '간식비', amount: 5_000 })
      })
      expect(saved).toBe(false)
      next = { ok: true }
      act(() => {
        saved = result.current.addEntry({ month: 10, day: 3, type: 'expense', name: '꽃값', amount: 3_000 })
      })
      expect(saved).toBe(true)

      // 고치기·지우기도 저장 결과를 돌려준다 (실패면 "고쳤어요"·"지웠어요" 를 띄우지 않게)
      next = { ok: false, reason: 'quota-exceeded' }
      act(() => {
        saved = result.current.updateEntry('a', { month: 3, type: 'income', name: '회비', amount: 1_000 })
      })
      expect(saved).toBe(false)
      act(() => {
        saved = result.current.deleteEntry('a')
      })
      expect(saved).toBe(false)
      next = { ok: true }
      act(() => {
        saved = result.current.updateEntry('id-2', { month: 10, type: 'expense', name: '꽃값', amount: 4_000 })
      })
      expect(saved).toBe(true)
      act(() => {
        saved = result.current.deleteEntry('id-1')
      })
      expect(saved).toBe(true)
      act(() => result.current.deleteEntry('id-2'))

      expect(result.current.saveFailure).toBeUndefined()
      expect(memory.load().data.ledgers['2026']?.entries).toEqual([])
    })
  })

  describe('SPEC-002 백업', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    const BACKUP = storedWith(ledger2026({ clubName: '꽃동산' }), { ...ledger2026(), year: 2024 })

    it('지금 기록 전체(data)를 백업용으로 준다', () => {
      const stored = storedWith(ledger2026())
      const { result } = renderLedger(new MemoryRepository(stored))

      expect(result.current.data).toEqual(stored)
    })

    it('AC-3 백업 데이터로 바꾸면 저장하고, 그 데이터 그대로(변경 시각을 덧붙이지 않고) 올해 장부를 보여 준다', () => {
      const memory = new MemoryRepository(storedWith({ ...ledger2026(), year: 2025 }))
      const { result } = renderLedger(memory)
      act(() => result.current.changeYear(2025))

      let restored: SaveResult = { ok: false, reason: 'unknown' }
      act(() => {
        restored = result.current.restoreBackup(BACKUP)
      })

      expect(restored).toEqual({ ok: true })
      expect(result.current.data).toEqual(BACKUP)
      expect(result.current.year).toBe(2026)
      expect(result.current.ledger?.clubName).toBe('꽃동산')
      expect(result.current.years).toEqual([2026, 2024])
      expect(memory.load().data).toEqual(BACKUP)
    })

    it('불러오기를 저장하지 못하면 지금 기록을 그대로 두고 실패를 돌려준다', () => {
      const stored = storedWith(ledger2026())
      const memory = new MemoryRepository(stored)
      const full: LedgerRepository = {
        load: () => memory.load(),
        save: () => ({ ok: false, reason: 'quota-exceeded' }),
        restore: () => ({ ok: false, reason: 'quota-exceeded' }),
      }
      const { result } = renderLedger(full)

      let restored: SaveResult = { ok: true }
      act(() => {
        restored = result.current.restoreBackup(BACKUP)
      })

      expect(restored).toEqual({ ok: false, reason: 'quota-exceeded' })
      expect(result.current.data).toEqual(stored)
      expect(result.current.saveFailure).toBeUndefined()
    })

    it('원본을 옮기지 못해 저장을 막았던 상태도 불러오기에 성공하면 시작 안내를 거두고 이후 저장이 된다', () => {
      localStorage.setItem(STORAGE_KEY, 'not json')
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new DOMException('용량 초과', 'QuotaExceededError')
      })
      const { result } = renderLedger(new LocalStorageRepository())
      setItem.mockRestore()
      expect(result.current.startup).toEqual({ status: 'read-only', reason: 'unreadable-original' })

      act(() => {
        result.current.restoreBackup(BACKUP)
      })

      expect(result.current.startup).toEqual({ status: 'ok' })
      let saved = false
      act(() => {
        saved = result.current.addEntry({ month: 10, day: 3, type: 'expense', name: '간식비', amount: 5_000 })
      })
      expect(saved).toBe(true)
      expect(new LocalStorageRepository().load().data.ledgers['2026']?.entries).toHaveLength(3)
    })

    it('새 버전 기록이 있어 저장을 막은 상태에서는 불러오기도 막고 지금 화면을 그대로 둔다', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 3 }))
      const { result } = renderLedger(new LocalStorageRepository())

      let restored: SaveResult = { ok: true }
      act(() => {
        restored = result.current.restoreBackup(BACKUP)
      })

      expect(restored).toEqual({ ok: false, reason: 'newer-version' })
      expect(result.current.isFirstRun).toBe(true)
      expect(result.current.startup).toEqual({ status: 'read-only', reason: 'newer-version' })
    })

    it('백업을 보냈으면 마지막 백업 시각만 기록하고 변경 시각은 그대로 둔다', () => {
      const stored = { ...storedWith(ledger2026()), settings: { lastChangedAt: '2026-09-30T00:00:00.000Z' } }
      const memory = new MemoryRepository(stored)
      const { result } = renderLedger(memory)

      act(() => result.current.recordBackup())

      expect(memory.load().data.settings).toEqual({
        lastChangedAt: '2026-09-30T00:00:00.000Z',
        lastBackupAt: TODAY.toISOString(),
      })
      expect(result.current.data.settings.lastBackupAt).toBe(TODAY.toISOString())
    })
  })
})
