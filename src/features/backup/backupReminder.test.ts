import { describe, expect, it } from 'vitest'
import type { StoredData } from '../../domain/types'
import { createEmptyData } from '../../storage/schema'
import { BACKUP_REMINDER_DAYS, backupReminderFor, firstRecordedAt, lastBackupText, needsBackupReminder } from './backupReminder'

const DAY = 24 * 60 * 60 * 1000
const BACKUP = '2026-09-01T00:00:00.000Z'
const backupMs = Date.parse(BACKUP)
const at = (ms: number) => new Date(ms)

describe('SPEC-002 백업 안내 규칙 (needsBackupReminder)', () => {
  it('AC-5 마지막 백업 뒤 기록이 바뀌었고 30일이 지났으면 안내한다', () => {
    expect(
      needsBackupReminder({
        lastBackupAt: BACKUP,
        lastChangedAt: '2026-09-10T00:00:00.000Z',
        now: at(backupMs + 31 * DAY),
      }),
    ).toBe(true)
  })

  it('AC-5 정확히 30일이 된 순간부터 안내하고, 1밀리초 전에는 안내하지 않는다', () => {
    const condition = { lastBackupAt: BACKUP, lastChangedAt: '2026-09-02T00:00:00.000Z' }
    expect(BACKUP_REMINDER_DAYS).toBe(30)
    expect(needsBackupReminder({ ...condition, now: at(backupMs + 30 * DAY) })).toBe(true)
    expect(needsBackupReminder({ ...condition, now: at(backupMs + 30 * DAY - 1) })).toBe(false)
  })

  it('AC-5 백업한 뒤 기록이 바뀌지 않았으면 30일이 지나도 안내하지 않는다', () => {
    expect(
      needsBackupReminder({ lastBackupAt: BACKUP, lastChangedAt: '2026-08-20T00:00:00.000Z', now: at(backupMs + 90 * DAY) }),
    ).toBe(false)
    // 백업과 같은 순간의 변경도 백업에 들어 있다
    expect(needsBackupReminder({ lastBackupAt: BACKUP, lastChangedAt: BACKUP, now: at(backupMs + 90 * DAY) })).toBe(false)
  })

  it('AC-5 기록을 한 번도 바꾸지 않았으면(변경 시각 없음) 안내하지 않는다', () => {
    expect(needsBackupReminder({ lastBackupAt: undefined, lastChangedAt: undefined, now: at(backupMs + 400 * DAY) })).toBe(false)
  })

  it('AC-5 백업한 적이 없으면 처음 기록한 날부터 30일이 지났을 때 안내한다', () => {
    const condition = { lastBackupAt: undefined, lastChangedAt: '2026-09-20T00:00:00.000Z', firstRecordedAt: BACKUP }
    expect(needsBackupReminder({ ...condition, now: at(backupMs + 30 * DAY) })).toBe(true)
    expect(needsBackupReminder({ ...condition, now: at(backupMs + 29 * DAY) })).toBe(false)
  })

  it('AC-5 백업한 적도 적은 기록도 없으면(장부 정보만 바꿈) 안내하지 않는다', () => {
    expect(
      needsBackupReminder({ lastBackupAt: undefined, lastChangedAt: BACKUP, firstRecordedAt: undefined, now: at(backupMs + 90 * DAY) }),
    ).toBe(false)
  })

  it('잘못된 날짜 문자열: 변경 시각이 깨졌으면 안내하지 않고, 백업 시각이 깨졌으면 백업한 적 없는 것으로 본다', () => {
    const now = at(backupMs + 90 * DAY)
    expect(needsBackupReminder({ lastBackupAt: BACKUP, lastChangedAt: '어제', now })).toBe(false)
    expect(needsBackupReminder({ lastBackupAt: '', lastChangedAt: BACKUP, firstRecordedAt: BACKUP, now })).toBe(true)
    expect(needsBackupReminder({ lastBackupAt: 'not-a-date', lastChangedAt: BACKUP, firstRecordedAt: 'x', now })).toBe(false)
  })
})

describe('SPEC-002 저장 데이터로 백업 안내 판단', () => {
  function dataWith(settings: StoredData['settings'], createdAts: string[]): StoredData {
    return {
      ...createEmptyData(),
      settings,
      ledgers: {
        '2026': {
          year: 2026,
          clubName: '꽃동산',
          carryover: 0,
          entries: createdAts.map((createdAt, index) => ({
            id: String(index),
            month: 9,
            type: 'income',
            name: '회비',
            amount: 1000,
            createdAt,
          })),
        },
      },
    }
  }

  it('처음 기록한 시각은 모든 장부 기록 중 가장 이른 입력 시각이다 (깨진 시각은 건너뛴다)', () => {
    const data = dataWith({}, ['2026-09-05T00:00:00.000Z', '깨짐', '2026-09-02T00:00:00.000Z'])
    data.ledgers['2025'] = {
      year: 2025,
      clubName: '꽃동산',
      carryover: 0,
      entries: [{ id: 'old', month: 1, type: 'expense', name: '간식비', amount: 1, createdAt: '2025-01-03T00:00:00.000Z' }],
    }
    expect(firstRecordedAt(data)).toBe('2025-01-03T00:00:00.000Z')
    expect(firstRecordedAt(createEmptyData())).toBeUndefined()
  })

  it('AC-5 저장 데이터의 백업·변경 시각과 처음 기록 시각으로 판단한다', () => {
    const neverBackedUp = dataWith({ lastChangedAt: '2026-09-20T00:00:00.000Z' }, [BACKUP])
    expect(backupReminderFor(neverBackedUp, at(backupMs + 30 * DAY))).toBe(true)
    expect(backupReminderFor(neverBackedUp, at(backupMs + 10 * DAY))).toBe(false)

    const backedUpAfterChange = dataWith({ lastChangedAt: BACKUP, lastBackupAt: '2026-09-02T00:00:00.000Z' }, [BACKUP])
    expect(backupReminderFor(backedUpAfterChange, at(backupMs + 90 * DAY))).toBe(false)
  })
})

describe('SPEC-002 설정 카드 마지막 백업 문구', () => {
  it('마지막 백업 날짜를 폰 날짜로 "마지막 백업: YYYY년 M월 D일" 로 보여 준다', () => {
    const local = new Date(2026, 8, 3, 23, 30).toISOString()
    expect(lastBackupText(local)).toBe('마지막 백업: 2026년 9월 3일')
  })

  it('백업한 적이 없거나 시각이 깨졌으면 "아직 백업하지 않았어요"', () => {
    expect(lastBackupText(undefined)).toBe('아직 백업하지 않았어요')
    expect(lastBackupText('깨짐')).toBe('아직 백업하지 않았어요')
  })
})
