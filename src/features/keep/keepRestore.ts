// 복구 코드로 보관본 받아 오기 (SPEC-006): 코드 → 서버 이름 → 받기 → 풀기 → 백업 파일과 같은 검증·마이그레이션
import type { StoredData } from '../../domain/types'
import { readBackup, type BackupSummary } from '../../storage/backup'
import { keepIdOf, openKeep } from './keepCrypto'
import type { KeepServer } from './keepServer'
import { normalizeRecoveryCode } from './recoveryCode'

// found: 바꿀 데이터와 확인 창에 보일 내용 / not-found: 틀린 코드이거나 보관본 없음
// offline: 인터넷 없음 / failed: 서버 오류, 풀 수 없거나 우리 장부 데이터가 아님
export type FetchKeptResult =
  | { status: 'found'; code: string; data: StoredData; summary: BackupSummary; savedAt: string; bookNames: string[] }
  | { status: 'not-found' }
  | { status: 'offline' }
  | { status: 'failed' }

export async function fetchKept(server: KeepServer, input: string): Promise<FetchKeptResult> {
  const code = normalizeRecoveryCode(input)
  // 형식이 틀린 코드는 묻지 않아도 보관본이 없다
  if (code === undefined) return { status: 'not-found' }
  const answer = await server.get(await keepIdOf(code))
  if (answer.status !== 'found') return answer
  const plain = await openKeep(code, answer.envelope)
  const backup = plain === undefined ? undefined : readBackup(plain)
  if (!backup?.ok) return { status: 'failed' }
  // 바꾸면 이 폰도 그 코드로 같은 자리에 보관한다
  const data: StoredData = { ...backup.data, settings: { ...backup.data.settings, recoveryCode: code } }
  return {
    status: 'found',
    code,
    data,
    summary: backup.summary,
    savedAt: answer.envelope.savedAt,
    bookNames: data.books.map((book) => book.name),
  }
}
