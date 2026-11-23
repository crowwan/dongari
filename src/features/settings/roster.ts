// 회원 명단 화면 (SPEC-010 6절): 화면 칸 이름, 지금 회원·그만둔 분 묶음과 줄 보조 줄 문구
import { previousMonth, splitYearMonth } from '../../domain/members'
import type { Member, YearMonth } from '../../domain/types'

// 설정 위에 뜨는 회원 명단 화면들의 칸 이름 (선택 창 칸 하나를 바꿔 끼운다, RosterPages). 회원 넣기·회원 정보에서 뒤로 버튼은 회원 명단으로
export const ROSTER_PAGE = 'settings-roster'
export const MEMBER_ADD_PAGE = 'settings-roster-add'
export const MEMBER_PAGE = 'settings-roster-member'

export function isRosterPage(sheet: string | null): boolean {
  return sheet === ROSTER_PAGE || sheet === MEMBER_ADD_PAGE || sheet === MEMBER_PAGE
}

export interface RosterGroups {
  current: Member[] // 지금 회원 (가나다)
  left: Member[] // 그만둔 분 (가나다). [그만뒀어요] 로 그만둔 달을 넣은 분
}

const byName = (a: Member, b: Member) => a.name.localeCompare(b.name, 'ko')

export function rosterGroups(members: readonly Member[]): RosterGroups {
  return {
    current: members.filter((member) => member.left === undefined).sort(byName),
    left: members.filter((member) => member.left !== undefined).sort(byName),
  }
}

// 달 글자: 올해(thisYear)면 "7월", 다른 해면 "2025년 12월"
export function monthText(value: YearMonth, thisYear: number): string {
  const { year, month } = splitYearMonth(value)
  return year === thisYear ? `${month}월` : `${year}년 ${month}월`
}

// 해까지 쓰는 달 글자 ("2026년 1월") — 회비 표 시작 달, 고르는 칸 값
export function fullMonthText(value: YearMonth): string {
  const { year, month } = splitYearMonth(value)
  return `${year}년 ${month}월`
}

// 그 달을 포함해 이어진 쉬는 달의 첫 달. 그 달이 쉬는 달이 아니면 undefined (회원 명단 보조 줄·회비 표 "2월부터 쉬어요")
export function restingSince(off: readonly YearMonth[], month: YearMonth): YearMonth | undefined {
  const months = new Set(off)
  if (!months.has(month)) return undefined
  let first = month
  while (months.has(previousMonth(first))) first = previousMonth(first)
  return first
}

// 줄 보조 줄 하나: 그만둔 분은 마지막 회원 달, 지금 회원은 이번 달이 쉬는 달이면 쉬기 시작한 달,
// 아니면 회비 표 시작 달 뒤에 들어온 분만 들어온 달 (시작 달부터 회원이면 없음)
export function memberNote(member: Member, { startMonth, thisMonth }: { startMonth?: YearMonth; thisMonth: YearMonth }): string | undefined {
  const { year: thisYear } = splitYearMonth(thisMonth)
  if (member.left !== undefined) return `${monthText(previousMonth(member.left), thisYear)}까지`
  const since = restingSince(member.off, thisMonth)
  if (since !== undefined) return `${monthText(since, thisYear)}부터 쉬어요`
  if (startMonth === undefined || member.joined > startMonth) return `${monthText(member.joined, thisYear)}에 들어왔어요`
  return undefined
}
