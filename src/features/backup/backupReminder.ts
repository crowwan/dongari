// 30일 백업 안내 규칙 (SPEC-002 백업 안내). 화면과 떼어 시각을 받아 판단한다
import type { StoredData } from '../../domain/types'

export const BACKUP_REMINDER_DAYS = 30
const REMINDER_MS = BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000

export const BACKUP_REMINDER_MESSAGE = '한 달 넘게 백업하지 않았어요'
// [설정] 점 표시의 화면 읽기 이름 ("설정 백업 필요")
export const BACKUP_DOT_LABEL = '백업 필요'

type ReminderCondition = {
  lastBackupAt: string | undefined // 마지막으로 백업 파일을 보낸 시각
  lastChangedAt: string | undefined // 마지막으로 기록을 바꾼 시각
  // 백업한 적이 없을 때 기준: 처음 기록을 적은 시각
  firstRecordedAt?: string
  now: Date
}

// 시각 문자열을 ms 로. 비었거나 날짜가 아니면 undefined
function toTime(value: string | undefined): number | undefined {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : time
}

// 백업에 들어 있지 않은 변경이 있고, 기준 시각(마지막 백업, 없으면 처음 기록)부터 30일이 지났으면 안내한다.
// 시각이 깨졌으면: 변경 시각은 "모름"이라 안내하지 않고, 백업 시각은 백업한 적 없는 것으로 본다
export function needsBackupReminder({ lastBackupAt, lastChangedAt, firstRecordedAt, now }: ReminderCondition): boolean {
  const changedAt = toTime(lastChangedAt)
  if (changedAt === undefined) return false

  const backupAt = toTime(lastBackupAt)
  if (backupAt !== undefined && changedAt <= backupAt) return false

  const since = backupAt ?? toTime(firstRecordedAt)
  if (since === undefined) return false
  return now.getTime() - since >= REMINDER_MS
}

// 모든 장부(SPEC-005 장부 여러 개 포함) 기록 중 가장 이른 입력 시각 (깨진 시각은 건너뛴다). 기록이 없으면 undefined
export function firstRecordedAt(data: StoredData): string | undefined {
  let first: { at: string; time: number } | undefined
  for (const ledger of data.books.flatMap((book) => Object.values(book.ledgers))) {
    for (const entry of ledger.entries) {
      const time = toTime(entry.createdAt)
      if (time !== undefined && (first === undefined || time < first.time)) first = { at: entry.createdAt, time }
    }
  }
  return first?.at
}

// 저장 데이터로 지금 백업 안내가 필요한지
export function backupReminderFor(data: StoredData, now: Date): boolean {
  const { lastBackupAt, lastChangedAt } = data.settings
  return needsBackupReminder({ lastBackupAt, lastChangedAt, firstRecordedAt: firstRecordedAt(data), now })
}

// 설정 "기록 백업" 카드의 한 줄. 날짜는 폰의 날짜로
export function lastBackupText(lastBackupAt: string | undefined): string {
  const time = toTime(lastBackupAt)
  if (time === undefined) return '아직 백업하지 않았어요'
  const date = new Date(time)
  return `마지막 백업: ${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
}
