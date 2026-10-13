import { describe, expect, it } from 'vitest'
import { KEEP_STATE_KEY, localKeepStateStore } from './keepStateStore'

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
  }
}

describe('SPEC-006 기기의 자동 보관 상태', () => {
  it('처음에는 켜짐 (기본 켜짐)', () => {
    expect(localKeepStateStore(memoryStorage()).load()).toEqual({ enabled: true })
  })

  it('저장한 상태를 dongari:keep 에 두고 다시 읽는다', () => {
    const storage = memoryStorage()
    const store = localKeepStateStore(storage)
    store.save({ enabled: false, lastKeptAt: '2026-10-13T00:00:00.000Z' })
    expect(JSON.parse(storage.items.get(KEEP_STATE_KEY) ?? '')).toEqual({ enabled: false, lastKeptAt: '2026-10-13T00:00:00.000Z' })
    expect(store.load()).toEqual({ enabled: false, lastKeptAt: '2026-10-13T00:00:00.000Z' })
  })

  it('깨졌거나 모양이 다르면 처음 상태로 읽는다', () => {
    expect(localKeepStateStore(memoryStorage({ [KEEP_STATE_KEY]: '{깨짐' })).load()).toEqual({ enabled: true })
    expect(localKeepStateStore(memoryStorage({ [KEEP_STATE_KEY]: '{"enabled":"네"}' })).load()).toEqual({ enabled: true })
  })

  it('기기에 쓰지 못해도 오류를 내지 않는다 (보관 상태는 잃어도 앱은 그대로)', () => {
    const storage = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('가득 참')
      },
    }
    const store = localKeepStateStore(storage)
    expect(store.load()).toEqual({ enabled: true })
    expect(() => store.save({ enabled: true })).not.toThrow()
  })
})
