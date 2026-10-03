import type { StoredData } from '../domain/types'
import type { LedgerRepository, SaveFailureReason, SaveResult } from './LedgerRepository'
import { migrate, NewerSchemaError } from './migrate'
import { createEmptyData } from './schema'

export const STORAGE_KEY = 'dongari:v2'
// 읽을 수 없는 원본을 보존하는 키 접두사. 뒤에 보존 시각이 붙는다
export const BROKEN_KEY_PREFIX = 'dongari:v2:broken:'

// 원본을 덮어쓰면 안 되는 상황. 이때 save 는 쓰지 않고 실패를 돌려준다
// 이 저장소가 쓰는 Storage 기능만 (테스트에서 바꿔 끼울 수 있게)
type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type SaveBlock = Extract<SaveFailureReason, 'newer-version' | 'unreadable-original'>

function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

export class LocalStorageRepository implements LedgerRepository {
  private readonly storage: KeyValueStorage
  private saveBlock: SaveBlock | undefined

  constructor(storage: KeyValueStorage = localStorage) {
    this.storage = storage
  }

  // 데이터가 없거나 읽을 수 없으면 빈 초기값으로 시작한다. 원본은 조용히 버리지 않는다
  // - 깨진/형식이 다른 데이터: 별도 키에 보존하고 원래 키를 비운 뒤 이후 저장을 허용
  // - 상위 버전 데이터: 새 앱이 다시 읽을 수 있게 이후 저장을 막는다
  load(): StoredData {
    this.saveBlock = undefined
    const raw = this.storage.getItem(STORAGE_KEY)
    if (raw === null) return createEmptyData()

    try {
      return migrate(JSON.parse(raw))
    } catch (error) {
      if (error instanceof NewerSchemaError) {
        this.saveBlock = 'newer-version'
      } else if (!this.preserveBroken(raw)) {
        this.saveBlock = 'unreadable-original'
      }
      return createEmptyData()
    }
  }

  save(data: StoredData): SaveResult {
    if (this.saveBlock) return { ok: false, reason: this.saveBlock }

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data))
      return { ok: true }
    } catch (error) {
      if (isQuotaExceeded(error)) return { ok: false, reason: 'quota-exceeded' }
      return { ok: false, reason: 'unknown', error }
    }
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
