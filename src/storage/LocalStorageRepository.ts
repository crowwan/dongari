import type { StoredData } from '../domain/types'
import type { LedgerRepository, LoadResult, ReadOnlyReason, SaveResult } from './LedgerRepository'
import { migrate, NewerSchemaError } from './migrate'
import { createEmptyData } from './schema'

export const STORAGE_KEY = 'dongari:v2'
// 읽을 수 없는 원본을 보존하는 키 접두사. 뒤에 보존 시각이 붙는다
export const BROKEN_KEY_PREFIX = 'dongari:v2:broken:'

// 이 저장소가 쓰는 Storage 기능만 (테스트에서 바꿔 끼울 수 있게)
type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

export class LocalStorageRepository implements LedgerRepository {
  private readonly storage: KeyValueStorage
  // 원본을 덮어쓰면 안 되는 상황. 이때 save 는 쓰지 않고 실패를 돌려준다
  private saveBlock: ReadOnlyReason | undefined

  constructor(storage: KeyValueStorage = localStorage) {
    this.storage = storage
  }

  // 데이터가 없거나 읽을 수 없으면 빈 초기값으로 시작한다. 원본은 조용히 버리지 않는다
  // - 깨진/형식이 다른 데이터: 별도 키에 보존하고 원래 키를 비운 뒤 이후 저장을 허용 (recovered)
  //   보존하지 못하면 원본을 덮어쓰지 않게 저장을 막는다 (read-only: unreadable-original)
  // - 상위 버전 데이터: 새 앱이 다시 읽을 수 있게 이후 저장을 막는다 (read-only: newer-version)
  load(): LoadResult {
    this.saveBlock = undefined
    const raw = this.storage.getItem(STORAGE_KEY)
    if (raw === null) return { status: 'ok', data: createEmptyData() }

    try {
      return { status: 'ok', data: migrate(JSON.parse(raw)) }
    } catch (error) {
      if (error instanceof NewerSchemaError) return this.readOnly('newer-version')
      if (!this.preserveBroken(raw)) return this.readOnly('unreadable-original')
      return { status: 'recovered', data: createEmptyData() }
    }
  }

  save(data: StoredData): SaveResult {
    if (this.saveBlock) return { ok: false, reason: this.saveBlock }
    return this.write(data)
  }

  restore(data: StoredData): SaveResult {
    if (this.saveBlock === 'newer-version') return { ok: false, reason: this.saveBlock }
    const result = this.write(data)
    // 써지지 않았으면 원본도 그대로 남아 있으니 막힘을 유지한다
    if (result.ok) this.saveBlock = undefined
    return result
  }

  private write(data: StoredData): SaveResult {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data))
      return { ok: true }
    } catch (error) {
      if (isQuotaExceeded(error)) return { ok: false, reason: 'quota-exceeded' }
      return { ok: false, reason: 'unknown', error }
    }
  }

  private readOnly(reason: ReadOnlyReason): LoadResult {
    this.saveBlock = reason
    return { status: 'read-only', reason, data: createEmptyData() }
  }

  // 원본을 보존 키로 옮긴다. 원래 키를 비워야 다음 load 때 같은 원본을 또 보존하지 않는다
  private preserveBroken(raw: string): boolean {
    try {
      this.storage.setItem(`${BROKEN_KEY_PREFIX}${new Date().toISOString()}`, raw)
    } catch {
      return false
    }
    try {
      // 덮어쓰기(setItem) 대신 삭제: 용량이 부족해도 실패하지 않는다
      this.storage.removeItem(STORAGE_KEY)
    } catch {
      // 원본은 이미 보존했다. 다음 save 가 원래 키를 덮어쓰므로 그대로 진행한다
    }
    return true
  }
}
