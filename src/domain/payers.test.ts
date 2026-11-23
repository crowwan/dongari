import { describe, expect, it } from 'vitest'
import { book } from '../test/ledgerFixtures'
import { asksPayers, payerChoices } from './payers'
import type { Book, Entry, Member } from './types'

function member(id: string, name: string, overrides: Partial<Member> = {}): Member {
  return { id, name, joined: '2026-01', off: [], ...overrides }
}

function dues(id: string, createdAt: string, payerIds: string[], overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    month: 3,
    day: 5,
    type: 'income',
    name: '회비',
    amount: 20_000 * payerIds.length,
    createdAt,
    payers: payerIds.map((memberId) => ({ memberId, amount: 20_000 })),
    ...overrides,
  }
}

const MEMBERS: Member[] = [
  member('m-jung', '정하늘'),
  member('m-kang', '강민지', { off: ['2026-10', '2026-11'] }),
  member('m-kim', '김도윤'),
  member('m-park', '박서연', { left: '2026-07' }),
  member('m-lee', '이준호'),
]

function clubBook(entries: Entry[] = [], overrides: Partial<Omit<Book, 'ledgers'>> = {}): Book {
  return book([{ year: 2026, carryover: 0, monthlyFee: 20_000, entries }], {
    members: MEMBERS,
    dues: { startMonth: '2026-01' },
    ...overrides,
  })
}

describe('SPEC-010 "누가 냈어요?" 목록 (3절)', () => {
  describe('묻는 장부', () => {
    it('AC-10 동아리·모임 장부이고 회원 명단에 한 분 이상 있으면 묻는다', () => {
      expect(asksPayers(clubBook())).toBe(true)
    })

    it.each<[string, Book | undefined]>([
      ['명단이 비어 있음', clubBook([], { members: [] })],
      ['명단 칸이 없음 (v2.7 에서 쓰던 장부)', book([{ year: 2026, carryover: 0, entries: [] }])],
      ['개인 가계부 (명단은 숨김)', clubBook([], { kind: 'household' })],
      ['장부 없음', undefined],
    ])('AC-10 묻지 않는다: %s', (_label, target) => {
      expect(asksPayers(target)).toBe(false)
    })
  })

  it('지금 회원(그만둔 분 빼고)을 가나다 순으로, 그 달이 쉬는 달인 분은 맨 아래에 둔다', () => {
    const choices = payerChoices(clubBook(), 2026, 10)

    expect(choices.members).toEqual([
      { id: 'm-kim', name: '김도윤', resting: false },
      { id: 'm-lee', name: '이준호', resting: false },
      { id: 'm-jung', name: '정하늘', resting: false },
      { id: 'm-kang', name: '강민지', resting: true },
    ])
  })

  it('쉬는 달이 아닌 달에는 쉬는 분 묶음 없이 가나다 순이다', () => {
    expect(payerChoices(clubBook(), 2026, 3).members.map((choice) => choice.name)).toEqual(['강민지', '김도윤', '이준호', '정하늘'])
  })

  it('고치기에서 이미 낸 분으로 들어간 그만둔 분은 목록에 남긴다', () => {
    const names = payerChoices(clubBook(), 2026, 3, ['m-park']).members.map((choice) => choice.name)

    expect(names).toContain('박서연')
  })

  it('그 해 월 회비를, 그 해에 없으면 그 전 해 값을 쓰고, 어느 해에도 없으면 없다', () => {
    expect(payerChoices(clubBook(), 2026, 3).fee).toBe(20_000)
    const carried = book(
      [
        { year: 2025, carryover: 0, monthlyFee: 15_000, entries: [] },
        { year: 2026, carryover: 0, entries: [] },
      ],
      { members: MEMBERS },
    )
    expect(payerChoices(carried, 2026, 3).fee).toBe(15_000)
    expect(payerChoices(book([{ year: 2026, carryover: 0, entries: [] }], { members: MEMBERS }), 2026, 3).fee).toBeUndefined()
  })

  describe('[지난번 낸 분]', () => {
    it('낸 분이 있는 회비 기록 중 가장 최근에 저장한 것의 낸 분이다 (날짜가 아니라 저장한 때)', () => {
      const target = clubBook([
        dues('older-day-later-saved', '2026-10-02T00:00:00.000Z', ['m-kim', 'm-lee'], { month: 1 }),
        dues('later-day-earlier-saved', '2026-10-01T00:00:00.000Z', ['m-jung'], { month: 9 }),
      ])

      expect(payerChoices(target, 2026, 10).last).toEqual(['m-kim', 'm-lee'])
    })

    it('낸 분 없이 적은 회비(이름 없이 적기)·지출 "회비"는 건너뛴다', () => {
      const target = clubBook([
        dues('paid', '2026-10-01T00:00:00.000Z', ['m-kim']),
        dues('nameless', '2026-10-02T00:00:00.000Z', [], { payers: undefined }),
      ])

      expect(payerChoices(target, 2026, 10).last).toEqual(['m-kim'])
    })

    it('지난 해 장부의 기록도 본다', () => {
      const target = book(
        [
          { year: 2025, carryover: 0, entries: [dues('last-year', '2026-01-02T00:00:00.000Z', ['m-jung'])] },
          { year: 2026, carryover: 0, entries: [dues('this-year', '2026-01-01T00:00:00.000Z', ['m-kim'])] },
        ],
        { members: MEMBERS },
      )

      expect(payerChoices(target, 2026, 10).last).toEqual(['m-jung'])
    })

    it('목록에 없는 분(그만둔 분)은 빼고, 낸 분이 있는 회비 기록이 없으면 비어 있다', () => {
      const target = clubBook([dues('paid', '2026-03-01T00:00:00.000Z', ['m-park', 'm-kim'])])

      expect(payerChoices(target, 2026, 10).last).toEqual(['m-kim'])
      expect(payerChoices(clubBook(), 2026, 10).last).toEqual([])
    })
  })
})
