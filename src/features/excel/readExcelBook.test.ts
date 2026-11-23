import { describe, expect, it } from 'vitest'
import { isDuesEntry } from '../../domain/dues'
import { unassignedDues } from '../../domain/duesTable'
import { CURRENT_SCHEMA_VERSION, type Book, type Entry } from '../../domain/types'
import { isStoredData } from '../../storage/schema'
import { duesSheet, ledgerSheet, months, otherSheet, workbook, type LedgerRow } from '../../test/excelFixtures'
import { readExcelBook, type ExcelBookRead } from './readExcelBook'
import type { ExcelWorkbook } from './sheet'

const NOW = '2026-11-23T00:00:00.000Z'

// 기록·회원 번호와 적은 시각은 바깥에서 받는다 (테스트에서 고정)
function deps() {
  let next = 0
  return {
    createId: () => {
      next += 1
      return `id-${next}`
    },
    now: () => new Date(NOW),
  }
}

function read(book: ExcelWorkbook) {
  const result = readExcelBook(book, deps())
  if (!result.ok) throw new Error(`엑셀을 읽지 못했다: ${result.problem}`)
  return result
}

function entriesOf(result: Extract<ExcelBookRead, { ok: true }>, year: number): Entry[] {
  return result.book.ledgers[String(year)]?.entries ?? []
}

// 기록을 [달, 날, 종류, 항목, 금액] 으로
function brief(entries: readonly Entry[]) {
  return entries.map((entry) => [entry.month, entry.day, entry.type, entry.name, entry.amount])
}

// 회원 이름 → 번호
function memberIds(result: Extract<ExcelBookRead, { ok: true }>): Record<string, string> {
  return Object.fromEntries(result.book.members.map((member) => [member.name, member.id]))
}

// 지어낸 회원 셋이 1년 내내 회원인 회비내역
function threeMembers(year: number) {
  return duesSheet(year, [
    [1, '강민지', ...months(0)],
    [2, '김도윤', ...months(0)],
    [3, '이서준', ...months(0)],
  ])
}

describe('SPEC-010 엑셀 불러오기 — 시트 고르기 (8절 "시트")', () => {
  it('AC-23 "YYYY년 입출금내역"(띄어쓰기·앞뒤 공백 무시, 2013 이후) 시트를 해마다 장부로 읽는다', () => {
    const result = read(
      workbook(
        ledgerSheet(2013, 0, [[1, 5, 10_000, '이자', null]], '2013년입출금내역'),
        ledgerSheet(2014, 10_000, [[1, 5, 20_000, '이자', null]], ' 2014 년 입출금 내역 '),
      ),
    )

    expect(Object.keys(result.book.ledgers)).toEqual(['2013', '2014'])
    expect(result.book.ledgers['2014']).toMatchObject({ year: 2014, carryover: 10_000 })
    expect(result.summary.years).toEqual([2013, 2014])
    expect(result.summary.readSheets).toEqual(['2013년입출금내역', ' 2014 년 입출금 내역 '])
  })

  it('AC-27 모양이 다른 시트·2013 전 시트·다른 시트는 읽지 않은 시트로 이유와 함께 센다', () => {
    const shapeless = { ...ledgerSheet(2016, 0, []), rows: [['2016년 입출금 내역'], ['날짜', '내용', '금액']] }
    const result = read(
      workbook(
        ledgerSheet(2012, 0, [[1, 5, 10_000, '이자', null]]),
        ledgerSheet(2015, 0, [[1, 5, 10_000, '이자', null]]),
        shapeless,
        threeMembers(2015),
        threeMembers(2017),
        otherSheet('연락처'),
        otherSheet('Sheet3'),
        ledgerSheet(2015, 0, [], '2015년 입출금내역 '),
      ),
    )

    expect(result.summary.sheetCount).toBe(8)
    expect(result.summary.readSheets).toEqual(['2015년 입출금내역', '2015년 회비내역'])
    expect(result.summary.unreadSheets).toEqual([
      { name: '2012년 입출금내역', reason: 'year' },
      { name: '2016년 입출금내역', reason: 'shape' },
      // 같은 해 입출금내역을 읽지 않은 회비내역
      { name: '2017년 회비내역', reason: 'other' },
      { name: '연락처', reason: 'other' },
      { name: 'Sheet3', reason: 'other' },
      // 같은 해 두 번째 시트
      { name: '2015년 입출금내역 ', reason: 'other' },
    ])
  })

  it('AC-27 읽을 입출금내역 시트가 하나도 없으면 읽을 시트 없음으로 알린다', () => {
    expect(readExcelBook(workbook(otherSheet('연락처'), threeMembers(2025)), deps())).toEqual({ ok: false, problem: 'no-sheets' })
    expect(readExcelBook(workbook(ledgerSheet(2012, 0, [])), deps())).toEqual({ ok: false, problem: 'no-sheets' })
  })
})

describe('SPEC-010 엑셀 불러오기 — 기록 (8절 "날짜"·"금액"·"이월금")', () => {
  it('AC-23 날짜 이어받기·입금/출금 두 기록·이월금을 장부 기록으로 만든다 (날짜 없는 기록은 날짜 칸 없음)', () => {
    const result = read(
      workbook(
        ledgerSheet(2025, 370_482, [
          ['3월', '5일', 10_000, '이자', null],
          [null, null, null, '간식비', 5_000],
          [4, null, 2_000, '환불과 대관료', 30_000],
        ]),
      ),
    )

    expect(result.book.ledgers['2025'].carryover).toBe(370_482)
    expect(brief(entriesOf(result, 2025))).toEqual([
      [3, 5, 'income', '이자', 10_000],
      [3, 5, 'expense', '간식비', 5_000],
      [4, undefined, 'income', '환불과 대관료', 2_000],
      [4, undefined, 'expense', '환불과 대관료', 30_000],
    ])
    expect(entriesOf(result, 2025)[2]).not.toHaveProperty('day')
  })

  it('기록 번호는 받은 함수로 만들고, 적은 시각은 받은 지금 시각에서 줄 순서대로 1ms 씩 늘려 엑셀 순서를 지킨다', () => {
    const result = read(workbook(ledgerSheet(2025, 0, [[3, 5, 10_000, '이자', null], [null, 6, null, '간식비', 5_000]])))

    expect(entriesOf(result, 2025).map(({ id, createdAt }) => [id, createdAt])).toEqual([
      ['id-1', '2026-11-23T00:00:00.000Z'],
      ['id-2', '2026-11-23T00:00:00.001Z'],
    ])
  })

  it('AC-25 지출 줄은 내용 글이 항목 이름이고, 내용이 비면 "지출"이다', () => {
    const result = read(workbook(ledgerSheet(2025, 0, [[3, 5, null, ' 간식비 ', 5_000], [null, 6, null, null, 3_000]])))

    expect(brief(entriesOf(result, 2025))).toEqual([
      [3, 5, 'expense', '간식비', 5_000],
      [3, 6, 'expense', '지출', 3_000],
    ])
    expect(entriesOf(result, 2025).every((entry) => entry.sourceText === undefined)).toBe(true)
  })
})

describe('SPEC-010 엑셀 불러오기 — 회원 (8절 "회원")', () => {
  it('AC-24 회비내역 시트들에서 모은 회원을 새 번호로 명단에 넣고, 회비 표 시작 달은 마지막 해 1월이다', () => {
    const result = read(
      workbook(
        ledgerSheet(2024, 0, []),
        duesSheet(2024, [
          [1, '강민지', ...months(0, { 1: '/', 2: '/' })],
          [2, '김도윤', ...months(0)],
        ]),
        ledgerSheet(2025, 0, []),
        duesSheet(2025, [[1, '강민지', ...months(0, { 7: '/' }), '27만원']], { unpaidColumn: true }),
      ),
    )

    expect(result.book.members).toEqual([
      { id: 'id-1', name: '강민지', joined: '2024-03', off: ['2025-07'], opening: -270_000 },
      { id: 'id-2', name: '김도윤', joined: '2024-01', left: '2025-01', off: [] },
    ])
    expect(result.book.dues).toEqual({ startMonth: '2025-01' })
    expect(result.summary).toMatchObject({ memberCount: 2, lastYearMemberCount: 1, startMonth: '2025-01' })
  })

  it('AC-24 이모 엑셀 모양의 회비내역(번호·이름 머리 글자 없음, 안내 줄 없는 해, 해별 미수 열·미수합계 붙은 해)에서 회원을 모아 낸 분과 월 회비를 정한다', () => {
    const result = read(
      workbook(
        ledgerSheet(2013, 0, [[1, 5, 20_000, '강민지,김도윤', null]]),
        duesSheet(2013, [[1, '강민지', ...months(0)], [2, '김도윤', ...months(0)]], { notice: false }),
        ledgerSheet(2014, 20_000, [[1, 5, 20_000, '1월 -2명: 강민지,김도윤', null]]),
        duesSheet(2014, [[1, '강민지', ...months(0), 30_000, '3만원'], [2, '김도윤', ...months(0), null, null]], {
          pastYears: [2013],
          unpaidColumn: true,
        }),
      ),
    )

    expect(result.summary.unreadSheets).toEqual([])
    expect(result.book.members.map(({ name, opening }) => [name, opening])).toEqual([
      ['강민지', -30_000],
      ['김도윤', undefined],
    ])
    expect(result.summary.monthlyFees).toEqual([
      { year: 2013, fee: 10_000 },
      { year: 2014, fee: 10_000 },
    ])
    expect(Object.values(result.book.ledgers).map((ledger) => ledger.entries[0].payers?.length)).toEqual([2, 2])
  })

  it('회비내역 시트가 없는 해의 입금도 다른 해 시트에서 모은 명단으로 낸 분을 짝짓는다', () => {
    const result = read(
      workbook(
        ledgerSheet(2024, 0, [[3, 5, 20_000, '강민지,김도윤', null]]),
        ledgerSheet(2025, 0, [[3, 5, 20_000, '강민지,김도윤', null]]),
        threeMembers(2025),
      ),
    )
    const ids = memberIds(result)

    expect(entriesOf(result, 2024)[0].payers).toEqual([
      { memberId: ids['강민지'], amount: 10_000 },
      { memberId: ids['김도윤'], amount: 10_000 },
    ])
  })

  it('회비내역 시트가 하나도 없으면 명단은 비고 회비 표 시작 달만 마지막 해 1월로 둔다', () => {
    const result = read(workbook(ledgerSheet(2025, 0, [[3, 5, 20_000, '강민지,김도윤', null]])))

    expect(result.book.members).toEqual([])
    expect(result.book.dues).toEqual({ startMonth: '2025-01' })
    expect(brief(entriesOf(result, 2025))).toEqual([[3, 5, 'income', '강민지,김도윤', 20_000]])
  })
})

describe('SPEC-010 엑셀 불러오기 — 낸 분과 회비 (8절 "낸 분"·"월 회비")', () => {
  const sheets = workbook(
    ledgerSheet(2025, 0, [
      [3, 5, 20_000, '3월 -2명: 강민지,김도윤', null],
      [null, 6, 130_000, '강민지(12만원),김도윤', null],
      [null, 7, 25_000, '강민지,김도윤', null],
      [null, 8, 30_000, '강민지,외부 손님', null],
      [null, 9, 1_234, ' 이자 ', null],
      [null, 10, 5_000, null, null],
    ]),
    threeMembers(2025),
  )

  it('AC-25 이름만 이어진 입금은 낸 분이 있는 회비(항목 "회비") + 엑셀 글이다', () => {
    const result = read(sheets)
    const ids = memberIds(result)

    expect(entriesOf(result, 2025)[0]).toMatchObject({
      type: 'income',
      name: '회비',
      amount: 20_000,
      payers: [
        { memberId: ids['강민지'], amount: 10_000 },
        { memberId: ids['김도윤'], amount: 10_000 },
      ],
      sourceText: '3월 -2명: 강민지,김도윤',
    })
  })

  it('AC-25 "이름(12만원)"은 그분 고정 금액이고 나머지 분이 남은 금액을 나눈다', () => {
    const result = read(sheets)
    const ids = memberIds(result)

    expect(entriesOf(result, 2025)[1].payers).toEqual([
      { memberId: ids['강민지'], amount: 120_000 },
      { memberId: ids['김도윤'], amount: 10_000 },
    ])
  })

  it('AC-25 회원이 섞였지만 못 나눈 입금은 낸 분 없는 회비 + 엑셀 글이다', () => {
    const result = read(sheets)
    const [, , notMultiple, mixed] = entriesOf(result, 2025)

    expect(notMultiple).toMatchObject({ name: '회비', amount: 25_000, sourceText: '강민지,김도윤' })
    expect(notMultiple).not.toHaveProperty('payers')
    expect(mixed).toMatchObject({ name: '회비', amount: 30_000, sourceText: '강민지,외부 손님' })
    expect(mixed).not.toHaveProperty('payers')
    expect(isDuesEntry(mixed)).toBe(true)
    expect(result.summary.unassignedDuesCount).toBe(2)
  })

  it('AC-25 회원이 없는 입금은 내용 글이 항목 이름이 되고(비면 "수입") 엑셀 글은 남기지 않는다', () => {
    const result = read(sheets)
    const [, , , , interest, blank] = entriesOf(result, 2025)

    expect(interest).toEqual({ id: interest.id, month: 3, day: 9, type: 'income', name: '이자', amount: 1_234, createdAt: interest.createdAt })
    expect(blank).toMatchObject({ name: '수입', amount: 5_000 })
    expect(blank).not.toHaveProperty('sourceText')
  })

  it('AC-26 월 회비는 해마다 다 나눈 줄의 한 분 몫 중 가장 흔한 값이고, 그 배수가 아닌 몫은 낸 분 없는 회비가 된다', () => {
    const result = read(
      workbook(
        ledgerSheet(2025, 0, [
          [1, 5, 20_000, '강민지,김도윤', null], // 한 분 1만
          [2, 5, 30_000, '강민지,김도윤,이서준', null], // 한 분 1만
          [3, 5, 40_000, '강민지,김도윤', null], // 한 분 2만 → 1만의 배수
          [4, 5, 15_000, '강민지', null], // 한 분 1만5천 → 배수 아님
        ]),
        threeMembers(2025),
      ),
    )

    expect(result.book.ledgers['2025'].monthlyFee).toBe(10_000)
    expect(entriesOf(result, 2025).map((entry) => entry.payers?.length)).toEqual([2, 3, 2, undefined])
    expect(result.summary.monthlyFees).toEqual([{ year: 2025, fee: 10_000 }])
  })

  it('AC-26 다 나눈 줄이 없는 해는 전 해 월 회비를 쓰고, 어느 해에도 없으면 월 회비 없이 낸 분 없는 회비가 된다', () => {
    const result = read(
      workbook(
        ledgerSheet(2023, 0, [[1, 5, 25_000, '강민지,외부 손님', null]]),
        ledgerSheet(2024, 0, [[1, 5, 40_000, '강민지,김도윤', null]]),
        ledgerSheet(2025, 0, [[1, 5, 60_000, '강민지,김도윤', null], [2, 5, 7_000, '이자', null]]),
        threeMembers(2025),
      ),
    )

    expect(result.summary.monthlyFees).toEqual([{ year: 2023 }, { year: 2024, fee: 20_000 }, { year: 2025, fee: 30_000 }])
    expect(result.book.ledgers['2023']).not.toHaveProperty('monthlyFee')
    expect(entriesOf(result, 2023)[0]).not.toHaveProperty('payers')

    const carried = read(
      workbook(
        ledgerSheet(2024, 0, [[1, 5, 40_000, '강민지,김도윤', null]]),
        ledgerSheet(2025, 0, [[1, 5, 25_000, '강민지,외부 손님', null]]),
        threeMembers(2025),
      ),
    )
    expect(carried.book.ledgers['2025'].monthlyFee).toBe(20_000)
  })

  it('한 분 몫이 같은 횟수로 가장 흔하면 작은 값을 월 회비로 본다 (큰 몫이 그 배수일 수 있게)', () => {
    const result = read(
      workbook(
        ledgerSheet(2025, 0, [[1, 5, 40_000, '강민지,김도윤', null], [2, 5, 20_000, '강민지,김도윤', null]]),
        threeMembers(2025),
      ),
    )

    expect(result.book.ledgers['2025'].monthlyFee).toBe(10_000)
    expect(entriesOf(result, 2025).every((entry) => entry.payers?.length === 2)).toBe(true)
  })

  it('확인 화면에서 고친 해별 월 회비를 주면 그 값으로 배수 판정을 다시 해 낸 분을 나누고, 다 나눈 줄이 없는 다음 해는 고친 값을 이어 쓴다 (#166)', () => {
    const sheets = workbook(
      ledgerSheet(2024, 0, [[1, 5, 20_000, '강민지,김도윤', null], [2, 5, 40_000, '강민지,김도윤', null]]),
      ledgerSheet(2025, 0, [[1, 5, 7_000, '이자', null]]),
      threeMembers(2024),
    )
    expect(read(sheets).summary.monthlyFees).toEqual([{ year: 2024, fee: 10_000 }, { year: 2025, fee: 10_000 }])

    const fixed = readExcelBook(sheets, deps(), { monthlyFees: new Map([[2024, 20_000]]) })

    if (!fixed.ok) throw new Error(fixed.problem)
    expect(fixed.summary.monthlyFees).toEqual([{ year: 2024, fee: 20_000 }, { year: 2025, fee: 20_000 }])
    expect(fixed.book.ledgers['2024'].monthlyFee).toBe(20_000)
    // 한 분 1만 원 줄은 2만 원의 배수가 아니라 낸 분 없는 회비, 한 분 2만 원 줄은 그대로 낸 분
    expect(fixed.book.ledgers['2024'].entries.map((entry) => entry.payers?.length)).toEqual([undefined, 2])
    expect(fixed.summary.unassignedDuesCount).toBe(1)
  })
})

describe('SPEC-010 엑셀 불러오기 — 검산과 확인 화면 요약 (8절 "검산", "읽은 내용 확인")', () => {
  it('AC-27 해마다 이월금 + 수입 − 지출을 엑셀 마지막 잔액·다음 해 이월금과 비교해 다른 곳을 알려 준다', () => {
    const result = read(
      workbook(
        // 2023: 맞음 (100,000 + 20,000 − 5,000 = 115,000)
        ledgerSheet(2023, 100_000, [[3, 5, 20_000, '이자', null], [null, 6, null, '간식비', 5_000]]),
        // 2024: 엑셀 마지막 잔액이 다름(손으로 고친 칸), 2025 이월금도 다름
        ledgerSheet(2024, 115_000, [[3, 5, 10_000, '이자', null], [null, 6, null, '간식비', 5_000, 118_000]]),
        ledgerSheet(2025, 118_000, []),
      ),
    )

    expect(result.summary.balanceChecks).toEqual([
      { year: 2023, computed: 115_000, excelBalance: 115_000, nextCarryover: 115_000 },
      { year: 2024, computed: 120_000, excelBalance: 118_000, nextCarryover: 118_000 },
      { year: 2025, computed: 118_000, excelBalance: 118_000 },
    ])
    expect(result.summary.balanceMismatches).toEqual([
      { year: 2024, against: 'excel-balance', excel: 118_000, computed: 120_000 },
      { year: 2024, against: 'next-carryover', excel: 118_000, computed: 120_000 },
    ])
  })

  it('AC-27 잔액이 모두 맞으면 다른 곳이 없다 (이월금은 엑셀 값을 그대로 쓴다)', () => {
    const result = read(workbook(ledgerSheet(2024, 0, [[3, 5, 20_000, '이자', null]]), ledgerSheet(2025, 20_000, [])))

    expect(result.summary.balanceMismatches).toEqual([])
    expect(result.book.ledgers['2025'].carryover).toBe(20_000)
  })

  it('확인 화면 요약: 해·기록 수(수입·지출)·회원 수·해별 월 회비·날짜를 바꾼 줄·읽지 못한 줄', () => {
    const result = read(
      workbook(
        ledgerSheet(2024, 0, [
          [2, 31, 20_000, '강민지,김도윤', null],
          [null, 5, '이만원', '이서준', null],
        ]),
        ledgerSheet(2025, 20_000, [[1, 5, 30_000, '강민지,김도윤,이서준', null], [null, 6, null, '간식비', 4_000]]),
        threeMembers(2025),
      ),
    )

    expect(result.summary).toMatchObject({
      years: [2024, 2025],
      incomeCount: 2,
      expenseCount: 1,
      memberCount: 3,
      lastYearMemberCount: 3,
      monthlyFees: [
        { year: 2024, fee: 10_000 },
        { year: 2025, fee: 10_000 },
      ],
      unassignedDuesCount: 0,
      changedDates: [{ year: 2024, month: 2, text: expect.stringContaining('2 31 20000 강민지,김도윤') }],
      unreadLines: [{ year: 2024, month: 2, text: expect.stringContaining('이만원 이서준') }],
    })
    expect(entriesOf(result, 2024)[0]).toMatchObject({ month: 2, day: 29 })
  })

  it('이모 엑셀 규모(14개 해·1,120건, 회원 20명, 낸 분 4명씩 + 엑셀 글)를 읽은 저장 데이터는 확인 화면 경고 기준(900KB)보다 작다', () => {
    const names = Array.from({ length: 20 }, (_, index) => `지어낸회원${index + 1}`)
    const sheets = Array.from({ length: 14 }, (_, offset) => {
      const year = 2013 + offset
      const rows = Array.from({ length: 80 }, (_, index): LedgerRow => {
        const month = Math.floor(index / 7) + 1
        return index % 4 === 3
          ? [month, (index % 28) + 1, null, '정기 모임 대관료와 간식비', 85_000]
          : [month, (index % 28) + 1, 40_000, `${month}월 -4명: ${names.slice(index % 16, (index % 16) + 4).join(',')}`, null]
      })
      return [ledgerSheet(year, 100_000, rows), duesSheet(year, names.map((name, index) => [index + 1, name, ...months(0)]))]
    })
    // 앱처럼 기록·회원 번호를 UUID 로
    const result = readExcelBook(workbook(...sheets.flat()), { createId: () => crypto.randomUUID(), now: () => new Date(NOW) })
    if (!result.ok) throw new Error(result.problem)
    const book: Book = { id: crypto.randomUUID(), name: '지어낸 모임', kind: 'club', createdAt: NOW, ...result.book }
    const data = { schemaVersion: CURRENT_SCHEMA_VERSION, books: [book], settings: { recoveryCode: 'HK7M-29QF-MX4P-8R2D' } }

    expect(result.summary.incomeCount + result.summary.expenseCount).toBe(1_120)
    expect(Object.values(result.book.ledgers).flatMap((ledger) => ledger.entries).filter((entry) => entry.payers?.length === 4)).toHaveLength(840)
    // 잰 값 약 490KB (2026-11-23). 자동으로 지키기 상한 1MB, 확인 화면 경고 900KB (SPEC-010 8절, 기술 메모 "크기")
    expect(new TextEncoder().encode(JSON.stringify(data)).length).toBeLessThan(900_000)
  })

  it('불러온 장부에서 회비 표 시작 달(마지막 해 1월) 이후의 못 나눈 회비만 7절 "낸 분 붙이기" 대상이 된다', () => {
    const result = read(
      workbook(
        ledgerSheet(2024, 0, [[3, 5, 30_000, '강민지,외부 손님', null]]),
        ledgerSheet(2025, 30_000, [[1, 5, 20_000, '강민지,김도윤', null], [2, 5, 25_000, '김도윤,외부 손님', null]]),
        threeMembers(2025),
      ),
    )
    const book: Book = { id: 'book-excel', name: '지어낸 모임', kind: 'club', createdAt: NOW, ...result.book }

    expect(result.summary.unassignedDuesCount).toBe(2)
    expect(unassignedDues(book).items.map(({ year, entry }) => [year, entry.month, entry.sourceText])).toEqual([[2025, 2, '김도윤,외부 손님']])
  })

  it('불러온 장부는 저장 형식 v4 검사(isStoredData)를 통과한다', () => {
    const result = read(
      workbook(
        ledgerSheet(2024, 50_000, [
          [2, 31, 20_000, '2월 -2명: 강민지,김도윤', null],
          [3, null, 25_000, '강민지,외부 손님', null],
          [null, null, 1_000, '이자', null],
          [null, 9, null, null, 8_000],
        ]),
        duesSheet(2024, [[1, '강민지', ...months(0, { 5: '/' })], [2, '김도윤', ...months(0)]]),
        ledgerSheet(2025, 88_000, [[1, 5, 130_000, '강민지(12만원),김도윤', null]]),
        duesSheet(2025, [[1, '강민지', ...months(0), '3만원']], { unpaidColumn: true }),
      ),
    )
    const book: Book = { id: 'book-excel', name: '지어낸 모임', kind: 'club', createdAt: NOW, ...result.book }

    expect(isStoredData({ schemaVersion: CURRENT_SCHEMA_VERSION, books: [book], settings: {} })).toBe(true)
    expect(entriesOf(result, 2025)[0].payers).toHaveLength(2)
  })
})
