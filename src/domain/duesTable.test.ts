import { describe, expect, it } from 'vitest'
import {
  behindMemberCount,
  duesTable,
  duesYears,
  monthlyFeeOf,
  unassignedDues,
  type DuesCellState,
  type DuesRow,
  type DuesTable,
} from './duesTable'
import type { Book, Entry, Member, YearMonth } from './types'
import { book } from '../test/ledgerFixtures'

// 12칸 띠를 한 줄 글자로: ○ 채움, ◐ 일부, · 빈칸, / 쉬는 달, - 회원 아님, _ 시작 달 전
const SYMBOL: Readonly<Record<DuesCellState, string>> = {
  full: '○',
  partial: '◐',
  empty: '·',
  off: '/',
  notMember: '-',
  beforeStart: '_',
}

function strip(row: DuesRow): string {
  return row.cells.map((cell) => SYMBOL[cell.state]).join('')
}

function rowOf(table: DuesTable, name: string): DuesRow {
  const row = table.rows.find((item) => item.member.name === name)
  if (!row) throw new Error(`${name} 줄이 없다`)
  return row
}

function member(id: string, name: string, overrides: Partial<Omit<Member, 'id' | 'name'>> = {}): Member {
  return { id, name, joined: '2026-01', off: [], ...overrides }
}

interface DatedEntry {
  year: number
  entry: Entry
}

// 회비 입금 한 건. date 는 'YYYY-MM-DD', 날짜 없는 예전 기록은 'YYYY-MM'. payers 는 { 회원 번호: 그분 몫 }
function paid(id: string, date: string, payers: Readonly<Record<string, number>>, extra: Partial<Entry> = {}): DatedEntry {
  const [year, month, day] = date.split('-').map(Number)
  const list = Object.entries(payers).map(([memberId, amount]) => ({ memberId, amount }))
  const entry: Entry = {
    id,
    month,
    type: 'income',
    name: '회비',
    amount: list.reduce((sum, payer) => sum + payer.amount, 0),
    createdAt: `${date.length === 7 ? `${date}-01` : date}T09:00:00.000Z`,
    payers: list,
    ...extra,
  }
  return { year, entry: day === undefined ? entry : { ...entry, day } }
}

// 낸 분 없는 기록 (회비든 아니든)
function plain(id: string, date: string, type: Entry['type'], name: string, amount: number): DatedEntry {
  const [year, month, day] = date.split('-').map(Number)
  return { year, entry: { id, month, day, type, name, amount, createdAt: `${date}T09:00:00.000Z` } }
}

interface ClubSetup {
  members: Member[]
  startMonth?: YearMonth
  fees?: Readonly<Record<number, number>> // 해 → 월 회비
  entries?: DatedEntry[]
}

// 회원 명단·회비 표 시작 달·해별 월 회비·기록이 든 동아리 장부. 기본: 2026년 1월부터, 2026년 월 회비 2만 원
function clubBook({ members, startMonth = '2026-01', fees = { 2026: 20_000 }, entries = [] }: ClubSetup): Book {
  const years = new Set([...Object.keys(fees).map(Number), ...entries.map((item) => item.year)])
  const ledgers = [...years].map((year) => ({
    year,
    carryover: 0,
    monthlyFee: fees[year],
    entries: entries.filter((item) => item.year === year).map((item) => item.entry),
  }))
  return book(ledgers, { members, dues: { startMonth } })
}

// 오늘: 2026년 11월 23일 → 올해 기준 달은 10월
const NOV_23 = new Date(2026, 10, 23)

describe('SPEC-010 회비 표 계산 (2절)', () => {
  describe('AC-4 한 번에 1년 치(월 회비 × 12)를 내면 1~12월이 모두 채워진다', () => {
    it('24만 원(2만 원 × 12)을 한 번에 내면 1~12월이 모두 채워지고 덜 낸 돈이 없다', () => {
      const table = duesTable(
        clubBook({ members: [member('m1', '김도윤')], entries: [paid('p1', '2026-01-10', { m1: 240_000 })] }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '김도윤')

      expect(strip(row)).toBe('○○○○○○○○○○○○')
      expect(row.cells.every((cell) => cell.paid === 20_000 && cell.fee === 20_000)).toBe(true)
      expect(row.shortfall).toBe(0)
      expect(row.yearPaid).toBe(240_000)
      expect(row.paidThrough).toEqual({ year: 2026, month: 12, paid: 20_000, fee: 20_000 })
    })

    it('19만 원이면 9월까지 차고 10월은 1만 원만 찬다("10월 반까지"), 10월까지 1만 원 덜 냈다', () => {
      const table = duesTable(
        clubBook({ members: [member('m1', '강민지')], entries: [paid('p1', '2026-01-15', { m1: 190_000 })] }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '강민지')

      expect(strip(row)).toBe('○○○○○○○○○◐··')
      expect(row.cells[9]).toMatchObject({ month: 10, state: 'partial', paid: 10_000, fee: 20_000 })
      expect(row.cells[10]).toMatchObject({ month: 11, state: 'empty', paid: 0, fee: 20_000 })
      expect(row.paidThrough).toEqual({ year: 2026, month: 10, paid: 10_000, fee: 20_000 })
      expect(row.shortfall).toBe(10_000)
    })
  })

  describe('AC-5 들어온 달 전·그만둔 달 뒤·쉬는 달은 칸이 아니고, 쉬는 달을 건너뛰어 채운다', () => {
    it('7월에 들어온 분은 1~6월이 "-"이고 7월부터 채운다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '이서준', { joined: '2026-07' })],
          entries: [paid('p1', '2026-07-03', { m1: 80_000 })],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '이서준')

      expect(strip(row)).toBe('------○○○○··')
      expect(row.shortfall).toBe(0)
    })

    it('쉬는 달은 "/"이고 건너뛰어 다음 칸을 채우며, 덜 낸 돈에도 넣지 않는다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '박하은', { off: ['2026-02', '2026-03'] })],
          entries: [paid('p1', '2026-01-05', { m1: 100_000 })],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '박하은')

      expect(strip(row)).toBe('○//○○○○·····')
      // 기준 10월까지 칸 8개(1월, 4~10월) = 16만 원 − 채운 10만 원
      expect(row.shortfall).toBe(60_000)
    })

    it('그만둔 달부터는 "-"이고 칸이 없다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '최유나', { left: '2026-06' })],
          entries: [paid('p1', '2026-01-05', { m1: 100_000 })],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '최유나')

      expect(strip(row)).toBe('○○○○○-------')
      expect(row.shortfall).toBe(0)
      expect(row.remaining).toBe(0)
    })
  })

  describe('AC-6 다음 해·지난해 칸과 해별 월 회비', () => {
    it('지난해 빈칸을 먼저 채우고, 칸마다 그 칸이 있는 해의 월 회비(2025년 1만 원, 2026년 2만 원)로 센다', () => {
      const club = clubBook({
        members: [member('m1', '김도윤', { joined: '2025-01' })],
        startMonth: '2025-01',
        fees: { 2025: 10_000, 2026: 20_000 },
        entries: [paid('p1', '2025-03-01', { m1: 100_000 }), paid('p2', '2026-01-10', { m1: 60_000 })],
      })

      const lastYear = rowOf(duesTable(club, 2025, NOV_23), '김도윤')
      const thisYear = rowOf(duesTable(club, 2026, NOV_23), '김도윤')

      expect(strip(lastYear)).toBe('○○○○○○○○○○○○')
      expect(lastYear.cells[10]).toMatchObject({ state: 'full', paid: 10_000, fee: 10_000 })
      expect(lastYear.yearPaid).toBe(100_000)
      // 2026년 6만 원 = 2025년 11·12월 1만 원씩 + 2026년 1·2월 2만 원씩
      expect(strip(thisYear)).toBe('○○··········')
      expect(thisYear.yearPaid).toBe(60_000)
      expect(thisYear.payments[0].slots).toEqual([
        { year: 2025, month: 11, amount: 10_000 },
        { year: 2025, month: 12, amount: 10_000 },
        { year: 2026, month: 1, amount: 20_000 },
        { year: 2026, month: 2, amount: 20_000 },
      ])
    })

    it('1년 치보다 많이 내면 다음 해 칸을 채운다(다음 해 장부가 없으면 그 전 해 월 회비로 센다)', () => {
      const club = clubBook({ members: [member('m1', '김도윤')], entries: [paid('p1', '2026-01-02', { m1: 300_000 })] })

      const thisYear = rowOf(duesTable(club, 2026, NOV_23), '김도윤')
      const nextYear = duesTable(club, 2027, new Date(2027, 4, 10))

      expect(strip(thisYear)).toBe('○○○○○○○○○○○○')
      expect(thisYear.paidThrough).toEqual({ year: 2027, month: 3, paid: 20_000, fee: 20_000 })
      expect(nextYear.monthlyFee).toBe(20_000)
      expect(strip(rowOf(nextYear, '김도윤'))).toBe('○○○·········')
      expect(rowOf(nextYear, '김도윤').yearPaid).toBe(0)
      // 2027년 5월에 보면 기준 4월: 4월 칸 2만 원 덜 냄
      expect(rowOf(nextYear, '김도윤').shortfall).toBe(20_000)
    })
  })

  describe('AC-7 시작 달 전 기록과 시작할 때 남은 돈', () => {
    it('시작 달 전 날짜의 회비 기록은 칸을 채우지 않고 그 해 낸 돈(이름별 합계)에는 들어간다', () => {
      const club = clubBook({
        members: [member('m1', '김도윤', { joined: '2025-01' })],
        fees: { 2025: 10_000, 2026: 20_000 },
        entries: [paid('p1', '2025-12-20', { m1: 40_000 }), paid('p2', '2026-01-05', { m1: 20_000 })],
      })

      const lastYear = duesTable(club, 2025, NOV_23)
      const thisYear = rowOf(duesTable(club, 2026, NOV_23), '김도윤')

      expect(strip(thisYear)).toBe('○···········')
      expect(rowOf(lastYear, '김도윤').yearPaid).toBe(40_000)
      expect(strip(rowOf(lastYear, '김도윤'))).toBe('____________')
      expect(rowOf(lastYear, '김도윤').shortfall).toBe(0)
      expect(rowOf(lastYear, '김도윤').payments).toEqual([
        { entryId: 'p1', year: 2025, month: 12, day: 20, amount: 40_000, beforeStart: true, toDebt: 0, slots: [], remaining: 0 },
      ])
    })

    it('시작 달이 해 중간이면 그 전 달은 "시작 달 전"이고 그 달들의 기록은 칸에 넣지 않는다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '김도윤')],
          startMonth: '2026-04',
          entries: [paid('p1', '2026-03-10', { m1: 20_000 }), paid('p2', '2026-04-02', { m1: 20_000 })],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '김도윤')

      expect(strip(row)).toBe('___○········')
      expect(row.yearPaid).toBe(40_000)
      // 4~10월 7칸 14만 원 − 채운 2만 원
      expect(row.shortfall).toBe(120_000)
    })

    it('시작할 때 덜 낸 돈(음수)을 입금으로 먼저 메우고 남은 돈으로 칸을 채운다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '강민지', { opening: -30_000 })],
          entries: [paid('p1', '2026-01-10', { m1: 70_000 })],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '강민지')

      expect(row.opening).toEqual({ amount: -30_000, debtCovered: 30_000 })
      expect(strip(row)).toBe('○○··········')
      expect(row.payments[0]).toMatchObject({ toDebt: 30_000, remaining: 0 })
      expect(row.shortfall).toBe(160_000)
    })

    it('시작할 때 덜 낸 돈을 다 못 메우면 칸은 비고, 못 메운 돈도 덜 낸 돈에 들어간다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '강민지', { opening: -30_000 })],
          entries: [paid('p1', '2026-01-10', { m1: 10_000 })],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '강민지')

      expect(row.opening).toEqual({ amount: -30_000, debtCovered: 10_000 })
      expect(strip(row)).toBe('············')
      // 못 메운 2만 원 + 1~10월 20만 원
      expect(row.shortfall).toBe(220_000)
    })

    it('시작할 때 미리 낸 돈(양수)은 가장 먼저 칸을 채운다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '김도윤', { opening: 40_000 })],
          entries: [paid('p1', '2026-03-02', { m1: 20_000 })],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '김도윤')

      expect(strip(row)).toBe('○○○·········')
      expect(row.cells[0].fills).toEqual([{ kind: 'opening', amount: 20_000 }])
      expect(row.cells[2].fills).toEqual([
        { kind: 'payment', entryId: 'p1', year: 2026, month: 3, day: 2, amount: 20_000 },
      ])
      expect(row.opening).toEqual({ amount: 40_000, debtCovered: 0 })
    })
  })

  describe('AC-8 덜 낸 돈의 기준 달', () => {
    const club = clubBook({
      members: [member('m1', '김도윤', { joined: '2025-01' })],
      startMonth: '2025-01',
      fees: { 2025: 10_000, 2026: 20_000 },
    })

    it('올해는 지난달까지를 기준으로 한다', () => {
      const november = duesTable(club, 2026, NOV_23)
      const march = duesTable(club, 2026, new Date(2026, 2, 1))

      expect(november.referenceMonth).toBe(10)
      expect(rowOf(november, '김도윤').shortfall).toBe(120_000 + 200_000)
      expect(march.referenceMonth).toBe(2)
      expect(rowOf(march, '김도윤').shortfall).toBe(120_000 + 40_000)
    })

    it('지난 해는 그해 12월까지를 기준으로 한다', () => {
      const table = duesTable(club, 2025, NOV_23)

      expect(table.referenceMonth).toBe(12)
      expect(rowOf(table, '김도윤').shortfall).toBe(120_000)
    })

    it('올해 1월에는 기준 칸이 없어 아무도 덜 냄이 아니다', () => {
      const january = new Date(2026, 0, 15)
      const table = duesTable(club, 2026, january)

      expect(table.referenceMonth).toBeUndefined()
      expect(rowOf(table, '김도윤').shortfall).toBe(0)
      expect(table.summary).toEqual({ behind: 0, paid: 1, resting: 0 })
      expect(behindMemberCount(club, january)).toBe(0)
    })

    it('시작할 때 덜 낸 돈이 있어도 올해 1월에는 덜 냄이 아니다', () => {
      const table = duesTable(clubBook({ members: [member('m1', '강민지', { opening: -30_000 })] }), 2026, new Date(2026, 0, 15))

      expect(rowOf(table, '강민지').shortfall).toBe(0)
    })
  })

  describe('AC-9 입금을 날짜순으로 칸에 짝짓는다', () => {
    it('칸마다 채운 입금(여러 입금이 한 칸을 나눠 채움)과 입금마다 채운 칸을 돌려준다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '김도윤')],
          entries: [
            paid('p3', '2026-03-05', { m1: 20_000 }),
            paid('p1', '2026-01-10', { m1: 10_000 }),
            paid('p2', '2026-01-20', { m1: 30_000 }),
          ],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '김도윤')

      expect(strip(row)).toBe('○○○·········')
      expect(row.cells[0].fills).toEqual([
        { kind: 'payment', entryId: 'p1', year: 2026, month: 1, day: 10, amount: 10_000 },
        { kind: 'payment', entryId: 'p2', year: 2026, month: 1, day: 20, amount: 10_000 },
      ])
      expect(row.cells[1].fills).toEqual([
        { kind: 'payment', entryId: 'p2', year: 2026, month: 1, day: 20, amount: 20_000 },
      ])
      expect(row.payments.map((payment) => payment.entryId)).toEqual(['p1', 'p2', 'p3'])
      expect(row.payments[1]).toEqual({
        entryId: 'p2',
        year: 2026,
        month: 1,
        day: 20,
        amount: 30_000,
        beforeStart: false,
        toDebt: 0,
        slots: [
          { year: 2026, month: 1, amount: 10_000 },
          { year: 2026, month: 2, amount: 20_000 },
        ],
        remaining: 0,
      })
    })

    it('같은 날 같은 분이 두 번 내면 적은 순서대로 두 입금이 차례로 칸을 채운다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '김도윤')],
          entries: [
            paid('later', '2026-02-03', { m1: 20_000 }, { createdAt: '2026-02-03T10:00:00.000Z' }),
            paid('earlier', '2026-02-03', { m1: 20_000 }, { createdAt: '2026-02-03T09:00:00.000Z' }),
          ],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '김도윤')

      expect(row.cells[0].fills.map((fill) => (fill.kind === 'payment' ? fill.entryId : 'opening'))).toEqual(['earlier'])
      expect(row.cells[1].fills.map((fill) => (fill.kind === 'payment' ? fill.entryId : 'opening'))).toEqual(['later'])
    })

    it('날짜 없는 예전 기록은 장부 날짜순처럼 그 달 맨 뒤에 놓는다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '김도윤')],
          entries: [
            paid('dayless', '2026-01', { m1: 20_000 }, { createdAt: '2025-12-01T00:00:00.000Z' }),
            paid('dated', '2026-01-31', { m1: 20_000 }),
          ],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '김도윤')

      expect(row.payments.map((payment) => payment.entryId)).toEqual(['dated', 'dayless'])
      expect(row.payments[0].slots).toEqual([{ year: 2026, month: 1, amount: 20_000 }])
      expect(row.payments[1].slots).toEqual([{ year: 2026, month: 2, amount: 20_000 }])
    })
  })

  describe('예외와 경계 상황', () => {
    it('그만둔 뒤 낸 돈은 칸이 없어 남은 미리 낸 돈이 된다', () => {
      const table = duesTable(
        clubBook({
          members: [member('m1', '최유나', { left: '2026-04' })],
          entries: [paid('p1', '2026-01-05', { m1: 60_000 }), paid('p2', '2026-06-10', { m1: 40_000 })],
        }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '최유나')

      expect(strip(row)).toBe('○○○---------')
      expect(row.remaining).toBe(40_000)
      expect(row.payments[1]).toMatchObject({ slots: [], remaining: 40_000 })
      expect(row.shortfall).toBe(0)
    })

    it('어느 해에도 월 회비가 없으면 칸을 채우지 못하고, 그 해를 알려 주며, 낸 돈은 남은 돈이 된다', () => {
      const table = duesTable(
        clubBook({ members: [member('m1', '김도윤')], fees: {}, entries: [paid('p1', '2026-01-05', { m1: 20_000 })] }),
        2026,
        NOV_23,
      )
      const row = rowOf(table, '김도윤')

      expect(table.monthlyFee).toBeUndefined()
      expect(table.missingFeeYear).toBe(2026)
      expect(strip(row)).toBe('············')
      expect(row.cells[0].fee).toBeUndefined()
      expect(row.remaining).toBe(20_000)
      expect(row.shortfall).toBe(0)
    })

    it('월 회비를 모르는 해의 칸은 건너뛰고(덜 낸 돈에도 넣지 않음) 월 회비가 있는 해부터 채운다', () => {
      const club = clubBook({
        members: [member('m1', '김도윤', { joined: '2025-01' })],
        startMonth: '2025-01',
        fees: { 2026: 20_000 },
        entries: [paid('p1', '2025-01-05', { m1: 40_000 })],
      })
      const lastYear = duesTable(club, 2025, NOV_23)
      const thisYear = duesTable(club, 2026, NOV_23)

      expect(monthlyFeeOf(club, 2025)).toBeUndefined()
      expect(lastYear.monthlyFee).toBeUndefined()
      expect(lastYear.missingFeeYear).toBe(2025)
      expect(strip(rowOf(lastYear, '김도윤'))).toBe('············')
      expect(rowOf(lastYear, '김도윤').shortfall).toBe(0)
      expect(thisYear.monthlyFee).toBe(20_000)
      expect(thisYear.missingFeeYear).toBe(2025)
      expect(strip(rowOf(thisYear, '김도윤'))).toBe('○○··········')
      // 2026년 1~10월 20만 원 − 채운 4만 원 (2025년 칸은 세지 않음)
      expect(rowOf(thisYear, '김도윤').shortfall).toBe(160_000)
      expect(rowOf(thisYear, '김도윤').remaining).toBe(0)
    })

    it('그 해 월 회비가 없으면 가장 가까운 그 전 해 값을 쓴다', () => {
      const club = clubBook({ members: [], fees: { 2024: 10_000, 2026: 20_000 } })

      expect(monthlyFeeOf(club, 2023)).toBeUndefined()
      expect(monthlyFeeOf(club, 2024)).toBe(10_000)
      expect(monthlyFeeOf(club, 2025)).toBe(10_000)
      expect(monthlyFeeOf(club, 2026)).toBe(20_000)
      expect(monthlyFeeOf(club, 2028)).toBe(20_000)
    })

    it('낸 분 없는 회비 기록은 칸을 채우지 않는다', () => {
      const table = duesTable(
        clubBook({ members: [member('m1', '김도윤')], entries: [plain('x', '2026-01-05', 'income', '회비', 20_000)] }),
        2026,
        NOV_23,
      )

      expect(strip(rowOf(table, '김도윤'))).toBe('············')
      expect(rowOf(table, '김도윤').yearPaid).toBe(0)
    })
  })

  describe('줄 목록과 요약', () => {
    const club = clubBook({
      members: [
        member('m1', '김도윤'),
        member('m2', '이서준'),
        member('m3', '박하은', { off: ['2026-10'] }),
        member('m4', '강민지'),
        member('m5', '정지호', { left: '2025-06', joined: '2025-01' }),
        member('m6', '한소율', { joined: '2027-01' }),
      ],
      entries: [
        paid('p1', '2026-01-05', { m1: 240_000, m3: 180_000 }),
        paid('p2', '2026-02-05', { m2: 100_000, m4: 20_000 }),
      ],
    })

    it('그 해 한 달이라도 회원이었던 분만 줄이 되고, 덜 낸 분 먼저 그다음 가나다 순이다', () => {
      const table = duesTable(club, 2026, NOV_23)

      expect(table.rows.map((row) => row.member.name)).toEqual(['강민지', '이서준', '김도윤', '박하은'])
    })

    it('요약은 덜 낸 분·다 낸 분·쉬는 분(기준 달이 쉬는 달, 덜 낸 돈 없음) 수다', () => {
      const table = duesTable(club, 2026, NOV_23)

      expect(table.rows.map((row) => row.group)).toEqual(['behind', 'behind', 'paid', 'resting'])
      expect(table.summary).toEqual({ behind: 2, paid: 1, resting: 1 })
    })

    it('장부 버튼용: 지난달까지 덜 낸 분 수', () => {
      expect(behindMemberCount(club, NOV_23)).toBe(2)
    })

    it('그만둔 뒤라도 그 해 낸 돈이 있으면 줄이 된다', () => {
      const withLatePayment = clubBook({
        members: [member('m5', '정지호', { left: '2025-06', joined: '2025-01' })],
        entries: [paid('p1', '2026-03-01', { m5: 10_000 })],
      })

      expect(duesTable(withLatePayment, 2026, NOV_23).rows.map((row) => row.member.name)).toEqual(['정지호'])
    })

    it('회원 명단이 없으면 줄이 없다', () => {
      expect(duesTable(book([]), 2026, NOV_23).rows).toEqual([])
      expect(behindMemberCount(book([]), NOV_23)).toBe(0)
    })
  })

  describe('해 목록', () => {
    it('회비 표 시작 해부터 올해까지다', () => {
      const club = clubBook({ members: [member('m1', '김도윤')], startMonth: '2024-03' })

      expect(duesYears(club, NOV_23)).toEqual([2024, 2025, 2026])
    })

    it('회비 표 시작 달이 없으면 올해만이다', () => {
      expect(duesYears(book([]), NOV_23)).toEqual([2026])
    })
  })

  describe('낸 분을 안 적은 회비 (7절 카드)', () => {
    it('시작 달 이후 날짜의 낸 분 없는 회비 기록을 오래된 것부터 건수·합계와 함께 돌려준다', () => {
      const club = clubBook({
        members: [member('m1', '김도윤')],
        fees: { 2025: 10_000, 2026: 20_000 },
        entries: [
          plain('before', '2025-12-10', 'income', '회비', 50_000),
          plain('march', '2026-03-01', 'income', '회비(14인)', 140_000),
          plain('february', '2026-02-01', 'income', '회비', 30_000),
          plain('upper', '2026-02-02', 'expense', '회비', 10_000),
          plain('gift', '2026-02-03', 'income', '찬조금', 100_000),
          paid('assigned', '2026-04-01', { m1: 20_000 }),
        ],
      })

      const result = unassignedDues(club)

      expect(result.items.map((item) => [item.year, item.entry.id])).toEqual([
        [2026, 'february'],
        [2026, 'march'],
      ])
      expect(result.total).toBe(170_000)
    })

    it('회비 표 시작 달이 없으면 없다', () => {
      expect(unassignedDues(book([{ year: 2026, carryover: 0, entries: [plain('x', '2026-01-01', 'income', '회비', 1).entry] }])).items).toEqual([])
    })
  })
})
