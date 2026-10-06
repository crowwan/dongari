import type { StoredData } from '../domain/types'

// 저장 실패 이유
// - quota-exceeded: 저장 공간 부족
// - newer-version: 저장소에 더 새 버전 데이터가 있어 덮어쓰지 않음 (앱 새로고침 필요)
// - unreadable-original: 읽을 수 없는 원본을 따로 보존하지 못해 덮어쓰지 않음
// - unknown: 그 밖의 오류 (error 에 원인)
export type SaveFailureReason = 'quota-exceeded' | 'newer-version' | 'unreadable-original' | 'unknown'

export type SaveResult = { ok: true } | { ok: false; reason: SaveFailureReason; error?: unknown }

// 시작 시점에 저장소를 그대로 쓸 수 없어 막아 둔 저장 (이후 save 가 이 이유로 실패한다)
export type ReadOnlyReason = Extract<SaveFailureReason, 'newer-version' | 'unreadable-original'>

// 읽은 데이터와 시작 상태. 화면은 status 로 시작 안내를 띄운다 (SPEC-002)
// - ok: 정상 (저장된 데이터가 없어 빈 초기값인 경우 포함)
// - recovered: 깨진 원본을 따로 옮겨 두고 빈 초기값으로 시작했다. 저장은 된다
// - read-only: 빈 초기값으로 보여 주지만 원본을 지키려고 저장을 막았다
export type LoadResult =
  | { status: 'ok'; data: StoredData }
  | { status: 'recovered'; data: StoredData }
  | { status: 'read-only'; reason: ReadOnlyReason; data: StoredData }

// 저장소 경계. 나중에 IndexedDB·클라우드로 바꿀 때 이 인터페이스 구현만 교체한다 (ADR 001)
export interface LedgerRepository {
  // 항상 쓸 수 있는 데이터를 돌려준다. 없거나 읽을 수 없으면 빈 초기값 + 그 이유
  load(): LoadResult
  // 실패는 예외 대신 결과로 알린다. 호출자는 ok 를 확인해 안내를 띄운다
  save(data: StoredData): SaveResult
  // 사용자가 백업 파일로 기록을 통째로 바꾼다 (SPEC-002 백업). 저장 결과는 save 와 같다.
  // 읽을 수 없던 원본 때문에 막아 둔 저장(unreadable-original)은 사용자가 바꾸기로 했으므로 성공하면 풀고,
  // 상위 버전 원본(newer-version)은 새 앱이 다시 읽어야 하므로 계속 막는다
  restore(data: StoredData): SaveResult
}
