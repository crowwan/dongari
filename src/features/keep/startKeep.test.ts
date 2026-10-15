import { describe, expect, it, vi } from 'vitest'
import type { LoadResult } from '../../storage/LedgerRepository'
import { MemoryRepository } from '../../storage/MemoryRepository'
import { createEmptyData } from '../../storage/schema'
import { ledger, storedWith } from '../../test/ledgerFixtures'
import { createKeep, startKeep, withStartupRecoveryCode } from './startKeep'

const CODE = 'HK7M-29QF-MX4P-8R2D'
const DATA = storedWith(ledger([[3, 'income', '회비', 10_000]], { year: 2026 }))

describe('SPEC-006 이 버전을 처음 열 때 복구 코드', () => {
  it('AC-1 장부가 있고 코드가 없으면 코드를 만들어 기기에 저장하고 그 데이터로 연다', () => {
    const repository = new MemoryRepository(DATA)
    const loaded = withStartupRecoveryCode(repository, repository.load(), () => CODE)

    expect(loaded.data.settings.recoveryCode).toBe(CODE)
    expect(repository.load().data.settings.recoveryCode).toBe(CODE)
    // 기록을 바꾼 것이 아니라 변경 시각(백업 안내)은 그대로
    expect(repository.load().data.settings.lastChangedAt).toBeUndefined()
  })

  it('이미 코드가 있거나 장부가 없으면 그대로 둔다', () => {
    const withCode = new MemoryRepository({ ...DATA, settings: { recoveryCode: CODE } })
    const loadedWithCode = withCode.load()
    expect(withStartupRecoveryCode(withCode, loadedWithCode, () => 'AAAA-BBBB-CCCC-DDDD')).toBe(loadedWithCode)

    const empty = new MemoryRepository(createEmptyData())
    const loadedEmpty = empty.load()
    expect(withStartupRecoveryCode(empty, loadedEmpty, () => CODE)).toBe(loadedEmpty)
  })

  it('읽기 전용이면 저장하지 않고 만들지도 않는다', () => {
    const repository = new MemoryRepository(DATA)
    const loaded: LoadResult = { status: 'read-only', reason: 'old-version-unpreserved', data: DATA }
    expect(withStartupRecoveryCode(repository, loaded, () => CODE)).toBe(loaded)
    expect(repository.load().data.settings.recoveryCode).toBeUndefined()
  })
})

describe('SPEC-007 앱을 열 때 자동 보관 시작 (상태 신호)', () => {
  it('AC-2 읽기 전용이면 시작하지 않아 신호도 보내지 않는다', async () => {
    const keeper = { start: vi.fn(async () => {}) }
    await startKeep(keeper, { status: 'read-only', reason: 'old-version-unpreserved', data: DATA })
    expect(keeper.start).not.toHaveBeenCalled()
  })

  it('저장할 수 있으면 읽은 기록으로 시작한다', async () => {
    const keeper = { start: vi.fn(async () => {}) }
    await startKeep(keeper, { status: 'ok', data: DATA })
    expect(keeper.start).toHaveBeenCalledWith(DATA)
  })

  it('AC-2 서버 주소(VITE_KEEP_URL)가 없는 빌드는 자동 보관이 없어 신호도 보내지 않는다', () => {
    expect(createKeep(undefined)).toBeUndefined()
    expect(createKeep('')).toBeUndefined()
  })
})
