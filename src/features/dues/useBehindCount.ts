import { useMemo } from 'react'
import { behindMemberCount } from '../../domain/duesTable'
import { splitYearMonth, thisMonthOf } from '../../domain/members'
import type { Book } from '../../domain/types'

// 장부 [회비 표] 의 "지난달까지 덜 낸 분 N명" (SPEC-010 4절). 동아리·모임 장부가 아니면 undefined (버튼 없음).
// 올해 회비 표 전체를 계산하니 장부(기록·명단·월 회비)나 이번 달이 바뀔 때만 다시 센다 — 달 넘기기처럼 장부 화면만 다시 그릴 때는 그대로 (리뷰 #177)
export function useBehindCount(book: Book | undefined, today: Date): number | undefined {
  const thisMonth = thisMonthOf(today)
  return useMemo(() => {
    if (book?.kind !== 'club') return undefined
    const { year, month } = splitYearMonth(thisMonth)
    return behindMemberCount(book, new Date(year, month - 1, 1))
  }, [book, thisMonth])
}
