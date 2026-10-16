// 자동으로 지키기 상태 문구와 7일 안내 (SPEC-006). 시각을 받는 순수 함수
import type { KeepState } from './AutoKeeper'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const REMINDER_AFTER = 7 * DAY

// 장부 위 안내 띠 (백업 안내와 같은 자리·모양)
export const KEEP_REMINDER_MESSAGE = '인터넷에 연결되면 기록을 자동으로 보관해요. 7일째 보관하지 못했어요'

function timeOf(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined
  const time = Date.parse(iso)
  return Number.isNaN(time) ? undefined : time
}

// 7일 넘게 한 번도 보관하지 못했다: 올리지 못한 변경이 처음 생긴 때부터 7 × 24시간. 밀린 것이 없으면 잃을 것도 없다.
// keep 이 없으면 자동 보관 기능이 꺼진 빌드(서버 주소 없음)
export function needsKeepReminder(keep: KeepState | undefined, now: Date): boolean {
  const pendingSince = timeOf(keep?.pendingSince)
  if (!keep?.enabled || pendingSince === undefined) return false
  return now.getTime() - pendingSince >= REMINDER_AFTER
}

function agoText(time: number, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - time)
  if (elapsed < MINUTE) return '방금'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}분 전`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}시간 전`
  return `${Math.floor(elapsed / DAY)}일 전`
}

// 설정 맨 위 카드 상태 줄 (SPEC-006 v2.6): "자동으로 지키기 켜짐 · 3분 전에 보관했어요" / "… 방금 보관했어요" /
// 아직 보관한 적이 없으면 "자동으로 지키기 켜짐" / 끄면 "자동으로 지키기 꺼짐"
export function keepStatusText(keep: KeepState, now: Date): string {
  if (!keep.enabled) return '자동으로 지키기 꺼짐'
  const keptAt = timeOf(keep.lastKeptAt)
  if (keptAt === undefined) return '자동으로 지키기 켜짐'
  const ago = agoText(keptAt, now)
  return `자동으로 지키기 켜짐 · ${ago === '방금' ? ago : `${ago}에`} 보관했어요`
}

// 보관한 때 (폰 시각): "10월 12일 오후 3:20"
export function keptAtText(iso: string): string {
  const time = timeOf(iso)
  if (time === undefined) return '모름'
  const date = new Date(time)
  const hours = date.getHours()
  const half = hours < 12 ? '오전' : '오후'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${half} ${hour12}:${minutes}`
}
