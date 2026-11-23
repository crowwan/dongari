import { describe, expect, it, vi } from 'vitest'
import { duesData, ledger, PAYERS_OFF_AMOUNT, PAYERS_OFF_ROSTER, storedWith } from '../test/ledgerFixtures'
import type { LedgerRepository } from './LedgerRepository'
import { LocalStorageRepository } from './LocalStorageRepository'
import { MemoryRepository } from './MemoryRepository'
import { NotifyingRepository } from './NotifyingRepository'

const DATA = storedWith(ledger([[3, 'income', '회비', 10_000]], { year: 2026 }))

describe('SPEC-006 저장 성공 알림 (자동 보관기와 저장 계층 사이)', () => {
  it('저장·바꾸기에 성공하면 저장한 데이터를 알린다', () => {
    const onSaved = vi.fn()
    const repository = new NotifyingRepository(new MemoryRepository(), onSaved)

    expect(repository.save(DATA)).toEqual({ ok: true })
    expect(repository.restore(DATA)).toEqual({ ok: true })
    expect(onSaved).toHaveBeenCalledTimes(2)
    expect(onSaved).toHaveBeenLastCalledWith(DATA)
  })

  it('저장하지 못하면(읽기 전용·용량) 알리지 않는다', () => {
    const onSaved = vi.fn()
    const failing: LedgerRepository = {
      load: () => ({ status: 'read-only', reason: 'newer-version', data: DATA }),
      save: () => ({ ok: false, reason: 'newer-version' }),
      restore: () => ({ ok: false, reason: 'quota-exceeded' }),
    }
    const repository = new NotifyingRepository(failing, onSaved)

    expect(repository.save(DATA)).toEqual({ ok: false, reason: 'newer-version' })
    expect(repository.restore(DATA).ok).toBe(false)
    expect(repository.load().status).toBe('read-only')
    expect(onSaved).not.toHaveBeenCalled()
  })

  // 폰 저장소 그대로 감싸 본다: 가드가 막은 데이터가 자동으로 지키기 보관본으로 올라가지 않게 (#172)
  it('가드에 어긋나 저장하지 않은 데이터는 알리지 않는다 (자동으로 지키기가 보관하지 않음)', () => {
    localStorage.clear()
    const onSaved = vi.fn()
    const repository = new NotifyingRepository(new LocalStorageRepository(), onSaved)
    repository.load()

    expect(repository.save(duesData(PAYERS_OFF_ROSTER))).toEqual({ ok: false, reason: 'invalid-data' })
    expect(repository.restore(duesData(PAYERS_OFF_AMOUNT))).toEqual({ ok: false, reason: 'invalid-data' })
    expect(onSaved).not.toHaveBeenCalled()

    expect(repository.save(duesData())).toEqual({ ok: true })
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(duesData())
  })
})
