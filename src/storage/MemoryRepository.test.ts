import { describe, expect, it } from 'vitest'
import type { StoredData } from '../domain/types'
import { BROKEN_PAYERS, duesData, storedWith } from '../test/ledgerFixtures'
import { MemoryRepository } from './MemoryRepository'

function sampleData(): StoredData {
  return storedWith({
    year: 2026,
    carryover: 0,
    entries: [{ id: 'e1', month: 1, type: 'income', name: '회비', amount: 50_000, createdAt: '2026-01-05T00:00:00.000Z' }],
  })
}

describe('SPEC-002 저장 (메모리)', () => {
  it('AC-1 기록을 저장하고 다시 읽으면 그대로 남아 있다', () => {
    const repository = new MemoryRepository()
    const data = sampleData()

    expect(repository.save(data)).toEqual({ ok: true })
    expect(repository.load()).toEqual({ status: 'ok', data })
  })

  it('처음에는 빈 초기값을 돌려준다', () => {
    expect(new MemoryRepository().load()).toEqual({ status: 'ok', data: { schemaVersion: 4, books: [], settings: {} } })
  })

  it('저장한 뒤 원본 객체를 바꿔도 저장된 값은 바뀌지 않는다', () => {
    const repository = new MemoryRepository()
    const data = sampleData()
    repository.save(data)

    const saved = data.books[0].ledgers['2026']
    saved.entries.push({ ...saved.entries[0], id: 'e2' })

    expect(repository.load().data.books[0].ledgers['2026'].entries).toHaveLength(1)
  })

  it('AC-3 백업 데이터로 통째로 바꾸면 그 데이터를 돌려준다', () => {
    const repository = new MemoryRepository()

    expect(repository.restore(sampleData())).toEqual({ ok: true })
    expect(repository.load()).toEqual({ status: 'ok', data: sampleData() })
  })

  // 연습 장부·테스트도 폰과 같은 규칙: 규칙을 놓친 흐름이 테스트에서 "저장했어요"로 지나가지 않게 (#172)
  it.each(BROKEN_PAYERS)('SPEC-010 가드에 어긋난 데이터를 저장하면 저장소 값이 그대로이고 저장 실패로 알린다 — %s', (_, payers) => {
    const repository = new MemoryRepository(duesData())

    expect(repository.save(duesData(payers))).toEqual({ ok: false, reason: 'invalid-data' })
    expect(repository.restore(duesData(payers))).toEqual({ ok: false, reason: 'invalid-data' })
    expect(repository.load()).toEqual({ status: 'ok', data: duesData() })
  })
})
