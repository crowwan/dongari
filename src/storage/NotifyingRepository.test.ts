import { describe, expect, it, vi } from 'vitest'
import { storedWith, ledger } from '../test/ledgerFixtures'
import type { LedgerRepository } from './LedgerRepository'
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
})
