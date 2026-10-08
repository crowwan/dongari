// 저장 데이터 마이그레이션. schemaVersion n → n+1 함수를 차례로 적용한 뒤 현재 스키마로 검증한다
import { CURRENT_SCHEMA_VERSION, type StoredData } from '../domain/types'
import { isRecord, isStoredData } from './schema'

// 키: 출발 버전. 값: 그 버전 데이터를 받아 다음 버전 데이터를 돌려주는 함수
export type MigrationSteps = Readonly<Record<number, (data: unknown) => unknown>>

// 형식이 틀렸거나 올릴 방법이 없는 데이터
export class InvalidDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDataError'
  }
}

// v2 기록을 옮긴 첫 장부의 id. 새로 만드는 장부는 무작위 id 라 겹치지 않는다
export const FIRST_BOOK_ID = 'book-1'

// v2 → v3 (SPEC-005 지금 기록 옮기기): 연도별 장부들을 동아리·모임 장부 하나로.
// 연도마다 있던 동아리 이름은 장부 이름 하나로 올린다 — 가장 최근 연도의 이름(앱을 열면 보이던 이름).
// 기록·이월금·설정은 그대로 두고, 이 장부를 마지막에 본 장부로 정한다. 장부가 없었으면(첫 실행 전) 장부 없이.
// 나머지 형식은 옮긴 뒤 현재 스키마 검증이 본다
function booksFromV2(data: unknown): unknown {
  if (!isRecord(data) || !isRecord(data.ledgers) || !isRecord(data.settings)) {
    throw new InvalidDataError('v2 장부·설정 형식이 아니다')
  }
  const named = Object.entries(data.ledgers).map(([key, item]) => {
    if (!isRecord(item) || typeof item.clubName !== 'string' || typeof item.year !== 'number') {
      throw new InvalidDataError(`v2 ${key}년 장부 형식이 아니다`)
    }
    const { clubName, ...ledger } = item
    return { key, year: item.year, clubName, ledger }
  })
  const latest = named.reduce<(typeof named)[number] | undefined>(
    (found, item) => (found === undefined || item.year > found.year ? item : found),
    undefined,
  )
  if (!latest) return { schemaVersion: 3, books: [], settings: data.settings }

  const book = {
    id: FIRST_BOOK_ID,
    name: latest.clubName,
    kind: 'club',
    ledgers: Object.fromEntries(named.map(({ key, ledger }) => [key, ledger])),
    createdAt: new Date().toISOString(),
  }
  return { schemaVersion: 3, books: [book], settings: { ...data.settings, lastBookId: FIRST_BOOK_ID } }
}

// 실제 등록된 마이그레이션. v2 가 첫 버전이다 (v1 데이터는 옮기지 않는다, SPEC-002 범위 밖)
const MIGRATIONS: MigrationSteps = { 2: booksFromV2 }

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
