import { describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './persist'

describe('SPEC-002 오래 보관 요청 (storage.persist)', () => {
  it('아직 오래 보관이 아니면(persisted false) persist() 를 요청하고 그 결과를 돌려준다', async () => {
    const persisted = vi.fn(() => Promise.resolve(false))
    const persist = vi.fn(() => Promise.resolve(true))

    await expect(requestPersistentStorage({ persisted, persist })).resolves.toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it('이미 오래 보관이면(persisted true) persist() 를 다시 요청하지 않는다', async () => {
    const persist = vi.fn(() => Promise.resolve(true))

    await expect(requestPersistentStorage({ persisted: () => Promise.resolve(true), persist })).resolves.toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('브라우저가 허락하지 않으면 false 를 돌려준다', async () => {
    await expect(
      requestPersistentStorage({ persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) }),
    ).resolves.toBe(false)
  })

  it('storage API 가 없으면 아무것도 하지 않고 false 를 돌려준다', async () => {
    await expect(requestPersistentStorage(undefined)).resolves.toBe(false)
  })

  it('persisted·persist 중 하나라도 없으면 요청하지 않고 false 를 돌려준다', async () => {
    const persist = vi.fn(() => Promise.resolve(true))

    await expect(requestPersistentStorage({ persist })).resolves.toBe(false)
    await expect(requestPersistentStorage({ persisted: () => Promise.resolve(false) })).resolves.toBe(false)
    expect(persist).not.toHaveBeenCalled()
  })

  it('persisted·persist 가 실패해도 오류를 내지 않고 false 를 돌려준다', async () => {
    const failing = () => Promise.reject(new Error('거부됨'))

    await expect(requestPersistentStorage({ persisted: failing, persist: () => Promise.resolve(true) })).resolves.toBe(false)
    await expect(requestPersistentStorage({ persisted: () => Promise.resolve(false), persist: failing })).resolves.toBe(false)
  })
})
