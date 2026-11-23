import { describe, expect, it } from 'vitest'
import { asksPayers } from '../../domain/payers'
import { isStoredData } from '../../storage/schema'
import { readExcelBook } from '../excel/readExcelBook'
import { practiceWorkbook } from './practiceExcel'
import { PRACTICE_EXAMPLES, practiceData } from './practiceScript'

const NOW = new Date('2026-10-16T09:00:00.000+09:00')

function deps() {
  let seq = 0
  return { createId: () => `id-${++seq}`, now: () => NOW }
}

describe('SPEC-010 10절 연습 장부 예시 값', () => {
  it('AC-36 동아리 연습 장부에는 예시 회원 3명(이번 해 1월에 들어옴)·월 회비 10,000원·회비 표 시작 달 이번 해 1월이 있고 v4 가드를 통과한다', () => {
    const data = practiceData('club', NOW)
    const [book] = data.books

    expect(book.members?.map(({ name, joined, off }) => ({ name, joined, off }))).toEqual([
      { name: '김예시', joined: '2026-01', off: [] },
      { name: '박예시', joined: '2026-01', off: [] },
      { name: '이예시', joined: '2026-01', off: [] },
    ])
    expect(book.dues).toEqual({ startMonth: '2026-01' })
    expect(book.ledgers['2026'].monthlyFee).toBe(10_000)
    expect(asksPayers(book)).toBe(true)
    expect(isStoredData(data)).toBe(true)
  })

  it('가계부 연습 장부에는 회원 명단·월 회비가 없다 (회비 적기가 나오지 않는다)', () => {
    const data = practiceData('household', NOW)
    const [book] = data.books

    expect(book.members).toBeUndefined()
    expect(book.dues).toBeUndefined()
    expect(book.ledgers['2026'].monthlyFee).toBeUndefined()
    expect(isStoredData(data)).toBe(true)
  })

  it('동아리 예시의 회비 낸 분은 첫 회원 김예시, 가계부 예시에는 낸 분이 없다', () => {
    expect(PRACTICE_EXAMPLES.club.payer).toEqual({ id: practiceData('club', NOW).books[0].members?.[0].id, name: '김예시' })
    expect(PRACTICE_EXAMPLES.household.payer).toBeUndefined()
  })
})

describe('SPEC-010 10절 연습용 엑셀 (시트 배열)', () => {
  it('AC-36 동아리 연습용 엑셀은 작년·올해 두 해 입출금내역·회비내역이고, 읽으면 예시 회원 3명·월 회비 10,000원·잔액이 맞는다', () => {
    const read = readExcelBook(practiceWorkbook('club', NOW), deps())
    if (!read.ok) throw new Error('연습용 엑셀을 읽지 못했다')
    const { summary, book } = read

    expect(summary.readSheets).toEqual(['2025년 입출금내역', '2025년 회비내역', '2026년 입출금내역', '2026년 회비내역'])
    expect(summary.unreadSheets).toEqual([])
    expect(summary.years).toEqual([2025, 2026])
    expect(book.members.map((member) => member.name)).toEqual(['김예시', '박예시', '이예시'])
    expect(summary.lastYearMemberCount).toBe(3)
    expect(summary.monthlyFees).toEqual([
      { year: 2025, fee: 10_000 },
      { year: 2026, fee: 10_000 },
    ])
    expect(summary.startMonth).toBe('2026-01')
    expect(summary.balanceMismatches).toEqual([])
    expect(summary.balanceChecks.every((check) => check.excelBalance === check.computed)).toBe(true)
    expect(summary.unassignedDuesCount).toBe(0)
    expect(summary.changedDates).toEqual([])
    expect(summary.unreadLines).toEqual([])
  })

  it('올해 기록은 이번 달까지만 있다 (앞으로 올 달의 기록을 지어내지 않는다)', () => {
    const read = readExcelBook(practiceWorkbook('club', NOW), deps())
    if (!read.ok) throw new Error('연습용 엑셀을 읽지 못했다')

    const months = read.book.ledgers['2026'].entries.map((entry) => entry.month)
    expect(Math.max(...months)).toBe(10)
    expect(read.book.ledgers['2025'].entries.some((entry) => entry.month === 12)).toBe(true)
  })

  it('가계부 연습용 엑셀은 회비내역 없이 두 해 입출금내역이고, 수입·지출 항목 이름이 엑셀 글 그대로다', () => {
    const read = readExcelBook(practiceWorkbook('household', NOW), deps())
    if (!read.ok) throw new Error('연습용 엑셀을 읽지 못했다')
    const { summary, book } = read

    expect(summary.readSheets).toEqual(['2025년 입출금내역', '2026년 입출금내역'])
    expect(summary.memberCount).toBe(0)
    expect(summary.balanceMismatches).toEqual([])
    expect(new Set(book.ledgers['2025'].entries.map((entry) => entry.name))).toEqual(new Set(['용돈', '장보기', '관리비']))
  })
})
