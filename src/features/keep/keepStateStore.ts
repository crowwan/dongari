// 자동 보관 상태를 기기에 둔다 (SPEC-006). 저장 데이터(dongari:v2)와 따로 — 폰마다 다르고 백업 파일에 넣지 않는다
import { isRecord } from '../../storage/schema'
import type { KeepState, KeepStateStore } from './AutoKeeper'

export const KEEP_STATE_KEY = 'dongari:keep'

const INITIAL: KeepState = { enabled: true }

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isKeepState(value: unknown): value is KeepState {
  return (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    isOptionalString(value.lastKeptAt) &&
    isOptionalString(value.pendingSince) &&
    (value.tooLarge === undefined || typeof value.tooLarge === 'boolean')
  )
}

// 읽지 못하면(깨짐·막힘) 처음 상태: 한 번 더 올리게 될 뿐 잃는 것은 없다
export function localKeepStateStore(storage: KeyValueStorage = localStorage): KeepStateStore {
  return {
    load: () => {
      try {
        const raw = storage.getItem(KEEP_STATE_KEY)
        const value: unknown = raw === null ? undefined : JSON.parse(raw)
        return isKeepState(value) ? value : INITIAL
      } catch {
        return INITIAL
      }
    },
    save: (state) => {
      try {
        storage.setItem(KEEP_STATE_KEY, JSON.stringify(state))
      } catch {
        // 보관 상태를 남기지 못해도 앱 저장·보관은 그대로다 (다음에 열 때 한 번 더 올린다)
      }
    },
  }
}
