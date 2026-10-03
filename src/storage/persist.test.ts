import { describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './persist'

describe('SPEC-002 영구 저장 요청', () => {
  it('브라우저가 지원하면 storage.persist() 를 호출하고 결과를 돌려준다', async () => {
    const persist = vi.fn(() => Promise.resolve(true))

    await expect(requestPersistentStorage({ persist })).resolves.toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it('storage API 가 없으면 아무것도 하지 않고 false 를 돌려준다', async () => {
    await expect(requestPersistentStorage(undefined)).resolves.toBe(false)
  })

  it('persist 함수가 없으면 아무것도 하지 않고 false 를 돌려준다', async () => {
    await expect(requestPersistentStorage({})).resolves.toBe(false)
  })

  it('persist 요청이 실패해도 앱 시작을 막지 않고 false 를 돌려준다', async () => {
    const persist = vi.fn(() => Promise.reject(new Error('거부됨')))

    await expect(requestPersistentStorage({ persist })).resolves.toBe(false)
  })
})
