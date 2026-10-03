// 저장 데이터 마이그레이션. schemaVersion n → n+1 함수를 차례로 적용한 뒤 현재 스키마로 검증한다
import { CURRENT_SCHEMA_VERSION, type StoredData } from '../domain/types'
import { isRecord, isStoredData } from './schema'

// 키: 출발 버전. 값: 그 버전 데이터를 받아 다음 버전 데이터를 돌려주는 함수
export type MigrationSteps = Readonly<Record<number, (data: unknown) => unknown>>

// 실제 등록된 마이그레이션. v2 가 첫 버전이라 아직 없다.
// v3 를 만들 때 `2: (data) => ...` 를 추가한다
const MIGRATIONS: MigrationSteps = {}

// 형식이 틀렸거나 올릴 방법이 없는 데이터
export class InvalidDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDataError'
  }
}

// 이 앱보다 새 버전 앱이 저장한 데이터. 새로고침(앱 업데이트)이 필요하다
export class NewerSchemaError extends Error {
  readonly foundVersion: number

  constructor(foundVersion: number) {
    super(`저장 데이터 버전 ${foundVersion} 은 이 앱(버전 ${CURRENT_SCHEMA_VERSION})보다 높다`)
    this.name = 'NewerSchemaError'
    this.foundVersion = foundVersion
  }
}

function readVersion(data: unknown): number {
  if (!isRecord(data) || typeof data.schemaVersion !== 'number' || !Number.isInteger(data.schemaVersion)) {
    throw new InvalidDataError('schemaVersion 이 없다')
  }
  return data.schemaVersion
}

export function migrate(raw: unknown, steps: MigrationSteps = MIGRATIONS): StoredData {
  let version = readVersion(raw)
  if (version > CURRENT_SCHEMA_VERSION) throw new NewerSchemaError(version)

  let data = raw
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = steps[version]
    if (!step) throw new InvalidDataError(`버전 ${version} 에서 올릴 마이그레이션이 없다`)

    data = step(data)
    const next = readVersion(data)
    if (next !== version + 1) {
      throw new InvalidDataError(`버전 ${version} 마이그레이션이 버전 ${next} 를 만들었다`)
    }
    version = next
  }

  if (!isStoredData(data)) throw new InvalidDataError('현재 스키마 형식에 맞지 않는다')
  return data
}
