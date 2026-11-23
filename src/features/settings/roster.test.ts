import { describe, expect, it } from 'vitest'
import type { Member } from '../../domain/types'
import { memberNote, monthText, rosterGroups } from './roster'

const member = (id: string, name: string, extra: Partial<Member> = {}): Member => ({ id, name, joined: '2026-01', off: [], ...extra })

describe('SPEC-010 회원 명단 화면 (6절) 목록과 보조 줄', () => {
  it('지금 회원과 그만둔 분을 나누고 각각 가나다 순으로 둔다', () => {
    const groups = rosterGroups([
      member('m1', '정하늘'),
      member('m2', '강민지'),
      member('m3', '오현우', { left: '2026-01' }),
      member('m4', '김도윤'),
      member('m5', '권나래', { left: '2025-07' }),
    ])

    expect(groups.current.map((item) => item.name)).toEqual(['강민지', '김도윤', '정하늘'])
    expect(groups.left.map((item) => item.name)).toEqual(['권나래', '오현우'])
  })

  it('달 글자: 올해면 "N월", 다른 해면 "YYYY년 N월"', () => {
    expect(monthText('2026-07', 2026)).toBe('7월')
    expect(monthText('2025-12', 2026)).toBe('2025년 12월')
  })

  describe('보조 줄 (쉬는 달은 이번 달 기준)', () => {
    const context = { startMonth: '2026-01', thisMonth: '2026-11' }

    it('회비 표 시작 달 뒤에 들어온 분은 "N월에 들어왔어요" (다른 해면 해까지)', () => {
      expect(memberNote(member('m1', '서지민', { joined: '2026-07' }), context)).toBe('7월에 들어왔어요')
      expect(memberNote(member('m1', '서지민', { joined: '2025-07' }), { ...context, startMonth: '2024-01' })).toBe(
        '2025년 7월에 들어왔어요',
      )
    })

    it('시작 달부터(또는 그 전부터) 회원이면 보조 줄이 없다', () => {
      expect(memberNote(member('m1', '강민지', { joined: '2026-01' }), context)).toBeUndefined()
      expect(memberNote(member('m1', '강민지', { joined: '2019-03' }), context)).toBeUndefined()
    })

    it('이번 달이 쉬는 달이면 이어진 쉬는 달의 첫 달로 "N월부터 쉬어요" (들어온 달보다 먼저)', () => {
      const resting = member('m1', '한예린', { joined: '2026-07', off: ['2026-02', '2026-09', '2026-10', '2026-11', '2026-12'] })

      expect(memberNote(resting, context)).toBe('9월부터 쉬어요')
      const sinceLastYear = member('m1', '한예린', { off: ['2025-12', '2026-01', '2026-02'] })
      expect(memberNote(sinceLastYear, { ...context, thisMonth: '2026-02' })).toBe('2025년 12월부터 쉬어요')
    })

    it('이번 달이 쉬는 달이 아니면 지난 쉬는 달은 보조 줄에 없다', () => {
      expect(memberNote(member('m1', '한예린', { off: ['2026-02', '2026-03'] }), context)).toBeUndefined()
    })

    it('그만둔 분은 마지막 회원 달 "YYYY년 N월까지" (올해면 "N월까지")', () => {
      expect(memberNote(member('m1', '오현우', { left: '2026-01' }), context)).toBe('2025년 12월까지')
      expect(memberNote(member('m1', '오현우', { left: '2026-08' }), context)).toBe('7월까지')
    })
  })
})
