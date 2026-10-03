import type { StoredData } from '../domain/types'

// 저장 실패 이유
// - quota-exceeded: 저장 공간 부족
// - newer-version: 저장소에 더 새 버전 데이터가 있어 덮어쓰지 않음 (앱 새로고침 필요)
// - unreadable-original: 읽을 수 없는 원본을 따로 보존하지 못해 덮어쓰지 않음
// - unknown: 그 밖의 오류 (error 에 원인)
export type SaveFailureReason = 'quota-exceeded' | 'newer-version' | 'unreadable-original' | 'unknown'

export type SaveResult = { ok: true } | { ok: false; reason: SaveFailureReason; error?: unknown }

// 저장소 경계. 나중에 IndexedDB·클라우드로 바꿀 때 이 인터페이스 구현만 교체한다 (ADR 001)
export interface LedgerRepository {
  // 항상 쓸 수 있는 데이터를 돌려준다. 없거나 읽을 수 없으면 빈 초기값
  load(): StoredData
  // 실패는 예외 대신 결과로 알린다. 호출자는 ok 를 확인해 안내를 띄운다
  save(data: StoredData): SaveResult
}
