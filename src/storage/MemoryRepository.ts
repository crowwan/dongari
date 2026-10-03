import type { StoredData } from '../domain/types'
import type { LedgerRepository, SaveResult } from './LedgerRepository'
import { createEmptyData } from './schema'

// 테스트용 저장소. 저장·읽기 때 복사해서 바깥 객체 변경이 저장값에 새지 않게 한다
export class MemoryRepository implements LedgerRepository {
  private data: StoredData

  constructor(initial: StoredData = createEmptyData()) {
    this.data = structuredClone(initial)
  }

  load(): StoredData {
    return structuredClone(this.data)
  }

  save(data: StoredData): SaveResult {
    this.data = structuredClone(data)
    return { ok: true }
  }
}
