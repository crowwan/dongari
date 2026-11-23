import { describe, expect, it } from 'vitest'
import { duesTable, type DuesCell, type DuesPayment, type DuesRow, type DuesTable } from '../../domain/duesTable'
import type { Entry, Member } from '../../domain/types'
import { book } from '../../test/ledgerFixtures'
import {
  cellNote,
  cellSheetNote,
  openingNote,
  paidThroughText,
  paymentNote,
  rowStatus,
  shortWon,
} from './duesWords'

const TODAY = new Date('2026-11-23T09:00:00.000+09:00')
const THIS_MONTH = '2026-11'

// 회비 기록 하나 (낸 분 한 분)
function paid(id: string, month: number, day: number | undefined, memberId: string, amount: number): Entry {
  return {
    id,
    month,
    day,
    type: 'income',
    name: '회비',
    amount,
    createdAt: `2026-${String(month).padStart(2, '0')}-01T00:00:00.000Z`,
    payers: [{ memberId, amount }],
  }
}

function member(id: string, name: string, extra: Partial<Member> = {}): Member {
  return { id, name, joined: '2026-01', off: [], ...extra }
}

// 월 회비 2만 원, 2026년 1월부터 계산하는 장부의 2026년 회비 표
function tableOf(members: Member[], entries: Entry[], year = 2026): DuesTable {
  return duesTable(
    book([{ year: 2026, carryover: 0, monthlyFee: 20_000, entries }], { members, dues: { startMonth: '2026-01' } }),
    year,
    TODAY,
  )
}

function rowOf(table: DuesTable, id: string): DuesRow {
  const row = table.rows.find((item) => item.member.id === id)
  if (!row) throw new Error(`${id} 줄이 없다`)
  return row
}

describe('SPEC-010 회비 표 화면 문구 (4·5절)', () => {
  it('짧은 돈 글자: 만 원 단위는 "1만 원", 나머지가 있으면 "1만 5,000원", 만 원 안 되면 "5,000원"', () => {
    expect(shortWon(10_000)).toBe('1만 원')
    expect(shortWon(120_000)).toBe('12만 원')
    expect(shortWon(15_000)).toBe('1만 5,000원')
    expect(shortWon(5_000)).toBe('5,000원')
  })

  it('채운 달: 다 찬 칸 "11월까지", 정확히 반이면 "10월 반까지", 그 밖은 "10월 5,000원까지", 다른 해면 해를 붙인다', () => {
    expect(paidThroughText({ year: 2026, month: 11, paid: 20_000, fee: 20_000 }, 2026)).toBe('11월까지')
    expect(paidThroughText({ year: 2026, month: 10, paid: 10_000, fee: 20_000 }, 2026)).toBe('10월 반까지')
    expect(paidThroughText({ year: 2026, month: 10, paid: 5_000, fee: 20_000 }, 2026)).toBe('10월 5,000원까지')
    expect(paidThroughText({ year: 2027, month: 2, paid: 20_000, fee: 20_000 }, 2026)).toBe('2027년 2월까지')
  })

  describe('사람별 줄 상태 한 줄 (4절)', () => {
    it('다 냈으면 "11월까지 냈어요", 덜 냈으면 "10월 반까지 · 1만 원 덜 냄"', () => {
      const table = tableOf(
        [member('m1', '김도윤'), member('m2', '강민지')],
        [paid('e1', 1, 9, 'm1', 190_000), paid('e2', 1, 9, 'm2', 220_000)],
      )

      expect(rowStatus(rowOf(table, 'm1'), table, THIS_MONTH)).toBe('10월 반까지 · 1만 원 덜 냄')
      expect(rowStatus(rowOf(table, 'm2'), table, THIS_MONTH)).toBe('11월까지 냈어요')
    })

    it('한 칸도 못 채웠으면 "아직 안 냈어요"(덜 냈으면 덜 낸 돈을 붙인다)', () => {
      const table = tableOf([member('m1', '김도윤')], [])

      expect(rowStatus(rowOf(table, 'm1'), table, THIS_MONTH)).toBe('아직 안 냈어요 · 20만 원 덜 냄')
      const january = duesTable(
        book([{ year: 2026, carryover: 0, monthlyFee: 20_000, entries: [] }], { members: [member('m1', '김도윤')], dues: { startMonth: '2026-01' } }),
        2026,
        new Date('2026-01-10T09:00:00.000+09:00'),
      )
      expect(rowStatus(rowOf(january, 'm1'), january, '2026-01')).toBe('아직 안 냈어요')
    })

    it('기준 달이 쉬는 달이면 이어진 쉬는 달의 첫 달 "2월부터 쉬어요"', () => {
      const off = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']
      const table = tableOf([member('m1', '한예린', { off })], [paid('e1', 1, 9, 'm1', 20_000)])

      expect(rowStatus(rowOf(table, 'm1'), table, THIS_MONTH)).toBe('2월부터 쉬어요')
    })

    it('시작 달 뒤 그 해에 들어와 다 냈으면 "7월에 들어왔어요"', () => {
      const table = tableOf([member('m1', '박서연', { joined: '2026-07' })], [paid('e1', 7, 1, 'm1', 100_000)])

      expect(rowStatus(rowOf(table, 'm1'), table, THIS_MONTH)).toBe('7월에 들어왔어요')
    })

    it('그 해가 끝나기 전에 그만둔 분은 회원이었던 마지막 달 "9월까지 회원이었어요"', () => {
      const table = tableOf([member('m1', '오세훈', { left: '2026-10' })], [paid('e1', 1, 9, 'm1', 180_000)])

      expect(rowStatus(rowOf(table, 'm1'), table, THIS_MONTH)).toBe('9월까지 회원이었어요')
    })

    it('월 회비를 몰라 한 칸도 못 채운 돈은 "아직 안 냈어요" 가 아니라 "남은 돈 22만 원"', () => {
      const noFee = duesTable(
        book([{ year: 2026, carryover: 0, entries: [paid('e1', 1, 9, 'm1', 220_000)] }], {
          members: [member('m1', '강민지')],
          dues: { startMonth: '2026-01' },
        }),
        2026,
        TODAY,
      )

      expect(rowStatus(rowOf(noFee, 'm1'), noFee, THIS_MONTH)).toBe('남은 돈 22만 원')
    })

    it('12월까지 회원인 분(그만둔 달 = 다음 해 1월)은 그만둔 문구 없이 "11월까지 냈어요" (리뷰 #177)', () => {
      const table = tableOf([member('m1', '최수아', { left: '2027-01' })], [paid('e1', 1, 9, 'm1', 220_000)])

      expect(rowStatus(rowOf(table, 'm1'), table, THIS_MONTH)).toBe('11월까지 냈어요')
    })

    it('올해 이번 달 뒤에 그만둘 분은 아직 회원이라 과거형 "…까지 회원이었어요" 가 아니다 (리뷰 #177)', () => {
      const leaving = tableOf([member('m1', '윤채원', { left: '2026-12' })], [paid('e1', 1, 9, 'm1', 220_000)])
      expect(rowStatus(rowOf(leaving, 'm1'), leaving, THIS_MONTH)).toBe('11월까지 냈어요')

      // 이번 달에 그만뒀으면(이번 달부터 회원 아님) 이미 지난 일
      const leftNow = tableOf([member('m1', '윤채원', { left: '2026-11' })], [paid('e1', 1, 9, 'm1', 200_000)])
      expect(rowStatus(rowOf(leftNow, 'm1'), leftNow, THIS_MONTH)).toBe('10월까지 회원이었어요')
    })

    it('회비 표 시작 해보다 이른 해는 상태 줄이 없다 (이름과 낸 돈만)', () => {
      const early = duesTable(
        book(
          [
            { year: 2026, carryover: 0, monthlyFee: 20_000, entries: [paid('e1', 3, 1, 'm1', 20_000)] },
          ],
          { members: [member('m1', '김도윤', { joined: '2026-01' })], dues: { startMonth: '2027-01' } },
        ),
        2026,
        TODAY,
      )

      expect(rowStatus(rowOf(early, 'm1'), early, THIS_MONTH)).toBeUndefined()
    })
  })

  describe('한 분 보기 달력 칸 (5절)', () => {
    const cell = (overrides: Partial<DuesCell>): DuesCell => ({ month: 1, state: 'empty', paid: 0, fills: [], ...overrides })
    const fill = (month: number, day: number | undefined, amount: number, year = 2026) =>
      ({ kind: 'payment', entryId: 'e1', year, month, day, amount }) as const

    it('채운 칸은 채운 입금 날짜 "1/19", 반만 찼으면 "10/19 반", 안 찼으면 "아직", 쉬는 달 "쉼", 월 회비 모름', () => {
      expect(cellNote(cell({ state: 'full', fee: 20_000, paid: 20_000, fills: [fill(1, 19, 20_000)] }), 2026)).toBe('1/19')
      expect(cellNote(cell({ month: 10, state: 'partial', fee: 20_000, paid: 10_000, fills: [fill(10, 19, 10_000)] }), 2026)).toBe(
        '10/19 반',
      )
      expect(cellNote(cell({ state: 'empty', fee: 20_000 }), 2026)).toBe('아직')
      expect(cellNote(cell({ state: 'off' }), 2026)).toBe('쉼')
      expect(cellNote(cell({ state: 'noFee' }), 2026)).toBe('회비 모름')
    })

    it('여러 입금이 나눠 채운 칸은 마지막 입금, 날짜 없는 예전 기록은 "3월", 다른 해 입금은 해를 붙이고, 미리 낸 돈은 "미리"', () => {
      expect(cellNote(cell({ state: 'full', paid: 20_000, fills: [fill(2, 1, 10_000), fill(3, 5, 10_000)] }), 2026)).toBe('3/5')
      expect(cellNote(cell({ state: 'full', paid: 20_000, fills: [fill(3, undefined, 20_000)] }), 2026)).toBe('3월')
      expect(cellNote(cell({ state: 'full', paid: 20_000, fills: [fill(12, 3, 20_000, 2025)] }), 2026)).toBe('2025년 12/3')
      expect(cellNote(cell({ state: 'full', paid: 20_000, fills: [{ kind: 'opening', amount: 20_000 }] }), 2026)).toBe('미리')
    })

    it('달 칸 선택 창 설명 한 줄', () => {
      expect(cellSheetNote(cell({ state: 'empty', fee: 20_000 }), 2026)).toBe(
        '아직 채워지지 않았어요. 이 달에 회비를 안 내는 거면 쉬는 달로 표시해 주세요',
      )
      expect(cellSheetNote(cell({ state: 'full', paid: 20_000, fills: [fill(1, 19, 20_000)] }), 2026)).toBe(
        '1월 19일에 낸 돈으로 채웠어요',
      )
      expect(cellSheetNote(cell({ state: 'partial', fee: 20_000, paid: 10_000, fills: [fill(10, 19, 10_000)] }), 2026)).toBe(
        '10월 19일에 낸 돈으로 반을 채웠어요',
      )
      expect(cellSheetNote(cell({ state: 'off' }), 2026)).toBe('쉬는 달이에요. 다시 내기 시작하면 아래 버튼을 눌러 주세요')
      expect(cellSheetNote(cell({ state: 'noFee' }), 2025)).toBe('2025년 월 회비를 정하지 않아 채우지 못했어요')
    })
  })

  describe('한 분 보기 요약·낸 기록 (5절)', () => {
    const payment = (overrides: Partial<DuesPayment>): DuesPayment => ({
      entryId: 'e1',
      year: 2026,
      month: 9,
      day: 17,
      amount: 20_000,
      beforeStart: false,
      toDebt: 0,
      slots: [],
      remaining: 0,
      ...overrides,
    })
    const feeOf = () => 20_000

    it('낸 기록 줄: "9월 칸", "10월 칸 반", 여러 칸 "1~12월 칸", 같이 낸 분, 시작 전 덜 낸 돈·남은 돈', () => {
      expect(paymentNote(payment({ slots: [{ year: 2026, month: 9, amount: 20_000 }] }), 1, feeOf, 2026)).toBe('9월 칸')
      expect(paymentNote(payment({ slots: [{ year: 2026, month: 10, amount: 10_000 }] }), 1, feeOf, 2026)).toBe('10월 칸 반')
      expect(
        paymentNote(
          payment({ slots: [{ year: 2026, month: 1, amount: 20_000 }, { year: 2026, month: 12, amount: 20_000 }] }),
          1,
          feeOf,
          2026,
        ),
      ).toBe('1~12월 칸')
      expect(
        paymentNote(
          payment({ slots: [{ year: 2026, month: 12, amount: 20_000 }, { year: 2027, month: 2, amount: 20_000 }] }),
          1,
          feeOf,
          2026,
        ),
      ).toBe('12월~2027년 2월 칸')
      expect(paymentNote(payment({ slots: [{ year: 2026, month: 9, amount: 20_000 }] }), 4, feeOf, 2026)).toBe(
        '9월 칸 · 같이 낸 분 3명',
      )
      expect(paymentNote(payment({ toDebt: 10_000, slots: [{ year: 2026, month: 1, amount: 10_000 }] }), 1, feeOf, 2026)).toBe(
        '시작 전 덜 낸 돈 · 1월 칸 반',
      )
      expect(paymentNote(payment({ remaining: 30_000 }), 1, feeOf, 2026)).toBe('남은 돈 30,000원')
      expect(paymentNote(payment({ beforeStart: true }), 1, feeOf, 2026)).toBe('회비 표 시작 전')
    })

    it('시작할 때 남은 돈 한 줄: 덜 낸 돈을 다 메웠는지·일부인지, 미리 낸 돈, 없으면 없음', () => {
      expect(openingNote({ amount: -30_000, debtCovered: 30_000 }, '2026-01')).toBe('2025년까지 덜 낸 돈 30,000원을 먼저 채웠어요')
      expect(openingNote({ amount: -30_000, debtCovered: 10_000 }, '2026-01')).toBe('2025년까지 덜 낸 돈 30,000원 중 10,000원을 채웠어요')
      expect(openingNote({ amount: -30_000, debtCovered: 0 }, '2026-07')).toBe('2026년 7월 전까지 덜 낸 돈 30,000원이 남아 있어요')
      expect(openingNote({ amount: 20_000, debtCovered: 0 }, '2026-01')).toBe('2025년까지 미리 낸 돈 20,000원으로 먼저 채웠어요')
      expect(openingNote({ amount: 0, debtCovered: 0 }, '2026-01')).toBeUndefined()
    })
  })
})
