import { describe, expect, it } from 'vitest'
import { localPracticeMarkStore, PRACTICE_MARK_KEY } from './practiceMark'

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

describe('SPEC-009 연습을 마쳤다는 표시 dongari:practice', () => {
  it('적은 적 없으면 표시가 없다', () => {
    expect(localPracticeMarkStore(memoryStorage()).load()).toBe(false)
  })

  it('끝 화면에 닿으면 { v: 1, done: true } 로 적고 다음에 읽으면 표시가 있다', () => {
    const storage = memoryStorage()
    localPracticeMarkStore(storage).save()

    expect(JSON.parse(storage.items.get(PRACTICE_MARK_KEY) ?? '')).toEqual({ v: 1, done: true })
    expect(localPracticeMarkStore(storage).load()).toBe(true)
  })

  it('AC-22 값이 깨졌거나 모르는 모양이면 표시가 없는 것으로 본다 (물음부터)', () => {
    for (const raw of ['{', 'null', '{"v":2,"done":true}', '{"v":1,"done":"yes"}', '{"v":1,"done":false}']) {
      expect(localPracticeMarkStore(memoryStorage({ [PRACTICE_MARK_KEY]: raw })).load()).toBe(false)
    }
  })

  it('읽기·쓰기에 실패해도 화면을 막지 않는다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    expect(localPracticeMarkStore(broken).load()).toBe(false)
    expect(() => localPracticeMarkStore(broken).save()).not.toThrow()
  })
})
