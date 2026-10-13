import type { StoredData } from '../domain/types'
import type { LedgerRepository, LoadResult, SaveResult } from './LedgerRepository'

// 저장소를 감싸 저장에 성공할 때마다 알린다 (SPEC-006 자동 보관기가 듣는다).
// 저장 계층은 보관을 모르고, 보관기는 저장 방식을 모른다. 실패한 저장(읽기 전용 포함)은 알리지 않는다
export class NotifyingRepository implements LedgerRepository {
  private readonly inner: LedgerRepository
  private readonly onSaved: (data: StoredData) => void

  constructor(inner: LedgerRepository, onSaved: (data: StoredData) => void) {
    this.inner = inner
    this.onSaved = onSaved
  }

  load(): LoadResult {
    return this.inner.load()
  }

  save(data: StoredData): SaveResult {
    return this.notified(data, this.inner.save(data))
  }

  restore(data: StoredData): SaveResult {
    return this.notified(data, this.inner.restore(data))
  }

  private notified(data: StoredData, result: SaveResult): SaveResult {
    if (result.ok) this.onSaved(data)
    return result
  }
}
