// 첫 실행 연습을 끝 화면까지 마쳤다는 표시 (SPEC-009 B "연습을 마쳤다는 표시").
// 설치 확인 화면에서 장부를 만들기 전에 홈 화면 아이콘으로 먼저 열어도 "처음이세요?" 를 다시 묻지 않으려고 둔다.
// 이 폰에만 둔다 — 장부 데이터(dongari:v2)·기록 파일·보관본과 따로, installOffer.ts 와 같은 방식
import { isRecord } from '../../storage/schema'

export const PRACTICE_MARK_KEY = 'dongari:practice'

export interface PracticeMarkStore {
  // 표시가 있는지. 값이 없거나 깨졌으면 없는 것으로 본다 (물음부터)
  load: () => boolean
  save: () => void
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export function localPracticeMarkStore(storage: KeyValueStorage = localStorage): PracticeMarkStore {
  return {
    load: () => {
      try {
        const value: unknown = JSON.parse(storage.getItem(PRACTICE_MARK_KEY) ?? 'null')
        return isRecord(value) && value.v === 1 && value.done === true
      } catch {
        return false
      }
    },
    save: () => {
      try {
        storage.setItem(PRACTICE_MARK_KEY, JSON.stringify({ v: 1, done: true }))
      } catch {
        // 남기지 못해도 화면은 막지 않는다. 장부 없이 다시 열면 물음부터 다시 본다
      }
    },
  }
}
