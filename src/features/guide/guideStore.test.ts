import { describe, expect, it } from 'vitest'
import { ACTIVE_GUIDE, GUIDE_OFF } from './guideRules'
import { GUIDE_KEY, localGuideStore, settleExistingPhone } from './guideStore'

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

describe('SPEC-008 안내 상태 저장 (dongari:guide)', () => {
  it('값이 없으면 "아직 정하지 않음"(undefined) 으로 읽는다', () => {
    expect(localGuideStore(memoryStorage()).load()).toBeUndefined()
  })

  it('저장한 상태를 dongari:guide 에 { v: 1, active, seen } 으로 두고 다시 읽는다', () => {
    const storage = memoryStorage()
    const store = localGuideStore(storage)
    store.save({ v: 1, active: true, seen: [1, 2] })
    expect(JSON.parse(storage.items.get(GUIDE_KEY) ?? '')).toEqual({ v: 1, active: true, seen: [1, 2] })
    expect(store.load()).toEqual({ v: 1, active: true, seen: [1, 2] })
  })

  it('값이 깨졌거나 모양이 다르면 안내를 끈 것으로 읽는다', () => {
    expect(localGuideStore(memoryStorage({ [GUIDE_KEY]: '{깨짐' })).load()).toEqual(GUIDE_OFF)
    expect(localGuideStore(memoryStorage({ [GUIDE_KEY]: '{"v":1,"active":"네","seen":[]}' })).load()).toEqual(GUIDE_OFF)
    expect(localGuideStore(memoryStorage({ [GUIDE_KEY]: '{"v":1,"active":true,"seen":[9]}' })).load()).toEqual(GUIDE_OFF)
    expect(localGuideStore(memoryStorage({ [GUIDE_KEY]: '{"v":2,"active":true,"seen":[]}' })).load()).toEqual(GUIDE_OFF)
  })

  it('기기에 읽고 쓰지 못해도 오류를 내지 않는다 (화면을 막지 않는다)', () => {
    const store = localGuideStore({
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('가득 참')
      },
    })
    expect(store.load()).toEqual(GUIDE_OFF)
    expect(() => store.save(ACTIVE_GUIDE)).not.toThrow()
  })

  it('장부가 이미 있는데 값이 없는 폰(v2.5 에서 넘어옴)은 안내를 끈 것으로 적어 둔다', () => {
    const storage = memoryStorage()
    settleExistingPhone(localGuideStore(storage), true)
    expect(localGuideStore(storage).load()).toEqual(GUIDE_OFF)
  })

  it('장부가 없는 첫 실행이거나 이미 값이 있으면 그대로 둔다', () => {
    const empty = memoryStorage()
    settleExistingPhone(localGuideStore(empty), false)
    expect(empty.items.has(GUIDE_KEY)).toBe(false)

    const active = memoryStorage({ [GUIDE_KEY]: JSON.stringify(ACTIVE_GUIDE) })
    settleExistingPhone(localGuideStore(active), true)
    expect(localGuideStore(active).load()).toEqual(ACTIVE_GUIDE)
  })
})
