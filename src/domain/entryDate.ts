// 내역 날짜(일) 순수 함수 (SPEC-001 v2.2). 검증은 저장 형식(schema.ts)·입력(ledger.ts)이, 날짜순은 장부·월 정리·올해 결산 지출표가 같이 쓴다
import type { Entry } from './types'

// 그 달 마지막 날. 2월은 장부 연도의 윤년을 따른다 (기기 시간대와 상관없게 UTC 로 센다)
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// 1 ~ 그 달 마지막 날 사이의 정수인가
export function isDayInMonth(year: number, month: number, day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month)
}

// 날짜 없는 예전 기록은 맨 뒤로
function dayRank(entry: Entry): number {
  return entry.day ?? Number.POSITIVE_INFINITY
}

// 날짜순 (AC-9): 같은 날은 적은 순(createdAt), 날짜 없는 예전 기록은 맨 뒤에 적은 순. 같은 시각이면 들어온 순서 그대로(안정 정렬).
// 같은 달 기록끼리 쓴다. 받은 목록은 바꾸지 않는다
export function byDate(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    const rank = dayRank(a) - dayRank(b)
    if (rank !== 0 && !Number.isNaN(rank)) return rank
    if (a.createdAt === b.createdAt) return 0
    return a.createdAt < b.createdAt ? -1 : 1
  })
}
