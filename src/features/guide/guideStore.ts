// 안내 상태를 이 폰에만 둔다 (SPEC-008). 장부 데이터(dongari:v2)·기록 파일·자동으로 지키기 보관본과 따로 — dongari:keep 과 같은 방식
import { isRecord } from '../../storage/schema'
import { GUIDE_NUMBERS, GUIDE_OFF, type GuideNumber, type GuideState } from './guideRules'

export const GUIDE_KEY = 'dongari:guide'

export interface GuideStore {
  // 값이 없으면 undefined (아직 정하지 않음), 깨졌으면 안내를 끈 것
  load: () => GuideState | undefined
  save: (state: GuideState) => void
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

function isGuideNumber(value: unknown): value is GuideNumber {
  return GUIDE_NUMBERS.some((guide) => guide === value)
}

function isGuideState(value: unknown): value is GuideState {
  return (
    isRecord(value) &&
    value.v === 1 &&
    typeof value.active === 'boolean' &&
    Array.isArray(value.seen) &&
    value.seen.every(isGuideNumber)
  )
}

// 깨졌거나 읽지 못하면 끈 것으로 본다: 쓰던 분을 귀찮게 하지 않는 쪽
export function localGuideStore(storage: KeyValueStorage = localStorage): GuideStore {
  return {
    load: () => {
      try {
        const raw = storage.getItem(GUIDE_KEY)
        if (raw === null) return undefined
        const value: unknown = JSON.parse(raw)
        return isGuideState(value) ? value : GUIDE_OFF
      } catch {
        return GUIDE_OFF
      }
    },
    save: (state) => {
      try {
        storage.setItem(GUIDE_KEY, JSON.stringify(state))
      } catch {
        // 남기지 못해도 화면은 막지 않는다. 다음에 열 때 같은 말풍선이 한 번 더 뜰 수 있다
      }
    },
  }
}

// 진입점: 장부가 이미 있는데 값이 없는 폰(v2.6 전부터 쓰던 폰)은 안내를 끈 것으로 적어 둔다
export function settleExistingPhone(store: GuideStore, hasBooks: boolean) {
  if (hasBooks && store.load() === undefined) store.save(GUIDE_OFF)
}
