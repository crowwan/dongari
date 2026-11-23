import { describe, expect, it } from 'vitest'
import { FIRST_RECORD_ROW, ledgerSheet, merge, type LedgerRow } from '../../test/excelFixtures'
import { readLedgerSheet } from './ledgerSheet'
import type { SheetData } from './sheet'

function read(records: readonly LedgerRow[], year = 2025, carryover: number | string | null = 100_000) {
  const result = readLedgerSheet(ledgerSheet(year, carryover, records), year)
  if (!result) throw new Error('시트를 읽지 못했다')
  return result
}

// 줄마다 [월, 일] 만 보기
function dates(records: readonly LedgerRow[], year = 2025) {
  return read(records, year).lines.map(({ month, day }) => [month, day])
}

describe('SPEC-010 엑셀 입출금내역 시트 읽기 — 날짜 (8절 "읽는 규칙")', () => {
  it('AC-23 월 칸이 비면 윗줄의 달, 일 칸이 비면 윗줄의 날을 이어받는다', () => {
    expect(
      dates([
        [3, 5, 10_000, '강민지', null],
        [null, null, 20_000, '김도윤', null],
        [null, 9, null, '간식비', 5_000],
        [4, 2, 10_000, '이서준', null],
        [null, null, null, '대관료', 30_000],
      ]),
    ).toEqual([
      [3, 5],
      [3, 5],
      [3, 9],
      [4, 2],
      [4, 2],
    ])
  })

  it('AC-23 병합된 월·일 칸은 왼쪽 위 칸 값(윗줄의 달·날)으로 본다 — 병합 안에 남은 값은 쓰지 않는다', () => {
    const sheet = ledgerSheet(2025, 0, [
      [5, 3, 10_000, '강민지', null],
      [7, 8, 10_000, '김도윤', null], // 병합 안에 남은 값(엑셀이 숨긴 값)
    ])
    const merged: SheetData = {
      ...sheet,
      merges: [...sheet.merges, merge(FIRST_RECORD_ROW, 0, FIRST_RECORD_ROW + 1, 0), merge(FIRST_RECORD_ROW, 1, FIRST_RECORD_ROW + 1, 1)],
    }

    expect(readLedgerSheet(merged, 2025)?.lines.map(({ month, day }) => [month, day])).toEqual([
      [5, 3],
      [5, 3],
    ])
  })

  it('AC-23 "N월"·"N일" 글자를 읽고, "N일~M일"은 N일로 본다', () => {
    expect(
      dates([
        ['3월', '5일', 10_000, '강민지', null],
        [' 4 월 ', '1일~3일', 10_000, '김도윤', null],
        [null, '10 일 ~ 12 일', null, '간식비', 5_000],
      ]),
    ).toEqual([
      [3, 5],
      [4, 1],
      [4, 10],
    ])
  })

  it('AC-23 달이 바뀐 줄에서 일이 비면 날짜 없는 기록이 되고, 같은 달 다음 줄도 날짜 없이 이어받는다', () => {
    const { lines } = read([
      [3, 5, 10_000, '강민지', null],
      [4, null, 10_000, '김도윤', null],
      [null, null, null, '간식비', 5_000],
      [null, 7, null, '대관료', 30_000],
    ])

    expect(lines.map((line) => line.day)).toEqual([5, undefined, undefined, 7])
    expect(lines[1]).not.toHaveProperty('day')
  })

  it('AC-23 그 달에 없는 날(2월 31일)은 그 달 마지막 날로 넣고 날짜를 바꾼 줄(해·달·원래 글)로 센다', () => {
    const result = read([
      [2, 31, 10_000, '강민지', null],
      [4, 31, null, '대관료', 30_000],
    ])

    expect(result.lines.map(({ month, day }) => [month, day])).toEqual([
      [2, 28],
      [4, 30],
    ])
    expect(result.changedDates).toEqual([
      { year: 2025, month: 2, text: '2 31 10000 강민지 110000' },
      { year: 2025, month: 4, text: '4 31 대관료 30000 80000' },
    ])
  })

  it('윤년 2월 29일은 그대로 둔다', () => {
    const result = read([[2, 29, 10_000, '강민지', null]], 2024)

    expect(result.lines[0]).toMatchObject({ month: 2, day: 29 })
    expect(result.changedDates).toEqual([])
  })

  it('일 칸 글자를 날로 읽을 수 없으면(1~31 밖, "초순") 날짜 없이 넣고 날짜를 바꾼 줄로 센다', () => {
    const result = read([
      [3, '초순', 10_000, '강민지', null],
      [null, 0, 10_000, '김도윤', null],
      [null, 45_123, 10_000, '이서준', null],
    ])

    expect(result.lines.map((line) => line.day)).toEqual([undefined, undefined, undefined])
    expect(result.changedDates.map((note) => note.month)).toEqual([3, 3, 3])
  })

  it('금액이 없는 줄은 기록을 만들지 않지만 그 줄의 날짜는 다음 줄이 이어받는다', () => {
    expect(
      dates([
        [6, 2, null, '정기 모임', null],
        [null, null, 10_000, '강민지', null],
      ]),
    ).toEqual([[6, 2]])
  })
})

describe('SPEC-010 엑셀 입출금내역 시트 읽기 — 금액·이월금 (8절)', () => {
  it('AC-23 입금 칸은 수입, 출금 칸은 지출, 한 줄에 둘 다 있으면 두 기록이 된다', () => {
    const { lines } = read([
      [3, 5, 10_000, '강민지', null],
      [null, 6, null, '간식비', 5_000],
      [null, 7, 3_000, '환불과 간식비', 2_000],
    ])

    expect(lines).toEqual([
      { month: 3, day: 5, income: 10_000, content: '강민지' },
      { month: 3, day: 6, expense: 5_000, content: '간식비' },
      { month: 3, day: 7, income: 3_000, expense: 2_000, content: '환불과 간식비' },
    ])
  })

  it.each([
    ['글자', '만원', null],
    ['0', 0, null],
    ['음수', -5_000, null],
    ['소수', 1_000.5, null],
    ['출금 칸 글자', null, '오천원'],
    ['상한(999,999,999원) 넘음', 1_000_000_000, null],
  ])('AC-23 금액 칸이 %s 이면 그 줄은 기록을 만들지 않고 읽지 못한 줄(해·달·원래 글)로 센다', (_label, income, expense) => {
    const result = read([
      [3, 5, 10_000, '강민지', null],
      [null, 6, income, '이상한 줄', expense],
    ])

    expect(result.lines).toHaveLength(1)
    expect(result.unreadLines).toEqual([{ year: 2025, month: 3, text: expect.stringContaining('이상한 줄') }])
  })

  it('달을 알 수 없는 줄(첫 줄 월 빈칸, 월 칸에 "합계")에 금액이 있으면 읽지 못한 줄로 센다', () => {
    const result = read([
      [null, 5, 10_000, '강민지', null],
      [3, 5, 10_000, '김도윤', null],
      ['합계', null, 20_000, null, 0],
    ])

    expect(result.lines.map((line) => line.content)).toEqual(['김도윤'])
    expect(result.unreadLines).toEqual([
      { year: 2025, text: '5 10000 강민지 110000' },
      { year: 2025, text: '합계 20000 0 140000' },
    ])
  })

  it('AC-23 "YYYY년 이월금" 줄의 잔액 값을 그 해 이월금으로 읽는다 (음수·0 도)', () => {
    expect(read([], 2025, 370_482).carryover).toBe(370_482)
    expect(read([], 2025, -12_000).carryover).toBe(-12_000)
    expect(read([], 2025, 0).carryover).toBe(0)
  })

  it.each([
    ['소수', 1_000.5],
    ['글자', '삼십만원'],
    ['빈칸', null],
  ])('이월금이 정수가 아니면(%s) 반올림하지 않고 0 으로 두고 그 줄을 읽지 못한 줄로 센다', (_label, carryover) => {
    const result = read([], 2025, carryover)

    expect(result.carryover).toBe(0)
    expect(result.unreadLines).toEqual([{ year: 2025, text: expect.stringContaining('2024년 이월금') }])
  })

  it('검산용 엑셀 마지막 잔액: 잔액 열의 마지막 숫자', () => {
    const result = read([
      [3, 5, 10_000, '강민지', null],
      [null, 6, null, '간식비', 5_000, 99_999],
      [null, null, null, null, null, null],
    ])

    expect(result.lastBalance).toBe(99_999)
    expect(read([]).lastBalance).toBe(100_000)
  })
})

describe('SPEC-010 엑셀 입출금내역 시트 읽기 — 열과 모양 (8절)', () => {
  it('머리 줄에서 월·일·입금·출금·잔액 열을 찾고(띄어쓰기 무시), 입금과 출금 사이 열을 내용으로 본다', () => {
    const sheet: SheetData = {
      name: '2025년 입출금내역',
      rows: [
        [null, null, null, null, null, null, null, null],
        ['번호', ' 월 ', '일', '입 금', '내용', '비고', '출 금', '잔 액'],
        [null, '2024년 이월금', null, null, null, null, null, 50_000],
        [1, 3, 5, 10_000, '강민지', '(3월)', null, 60_000],
        [2, null, 6, null, null, null, 5_000, 55_000],
      ],
      merges: [],
    }

    expect(readLedgerSheet(sheet, 2025)).toEqual({
      carryover: 50_000,
      lines: [
        { month: 3, day: 5, income: 10_000, content: '강민지 (3월)' },
        { month: 3, day: 6, expense: 5_000, content: '' },
      ],
      unreadLines: [],
      changedDates: [],
      lastBalance: 55_000,
    })
  })

  it('AC-27 머리 줄(월·일·입금·출금·잔액)이 없으면 모양이 다른 시트로 보고 읽지 않는다', () => {
    const sheet = ledgerSheet(2025, 0, [[3, 5, 10_000, '강민지', null]])
    const noHeader: SheetData = { ...sheet, rows: sheet.rows.map((row, index) => (index === 1 ? ['월', '일', '입금', null, '출금'] : row)) }

    expect(readLedgerSheet(noHeader, 2025)).toBeUndefined()
  })

  it('AC-27 "YYYY년 이월금" 줄이 없으면 모양이 다른 시트로 보고 읽지 않는다', () => {
    const sheet = ledgerSheet(2025, 0, [[3, 5, 10_000, '강민지', null]])
    const noCarryover: SheetData = { ...sheet, rows: sheet.rows.filter((_, index) => index !== 2) }

    expect(readLedgerSheet(noCarryover, 2025)).toBeUndefined()
  })
})
