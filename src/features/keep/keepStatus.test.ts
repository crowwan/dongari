import { describe, expect, it } from 'vitest'
import { keepStatusText, keptAtText, needsKeepReminder } from './keepStatus'

const NOW = new Date('2026-10-20T00:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

describe('SPEC-006 7일 보관 안내', () => {
  it('AC-4 밀린 변경이 생긴 지 7일이 되면 안내한다 (정확히 7일부터)', () => {
    expect(needsKeepReminder({ enabled: true, pendingSince: ago(7 * DAY) }, NOW)).toBe(true)
    expect(needsKeepReminder({ enabled: true, pendingSince: ago(7 * DAY - 1) }, NOW)).toBe(false)
  })

  it('밀린 것이 없거나 꺼져 있거나 시각이 깨졌으면 안내하지 않는다', () => {
    expect(needsKeepReminder({ enabled: true, lastKeptAt: ago(30 * DAY) }, NOW)).toBe(false)
    expect(needsKeepReminder({ enabled: false, pendingSince: ago(30 * DAY) }, NOW)).toBe(false)
    expect(needsKeepReminder({ enabled: true, pendingSince: '깨짐' }, NOW)).toBe(false)
  })

  it('자동 보관이 없으면(서버 주소 없음) 안내하지 않는다', () => {
    expect(needsKeepReminder(undefined, NOW)).toBe(false)
  })
})

describe('SPEC-006 설정 맨 위 카드 상태 줄 (v2.6)', () => {
  it('AC-11 켜짐이면 "자동으로 지키기 켜짐 · N분 전에 보관했어요" (방금 / 분 / 시간 / 일)', () => {
    expect(keepStatusText({ enabled: true, lastKeptAt: ago(30 * 1000) }, NOW)).toBe('자동으로 지키기 켜짐 · 방금 보관했어요')
    expect(keepStatusText({ enabled: true, lastKeptAt: ago(3 * 60 * 1000) }, NOW)).toBe('자동으로 지키기 켜짐 · 3분 전에 보관했어요')
    expect(keepStatusText({ enabled: true, lastKeptAt: ago(5 * 60 * 60 * 1000) }, NOW)).toBe('자동으로 지키기 켜짐 · 5시간 전에 보관했어요')
    expect(keepStatusText({ enabled: true, lastKeptAt: ago(2 * DAY) }, NOW)).toBe('자동으로 지키기 켜짐 · 2일 전에 보관했어요')
  })

  it('AC-11 아직 보관한 적이 없으면 "자동으로 지키기 켜짐", 끄면 "자동으로 지키기 꺼짐"', () => {
    expect(keepStatusText({ enabled: true }, NOW)).toBe('자동으로 지키기 켜짐')
    expect(keepStatusText({ enabled: true, lastKeptAt: '깨짐' }, NOW)).toBe('자동으로 지키기 켜짐')
    expect(keepStatusText({ enabled: false, lastKeptAt: ago(DAY) }, NOW)).toBe('자동으로 지키기 꺼짐')
  })
})

describe('SPEC-006 보관한 때 글자', () => {
  it('폰 시각으로 "10월 12일 오후 3:20"', () => {
    expect(keptAtText(new Date(2026, 9, 12, 15, 20).toISOString())).toBe('10월 12일 오후 3:20')
    expect(keptAtText(new Date(2026, 0, 3, 9, 5).toISOString())).toBe('1월 3일 오전 9:05')
    expect(keptAtText(new Date(2026, 0, 3, 0, 30).toISOString())).toBe('1월 3일 오전 12:30')
    expect(keptAtText(new Date(2026, 0, 3, 12, 0).toISOString())).toBe('1월 3일 오후 12:00')
  })

  it('시각이 깨졌으면 모름', () => {
    expect(keptAtText('깨짐')).toBe('모름')
  })
})
