import { describe, expect, it } from 'vitest'
import { isStoredData } from '../storage/schema'
import { book, duesBook } from '../test/ledgerFixtures'
import { InvalidLedgerInputError } from './ledger'
import {
  addMember,
  carryMonthlyFee,
  changeDuesStart,
  changeMonthlyFee,
  deleteMember,
  hasNameSeparator,
  hasSameName,
  isYearMonth,
  memberHasRecords,
  nextMonth,
  openEndedRestUntil,
  previousMonth,
  restMember,
  resumeMember,
  splitYearMonth,
  thisMonthOf,
  updateMember,
  yearMonth,
} from './members'
import { CURRENT_SCHEMA_VERSION, type Book, type StoredData } from './types'

// 회원 번호는 주입한 만들기로 (테스트에서 고정값)
const ids = (...values: string[]) => {
  const queue = [...values]
  return () => queue.shift() ?? 'unused'
}

function stored(target: Book): StoredData {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, books: [target], settings: {} }
}

// 명단이 아직 없는 동아리 장부 (이미 쓰던 분, SPEC-010 11절)
const plainBook = () => book([{ year: 2026, carryover: 0, entries: [] }])

describe('SPEC-010 달 글자 (YYYY-MM)', () => {
  it('해·달을 "YYYY-MM" 으로 만들고 다시 나눈다', () => {
    expect(yearMonth(2026, 7)).toBe('2026-07')
    expect(yearMonth(2026, 12)).toBe('2026-12')
    expect(splitYearMonth('2025-03')).toEqual({ year: 2025, month: 3 })
  })

  it('달 글자는 "YYYY-MM" 만 맞다 (저장 형식 검사와 같은 규칙)', () => {
    expect(isYearMonth('2026-07')).toBe(true)
    expect(isYearMonth('2026-12')).toBe(true)
    for (const wrong of ['2026-7', '2026-13', '2026-00', '2026-07-01', '26-07', '', 202607]) {
      expect(isYearMonth(wrong)).toBe(false)
    }
  })

  it('오늘이 속한 달, 다음 달, 앞 달 (해를 넘어간다)', () => {
    expect(thisMonthOf(new Date('2026-11-23T09:00:00.000+09:00'))).toBe('2026-11')
    expect(nextMonth('2026-12')).toBe('2027-01')
    expect(nextMonth('2026-03')).toBe('2026-04')
    expect(previousMonth('2026-01')).toBe('2025-12')
    expect(previousMonth('2026-10')).toBe('2026-09')
  })
})

describe('SPEC-010 회원 명단·월 회비·시작 달 (6절)', () => {
  describe('회원 넣기', () => {
    it('이름 앞뒤 띄어쓰기를 지우고 새 번호로 명단 끝에 넣는다 (쉬는 달 없음)', () => {
      const next = addMember(duesBook(), { name: ' 박서연 ', joined: '2026-11' }, { createId: ids('m3'), year: 2026 })

      expect(next.members?.at(-1)).toEqual({ id: 'm3', name: '박서연', joined: '2026-11', off: [] })
      expect(next.members).toHaveLength(3)
    })

    it('명단을 처음 넣으면 회비 표 시작 달이 장부 연도 1월로 정해진다', () => {
      const next = addMember(plainBook(), { name: '김도윤', joined: '2026-11' }, { createId: ids('m1'), year: 2025 })

      expect(next.dues).toEqual({ startMonth: '2025-01' })
    })

    it('시작 달이 이미 있으면 회원을 넣어도 그대로 둔다', () => {
      const next = addMember(
        duesBook({ dues: { startMonth: '2024-03', hideUnassigned: true } }),
        { name: '박서연', joined: '2026-11' },
        { createId: ids('m3'), year: 2026 },
      )

      expect(next.dues).toEqual({ startMonth: '2024-03', hideUnassigned: true })
    })

    it('이름이 비면 넣지 않는다', () => {
      expect(() => addMember(duesBook(), { name: '  ', joined: '2026-11' }, { createId: ids('m3'), year: 2026 })).toThrow(
        InvalidLedgerInputError,
      )
    })

    it('이름에 쉼표(, ， 、)가 있으면 넣지 않는다 — 엑셀 내용 칸에서 낸 분을 가르는 글자라서 (#180 리뷰). 괄호는 된다', () => {
      for (const name of ['김민지,총무', '김민지，총무', '김민지、총무']) {
        expect(hasNameSeparator(name)).toBe(true)
        expect(() => addMember(duesBook(), { name, joined: '2026-11' }, { createId: ids('m3'), year: 2026 })).toThrow(InvalidLedgerInputError)
      }
      const next = addMember(duesBook(), { name: '김민지(91)', joined: '2026-11' }, { createId: ids('m3'), year: 2026 })
      expect(next.members?.at(-1)?.name).toBe('김민지(91)')
    })

    it('들어온 달이 "YYYY-MM" 이 아니면 넣지 않는다 (엑셀 불러오기 등 다른 곳에서 불러도)', () => {
      for (const joined of ['2026-7', '2026-13', '2026-11-01']) {
        expect(() => addMember(duesBook(), { name: '박서연', joined }, { createId: ids('m3'), year: 2026 })).toThrow(
          InvalidLedgerInputError,
        )
      }
    })

    it('만든 번호가 이미 명단에 있으면 넣지 않는다 (번호는 겹치지 않는다)', () => {
      expect(() => addMember(duesBook(), { name: '박서연', joined: '2026-11' }, { createId: ids('m1'), year: 2026 })).toThrow(
        InvalidLedgerInputError,
      )
    })

    it('같은 이름(앞뒤 띄어쓰기 무시)이 명단에 있는지 안다 — 그만둔 분도 보고, 고치는 분 자신은 뺀다', () => {
      const members = duesBook().members ?? []

      expect(hasSameName(members, ' 김도윤 ')).toBe(true)
      expect(hasSameName(members, '강민지')).toBe(true) // 그만둔 분
      expect(hasSameName(members, '박서연')).toBe(false)
      expect(hasSameName(members, '김도윤', 'm1')).toBe(false)
    })
  })

  describe('회원 정보 편집', () => {
    it('이름·들어온 달·그만둔 달·시작할 때 남은 돈을 바꾸고 번호·쉬는 달은 그대로 둔다', () => {
      const next = updateMember(duesBook(), 'm1', { name: ' 김도윤A ', joined: '2025-03', left: '2027-01', opening: 40_000 })

      expect(next.members?.[0]).toEqual({ id: 'm1', name: '김도윤A', joined: '2025-03', left: '2027-01', off: [], opening: 40_000 })
      // 쉬는 달은 한 분 보기에서 넣는다 (#163) — 편집은 건드리지 않는다
      const kept = updateMember(duesBook(), 'm2', { name: '강민지', joined: '2025-07', left: '2026-12', opening: -30_000 })
      expect(kept.members?.[1]?.off).toEqual(['2026-02'])
    })

    it('[다시 회원으로] 그만둔 달을 비우고, 남은 돈이 0원이면 그 칸째 뺀다', () => {
      const next = updateMember(duesBook(), 'm2', { name: '강민지', joined: '2025-07', opening: 0 })

      expect(next.members?.[1]).toEqual({ id: 'm2', name: '강민지', joined: '2025-07', off: ['2026-02'] })
    })

    it('이름이 비거나 남은 돈이 정수가 아니거나 범위 밖이면 바꾸지 않는다', () => {
      const change = (name: string, opening: number) => () => updateMember(duesBook(), 'm1', { name, joined: '2026-01', opening })

      expect(change('', 0)).toThrow(InvalidLedgerInputError)
      expect(change('김도윤', 1.5)).toThrow(InvalidLedgerInputError)
      expect(change('김도윤', -1_000_000_000)).toThrow(InvalidLedgerInputError)
    })

    it('이름을 쉼표가 든 이름으로 바꾸지 않는다. 예전부터 쉼표가 든 이름(엑셀에서 불러옴)은 그대로 두고 다른 칸을 고칠 수 있다 (#180 리뷰)', () => {
      expect(() => updateMember(duesBook(), 'm1', { name: '김도윤,총무', joined: '2026-01', opening: 0 })).toThrow(InvalidLedgerInputError)

      const legacy = duesBook({ members: [{ id: 'm1', name: '김도윤,총무', joined: '2026-01', off: [] }] })
      const next = updateMember(legacy, 'm1', { name: ' 김도윤,총무 ', joined: '2025-03', opening: 0 })
      expect(next.members?.[0]).toEqual({ id: 'm1', name: '김도윤,총무', joined: '2025-03', off: [] })
    })

    it('들어온 달·그만둔 달이 "YYYY-MM" 이 아니면 바꾸지 않는다', () => {
      const change = (joined: string, left?: string) => () => updateMember(duesBook(), 'm1', { name: '김도윤', joined, left, opening: 0 })

      expect(change('2026-1')).toThrow(InvalidLedgerInputError)
      expect(change('2026-01', '2027-13')).toThrow(InvalidLedgerInputError)
      expect(change('2026-01', '')).toThrow(InvalidLedgerInputError)
    })
  })

  describe('회원 지우기 (AC-21)', () => {
    it('AC-21 기록의 낸 분으로 들어간 회원은 지울 수 없다 (어느 해 기록이든)', () => {
      const target = duesBook()

      expect(memberHasRecords(target, 'm1')).toBe(true)
      expect(() => deleteMember(target, 'm1')).toThrow(InvalidLedgerInputError)

      const lastYear = book([{ year: 2025, carryover: 0, entries: target.ledgers['2026']?.entries ?? [] }], {
        members: target.members,
        dues: target.dues,
      })
      expect(memberHasRecords(lastYear, 'm2')).toBe(true)
    })

    it('AC-21 어느 기록에도 없는 회원은 지우고, 기록은 그대로 둔다', () => {
      const added = addMember(duesBook(), { name: '박서연', joined: '2026-11' }, { createId: ids('m3'), year: 2026 })

      expect(memberHasRecords(added, 'm3')).toBe(false)
      const next = deleteMember(added, 'm3')
      expect(next.members?.map((member) => member.id)).toEqual(['m1', 'm2'])
      expect(next.ledgers).toEqual(added.ledgers)
    })
  })

  describe('회비 표 시작 달', () => {
    it('시작 달을 바꾸고 "낸 분을 안 적은 회비" 카드 숨김은 그대로 둔다', () => {
      const next = changeDuesStart(duesBook({ dues: { startMonth: '2026-01', hideUnassigned: true } }), '2025-07')

      expect(next.dues).toEqual({ startMonth: '2025-07', hideUnassigned: true })
    })

    it('시작 달이 "YYYY-MM" 이 아니면 바꾸지 않는다', () => {
      expect(() => changeDuesStart(duesBook(), '2025-7')).toThrow(InvalidLedgerInputError)
      expect(() => changeDuesStart(duesBook(), '2025')).toThrow(InvalidLedgerInputError)
    })
  })

  describe('월 회비', () => {
    it('지금 장부 연도의 월 회비를 바꾼다 (1원 이상 정수만)', () => {
      const ledger = { year: 2026, carryover: 0, entries: [] }

      expect(changeMonthlyFee(ledger, 30_000)).toEqual({ ...ledger, monthlyFee: 30_000 })
      expect(() => changeMonthlyFee(ledger, 0)).toThrow(InvalidLedgerInputError)
      expect(() => changeMonthlyFee(ledger, 1_000_000_000)).toThrow(InvalidLedgerInputError)
    })

    it('AC-20 새 연도 장부는 작년 월 회비를 가져온다 (작년에 없으면 그 전 해 값, 아무 해에도 없으면 없음)', () => {
      const target = book([
        { year: 2024, carryover: 0, entries: [], monthlyFee: 10_000 },
        { year: 2025, carryover: 0, entries: [] },
      ])

      expect(carryMonthlyFee(target, { year: 2026, carryover: 5_000, entries: [] })).toEqual({
        year: 2026,
        carryover: 5_000,
        entries: [],
        monthlyFee: 10_000,
      })
      expect(carryMonthlyFee(target, { year: 2024, carryover: 0, entries: [] })).toEqual({ year: 2024, carryover: 0, entries: [] })
    })
  })

  describe('쉬는 기간 (5절 한 분 보기, AC-19)', () => {
    it('AC-19 고른 달부터 끝 달까지(둘 다 포함) 달마다 쉬는 달로 넣는다 — 해를 넘어가도', () => {
      const next = restMember(duesBook(), 'm1', '2026-11', '2027-02')

      expect(next.members?.[0]?.off).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    })

    it('한 달만 쉬면 그 달 하나, 이미 쉬는 달은 한 번만 남기고 달 순서로 둔다', () => {
      expect(restMember(duesBook(), 'm1', '2026-11', '2026-11').members?.[0]?.off).toEqual(['2026-11'])

      const next = restMember(duesBook(), 'm2', '2026-01', '2026-03')
      expect(next.members?.[1]?.off).toEqual(['2026-01', '2026-02', '2026-03'])
    })

    it('다른 회원과 장부 기록은 그대로 둔다', () => {
      const target = duesBook()
      const next = restMember(target, 'm1', '2026-11', '2026-12')

      expect(next.members?.[1]).toEqual(target.members?.[1])
      expect(next.ledgers).toEqual(target.ledgers)
    })

    it('끝 달이 고른 달보다 앞이거나 달 형식이 아니면 넣지 않는다', () => {
      expect(() => restMember(duesBook(), 'm1', '2026-11', '2026-10')).toThrow(InvalidLedgerInputError)
      expect(() => restMember(duesBook(), 'm1', '2026-1', '2026-03')).toThrow(InvalidLedgerInputError)
      expect(() => restMember(duesBook(), 'm1', '2026-01', '2026-13')).toThrow(InvalidLedgerInputError)
    })

    it('[N월부터 다시 내요] 그 달부터 이어진 쉬는 달만 지운다 (앞의 쉬는 달·떨어진 쉬는 달은 남긴다)', () => {
      const resting = { ...duesBook(), members: [{ id: 'm1', name: '김도윤', joined: '2026-01', off: ['2026-02', '2026-05', '2026-06', '2026-07', '2026-10'] }] }

      expect(resumeMember(resting, 'm1', '2026-06').members?.[0]?.off).toEqual(['2026-02', '2026-05', '2026-10'])
      expect(resumeMember(resting, 'm1', '2026-02').members?.[0]?.off).toEqual(['2026-05', '2026-06', '2026-07', '2026-10'])
    })

    it('[아직 몰라요] 끝 달은 그 달의 해와 올해 중 늦은 해의 다음 해 12월이다', () => {
      const today = new Date('2026-11-23T09:00:00.000+09:00')

      expect(openEndedRestUntil('2026-11', today)).toBe('2027-12')
      expect(openEndedRestUntil('2025-03', today)).toBe('2027-12')
      expect(openEndedRestUntil('2027-02', today)).toBe('2028-12')
    })
  })

  it('명단·시작 달·월 회비를 바꾼 장부는 저장 형식 검사(v4)를 늘 통과한다', () => {
    let target = addMember(plainBook(), { name: '김도윤', joined: '2026-11' }, { createId: ids('m1'), year: 2026 })
    target = addMember(target, { name: '김도윤', joined: '2026-03' }, { createId: ids('m2'), year: 2026 })
    target = updateMember(target, 'm2', { name: '김도윤(작은)', joined: '2026-01', left: '2026-12', opening: -20_000 })
    target = changeDuesStart(target, '2025-01')
    target = restMember(target, 'm2', '2026-05', '2026-08')
    target = resumeMember(target, 'm2', '2026-07')
    target = deleteMember(target, 'm1')
    const ledger = target.ledgers['2026']
    if (!ledger) throw new Error('2026년 장부가 없다')
    target = { ...target, ledgers: { ...target.ledgers, '2026': changeMonthlyFee(ledger, 20_000) } }

    expect(isStoredData(stored(target))).toBe(true)
  })
})
