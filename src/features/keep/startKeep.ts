// 앱 시작 때 자동 보관 준비 (SPEC-006). 진입점(main.tsx)이 저장소를 한 번 읽은 직후 부른다
import type { LedgerRepository, LoadResult } from '../../storage/LedgerRepository'
import { AutoKeeper } from './AutoKeeper'
import { createKeepServer, type KeepServer } from './keepServer'
import { localKeepStateStore } from './keepStateStore'
import { createRecoveryCode, withRecoveryCode } from './recoveryCode'

// 자동 보관 기능: 보관기(저장 알림 → 올리기)와 서버(복구 코드로 불러오기)
export interface Keep {
  keeper: AutoKeeper
  server: KeepServer
}

// 서버 주소(빌드 환경변수 VITE_KEEP_URL)가 없으면 기능이 꺼진다 — 주소가 정해지기 전에도 앱은 그대로 동작
export function createKeep(keepUrl: string | undefined): Keep | undefined {
  if (!keepUrl) return undefined
  const server = createKeepServer(keepUrl)
  return { keeper: new AutoKeeper({ server, store: localKeepStateStore() }), server }
}

// 앱을 열 때 올리기·상태 신호 (SPEC-006·007). 읽기 전용이면 둘 다 하지 않는다
// (백업을 불러와 저장 막힘이 풀리면 그 저장부터 올린다)
export function startKeep(keeper: Pick<AutoKeeper, 'start'>, loaded: LoadResult): Promise<void> {
  if (loaded.status === 'read-only') return Promise.resolve()
  return keeper.start(loaded.data)
}

// 장부가 있는데 복구 코드가 없으면(이 버전을 처음 연 폰) 코드를 만들어 저장한다 (AC-1).
// 기록 변경이 아니라 변경 시각은 남기지 않는다. 읽기 전용이면 원본을 지키려고 건드리지 않는다.
// 저장에 실패해도 만든 코드로 연다 — 다음 저장 때 같이 저장된다
export function withStartupRecoveryCode(
  repository: LedgerRepository,
  loaded: LoadResult,
  createCode: () => string = createRecoveryCode,
): LoadResult {
  if (loaded.status === 'read-only') return loaded
  const data = withRecoveryCode(loaded.data, createCode)
  if (data === loaded.data) return loaded
  repository.save(data)
  return { ...loaded, data }
}
