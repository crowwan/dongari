import { describe, expect, it } from 'vitest'
import type { Entry, Ledger, StoredData } from '../domain/types'
import { createBackup, readBackup } from './backup'
import { createEmptyData } from './schema'

function ledger(year: number, entryCount: number): Ledger {
  return {
    year,
    clubName: '한랑드림',
    carryover: 100_000,
    entries: Array.from({ length: entryCount }, (_, index): Entry => ({
      id: `${year}-${index}`,
      month: 3,
      type: 'income',
      name: '회비',
      amount: 10_000,
      createdAt: `${year}-03-01T00:00:00.000Z`,
    })),
  }
}

function storedWith(...ledgers: Ledger[]): StoredData {
  return {
    ...createEmptyData(),
    ledgers: Object.fromEntries(ledgers.map((item) => [String(item.year), item])),
    settings: { lastChangedAt: '2026-10-01T00:00:00.000Z', lastBackupAt: '2026-09-01T00:00:00.000Z' },
  }
}

// 폰의 현지 시각 2026-10-06 오전 (실행 환경 시간대와 상관없이 현지 날짜로 만든다)
const NOW = new Date(2026, 9, 6, 8, 30)

// 파일에 담기는 데이터: 마지막 백업 시각만 파일을 만든 시각으로 바뀐다
function withBackupAt(data: StoredData, now: Date): StoredData {
  return { ...data, settings: { ...data.settings, lastBackupAt: now.toISOString() } }
}

describe('SPEC-002 백업 파일 만들기', () => {
  it('파일 이름은 오늘 날짜가 붙은 동아리회계-백업-YYYY-MM-DD.txt 이다', () => {
    expect(createBackup(storedWith(ledger(2026, 1)), NOW).fileName).toBe('동아리회계-백업-2026-10-06.txt')
  })

  it('한 자리 월·일은 0 을 붙인다', () => {
    expect(createBackup(createEmptyData(), new Date(2026, 0, 5)).fileName).toBe('동아리회계-백업-2026-01-05.txt')
  })

  it('내용은 전체 저장 데이터이고 사람이 열어도 읽히게 줄을 나눈다', () => {
    const data = storedWith(ledger(2025, 2), ledger(2026, 1))
    const { text } = createBackup(data, NOW)

    expect(JSON.parse(text)).toEqual(withBackupAt(data, NOW))
    expect(text).toContain('\n  "schemaVersion": 2')
  })

  it('파일의 마지막 백업 시각은 그 파일을 만든 시각이다', () => {
    const { text } = createBackup(storedWith(ledger(2026, 1)), NOW)

    expect(JSON.parse(text).settings.lastBackupAt).toBe(NOW.toISOString())
  })

  it('파일을 만들어도 기기 데이터의 마지막 백업 시각은 바꾸지 않는다', () => {
    const data = storedWith(ledger(2026, 1))

    createBackup(data, NOW)

    expect(data.settings.lastBackupAt).toBe('2026-09-01T00:00:00.000Z')
  })
})

describe('SPEC-002 백업 파일 읽기', () => {
  it('AC-3 만든 백업 파일을 다시 읽으면 같은 데이터가 된다', () => {
    const data = storedWith(ledger(2025, 2), ledger(2026, 3))

    const result = readBackup(createBackup(data, NOW).text)

    expect(result).toEqual({
      ok: true,
      data: withBackupAt(data, NOW),
      summary: { years: [2025, 2026], entryCount: 5 },
    })
  })

  it('장부가 없는 백업 파일도 읽는다 (요약은 비어 있음)', () => {
    expect(readBackup(createBackup(createEmptyData(), NOW).text)).toEqual({
      ok: true,
      data: withBackupAt(createEmptyData(), NOW),
      summary: { years: [], entryCount: 0 },
    })
  })

  it.each([
    ['JSON 이 깨짐', '{"schemaVersion": 2,'],
    ['빈 파일', ''],
    ['그냥 글자', '안녕하세요'],
  ])('AC-4 깨진 파일은 broken 으로 거부한다: %s', (_label, text) => {
    expect(readBackup(text)).toEqual({ ok: false, reason: 'broken' })
  })

  it.each([
    ['다른 앱의 JSON', JSON.stringify({ name: '가계부', items: [] })],
    ['schemaVersion 이 없음', JSON.stringify({ ledgers: {}, settings: {} })],
    ['현재 버전인데 형식이 틀림', JSON.stringify({ schemaVersion: 2, ledgers: [], settings: {} })],
    ['금액 범위를 벗어난 기록', JSON.stringify(storedWith({ ...ledger(2026, 1), entries: [{ ...ledger(2026, 1).entries[0], amount: 0 }] }))],
    ['JSON 배열', '[]'],
  ])('AC-4 형식이 다른 파일은 not-backup 으로 거부한다: %s', (_label, text) => {
    expect(readBackup(text)).toEqual({ ok: false, reason: 'not-backup' })
  })

  it('AC-4 앱보다 높은 버전 파일은 newer-version 으로 거부한다', () => {
    const newer = JSON.stringify({ schemaVersion: 3, ledgers: {}, settings: {} })

    expect(readBackup(newer)).toEqual({ ok: false, reason: 'newer-version' })
  })
})
