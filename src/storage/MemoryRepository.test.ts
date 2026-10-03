import { describe, expect, it } from 'vitest'
import type { StoredData } from '../domain/types'
import { MemoryRepository } from './MemoryRepository'

function sampleData(): StoredData {
  return {
    schemaVersion: 2,
    ledgers: {
      '2026': {
        year: 2026,
        clubName: '꽃동산 동아리',
        carryover: 0,
        entries: [{ id: 'e1', month: 1, type: 'income', name: '회비', amount: 50_000, createdAt: '2026-01-05T00:00:00.000Z' }],
      },
    },
    settings: {},
  }
}

describe('SPEC-002 저장 (메모리)', () => {
  it('AC-1 기록을 저장하고 다시 읽으면 그대로 남아 있다', () => {
    const repository = new MemoryRepository()
    const data = sampleData()

    expect(repository.save(data)).toEqual({ ok: true })
    expect(repository.load()).toEqual(data)
  })

  it('처음에는 빈 초기값을 돌려준다', () => {
    expect(new MemoryRepository().load()).toEqual({ schemaVersion: 2, ledgers: {}, settings: {} })
  })

  it('저장한 뒤 원본 객체를 바꿔도 저장된 값은 바뀌지 않는다', () => {
    const repository = new MemoryRepository()
    const data = sampleData()
    repository.save(data)

    data.ledgers['2026'].entries.push({ ...data.ledgers['2026'].entries[0], id: 'e2' })

    expect(repository.load().ledgers['2026'].entries).toHaveLength(1)
  })
})
