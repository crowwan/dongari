import type { StoredData } from '../domain/types'
import type { LedgerRepository, LoadResult, SaveResult } from './LedgerRepository'
import { createEmptyData, isStoredData } from './schema'

// 메모리에만 두는 저장소: 테스트와 연습 장부(SPEC-008, 폰에 아무것도 남기지 않는다)가 쓴다.
// 저장·읽기 때 복사해서 바깥 객체 변경이 저장값에 새지 않게 한다.
// 저장 전 가드는 폰 저장소와 같다: 규칙을 놓친 흐름이 테스트에서 "저장했어요"로 지나가지 않게 (#172)
export class MemoryRepository implements LedgerRepository {
  private data: StoredData

  constructor(initial: StoredData = createEmptyData()) {
    this.data = structuredClone(initial)
  }

  load(): LoadResult {
    return { status: 'ok', data: structuredClone(this.data) }
  }

  save(data: StoredData): SaveResult {
    if (!isStoredData(data)) return { ok: false, reason: 'invalid-data' }
    this.data = structuredClone(data)
    return { ok: true }
  }

  restore(data: StoredData): SaveResult {
    return this.save(data)
  }
}
