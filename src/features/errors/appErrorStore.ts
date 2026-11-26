// 앱 오류 목록을 폰에 둔다 (SPEC-012 2절): 장부(dongari:v2)와 다른 키. 백업 파일에 넣지 않는다 (폰마다 다르다).
// 읽기·쓰기 실패는 삼킨다: 오류를 기록하다 또 오류가 나도 앱은 그대로다
import { isAppError, type AppError } from './appErrors'

export const APP_ERRORS_KEY = 'dongari:errors'

export interface AppErrorStore {
  load: () => AppError[]
  save: (errors: readonly AppError[]) => void
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

// storage 를 주지 않으면 그때그때 localStorage 를 쓴다 (localStorage 에 닿는 것부터 막힌 브라우저에서도 예외 없이)
export function localAppErrorStore(storage?: KeyValueStorage): AppErrorStore {
  const target = () => storage ?? window.localStorage
  return {
    // 서버가 받지 않을 줄(예전 앱·손댄 값)은 빼고 읽는다 — 신호가 통째로 400 이 되지 않게
    load: () => {
      try {
        const raw = target().getItem(APP_ERRORS_KEY)
        const value: unknown = raw === null ? [] : JSON.parse(raw)
        return Array.isArray(value) ? value.filter(isAppError) : []
      } catch {
        return []
      }
    },
    save: (errors) => {
      try {
        target().setItem(APP_ERRORS_KEY, JSON.stringify(errors))
      } catch {
        // 저장 공간이 모자라도 넘어간다. 이번에 연 동안은 기록기 메모리의 목록으로 보낸다
      }
    },
  }
}
