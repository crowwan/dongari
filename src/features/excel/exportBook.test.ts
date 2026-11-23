import { describe, expect, it } from 'vitest'
import type { Book, Entry, Ledger, Member, Payer } from '../../domain/types'
import { book as bookOf } from '../../test/ledgerFixtures'
import { merge } from '../../test/excelFixtures'
import { exportBook, exportContents, exportFileName } from './exportBook'
import { readExcelBook } from './readExcelBook'
import type { WriteCell, WriteSheet } from './sheet'
import { readWorkbook, writeWorkbook } from './sheetjs'

// 지어낸 동아리 "다솜회" (실제 이모 엑셀·이름은 쓰지 않는다). 회비 표는 2026년 1월부터, 월 회비 2025년 10,000원(2026년은 이어 씀)
// - 강민지: 2025년 1월부터 / 김도윤: 2025년 3월부터, 2026년 2~3월 쉼 / 이서준: 2025년만(2026년 1월에 그만둠), 그만둔 뒤 3월에 한 번 냄 /
//   박하늘: 2026년 7월부터
const TODAY = new Date('2026-11-24T09:00:00.000+09:00')

const MEMBERS: Member[] = [
  { id: 'm1', name: '강민지', joined: '2025-01', off: [] },
  { id: 'm2', name: '김도윤', joined: '2025-03', off: ['2026-02', '2026-03'] },
  { id: 'm3', name: '이서준', joined: '2025-01', left: '2026-01', off: [] },
  { id: 'm4', name: '박하늘', joined: '2026-07', off: [] },
]

let seq = 0
function entry(
  month: number,
  day: number | undefined,
  type: Entry['type'],
  name: string,
  amount: number,
  more: { payers?: Payer[]; sourceText?: string } = {},
): Entry {
  seq += 1
  const dated = day === undefined ? {} : { day }
  return { id: `e${seq}`, month, ...dated, type, name, amount, createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}.000Z`, ...more }
}

const LEDGER_2025: Ledger = {
  year: 2025,
  carryover: 100_000,
  monthlyFee: 10_000,
  entries: [
    // 1월: 날짜 있는 기록을 먼저 적었어도 날짜 없는 기록(예전 기록)이 그 달 맨 앞에 간다
    entry(1, 15, 'expense', '대관료', 50_000),
    entry(1, undefined, 'income', '회비', 20_000, { payers: [{ memberId: 'm1', amount: 10_000 }, { memberId: 'm3', amount: 10_000 }] }),
    entry(1, undefined, 'income', '이자', 300),
    // 3월 5일: 한 분은 1년 치(월 회비와 다른 금액), 한 분은 한 달 치 / 엑셀에서 낸 분을 못 나눈 회비(엑셀 글)
    entry(3, 5, 'income', '회비', 130_000, { payers: [{ memberId: 'm1', amount: 120_000 }, { memberId: 'm2', amount: 10_000 }] }),
    entry(3, 5, 'income', '회비', 15_000, { sourceText: '이서준' }),
    entry(6, 10, 'income', '회비', 20_000, { payers: [{ memberId: 'm3', amount: 20_000 }] }),
  ],
}

const LEDGER_2026: Ledger = {
  year: 2026,
  carryover: 235_300,
  entries: [
    entry(1, 9, 'income', '회비', 20_000, { payers: [{ memberId: 'm1', amount: 10_000 }, { memberId: 'm2', amount: 10_000 }] }),
    entry(2, 3, 'expense', '간식비', 12_000),
    entry(3, 2, 'income', '회비', 10_000, { payers: [{ memberId: 'm3', amount: 10_000 }] }),
    entry(7, 20, 'income', '회비', 15_000, { payers: [{ memberId: 'm4', amount: 15_000 }] }),
    // [이름 없이 적기]로 적은 회비 (낸 분·엑셀 글 없음)
    entry(7, 20, 'income', '회비', 10_000),
    entry(10, 1, 'expense', '커피, 다과', 8_000),
  ],
}

const CLUB: Book = bookOf([LEDGER_2025, LEDGER_2026], { name: '다솜회', members: MEMBERS, dues: { startMonth: '2026-01' } })

function sheetNamed(sheets: readonly WriteSheet[], name: string): WriteSheet {
  const sheet = sheets.find((item) => item.name === name)
  if (!sheet) throw new Error(`${name} 시트가 없다`)
  return sheet
}

const MONTH_HEADERS = Array.from({ length: 12 }, (_, index) => `${index + 1}월`)
const blank = (count: number): WriteCell[] => Array<WriteCell>(count).fill(null)

describe('SPEC-010 엑셀 내보내기 — 시트 (9절, #167)', () => {
  it('AC-32 지금 장부의 모든 해를 새 해부터, 해마다 회비내역 → 입출금내역 순으로 담는다', () => {
    expect(exportBook(CLUB, TODAY).sheets.map((sheet) => sheet.name)).toEqual([
      '2026년 회비내역',
      '2026년 입출금내역',
      '2025년 회비내역',
      '2025년 입출금내역',
    ])
  })

  it('AC-32 입출금내역: 제목(A~F 병합)·머리·이월금 줄(A~E 병합) 아래 날짜순, 같은 달은 날짜 없는 기록 먼저, 월은 그 달 첫 줄만, 잔액은 수식과 값', () => {
    const sheet = sheetNamed(exportBook(CLUB, TODAY).sheets, '2025년 입출금내역')

    expect(sheet.rows).toEqual([
      // 제목 줄 오른쪽(G1·H1)에 그 해 월 회비 — 다시 읽을 때 추정하지 않고 이 값을 쓴다 (8절)
      ['2025년 다솜회 입출금 내역', null, null, null, null, null, '월 회비', 10_000],
      ['월', '일', '입금', null, '출금', '잔액'],
      ['2024년 이월금', null, null, null, null, 100_000],
      [1, null, 20_000, '강민지,이서준', null, { formula: 'F3+C4-E4', value: 120_000 }],
      [null, null, 300, '이자', null, { formula: 'F4+C5-E5', value: 120_300 }],
      [null, 15, null, '대관료', 50_000, { formula: 'F5+C6-E6', value: 70_300 }],
      [3, 5, 130_000, '강민지(12만원),김도윤', null, { formula: 'F6+C7-E7', value: 200_300 }],
      [null, 5, 15_000, '이서준', null, { formula: 'F7+C8-E8', value: 215_300 }],
      [6, 10, 20_000, '이서준(2만원)', null, { formula: 'F8+C9-E9', value: 235_300 }],
    ])
    expect(sheet.merges).toEqual([merge(0, 0, 0, 5), merge(2, 0, 2, 4)])
    // 내용 열(D)이 가장 넓다
    expect(Math.max(...sheet.columnWidths)).toBe(sheet.columnWidths[3])
  })

  it('AC-32 내용: 낸 분은 이름을 쉼표로, 월 회비와 다른 금액은 "이름(N만원)"·"이름(N원)", 낸 분 없는 회비는 엑셀 글 또는 항목 이름, 지출은 항목 이름', () => {
    const sheet = sheetNamed(exportBook(CLUB, TODAY).sheets, '2026년 입출금내역')

    expect(sheet.rows.slice(3).map((row) => row[3])).toEqual(['강민지,김도윤', '간식비', '이서준', '박하늘(15000원)', '회비', '커피, 다과'])
  })

  it('AC-32 그 해 월 회비가 없으면 낸 분마다 금액을 붙인다 (다시 읽을 때 월 회비 배수 판정 없이 낸 분이 되게)', () => {
    const noFee = bookOf(
      [{ year: 2026, carryover: 0, entries: [entry(3, 1, 'income', '회비', 30_000, { payers: [{ memberId: 'm1', amount: 10_000 }, { memberId: 'm2', amount: 20_000 }] })] }],
      { members: MEMBERS, dues: { startMonth: '2026-01' } },
    )

    const rows = sheetNamed(exportBook(noFee, TODAY).sheets, '2026년 입출금내역').rows
    expect(rows[3][3]).toBe('강민지(1만원),김도윤(2만원)')
    // 월 회비가 어느 해에도 없으면 "월 회비" 칸도 없다
    expect(rows[0]).toEqual(['2026년 한랑드림 입출금 내역'])
  })

  it('AC-32 "월 회비" 칸은 그 해에 쓰는 월 회비(그 해 값이 없으면 이어 쓰는 전 해 값), 개인 가계부에는 없다', () => {
    expect(sheetNamed(exportBook(CLUB, TODAY).sheets, '2026년 입출금내역').rows[0]).toEqual([
      '2026년 다솜회 입출금 내역',
      null,
      null,
      null,
      null,
      null,
      '월 회비',
      10_000,
    ])
    expect(sheetNamed(exportBook({ ...CLUB, kind: 'household' }, TODAY).sheets, '2026년 입출금내역').rows[0]).toEqual(['2026년 다솜회 입출금 내역'])
  })

  it('AC-32 적자 이월금은 빼기 수로, 기록이 없는 해도 제목·머리·이월금 줄은 있다', () => {
    const empty = bookOf([{ year: 2026, carryover: -12_000, entries: [] }], { name: '다솜회' })

    expect(sheetNamed(exportBook(empty, TODAY).sheets, '2026년 입출금내역').rows).toEqual([
      ['2026년 다솜회 입출금 내역'],
      ['월', '일', '입금', null, '출금', '잔액'],
      ['2025년 이월금', null, null, null, null, -12_000],
    ])
  })

  it('AC-32 회비내역: 제목·머리 [번호, 이름, 1월 … 12월, 낸 돈, 덜 낸 돈] 아래 가나다 순, 칸은 ○·일부·"/"·"-"·빈칸, 덜 낸 돈은 내보낸 날의 지난달까지', () => {
    const sheet = sheetNamed(exportBook(CLUB, TODAY).sheets, '2026년 회비내역')

    expect(sheet.rows).toEqual([
      ['2026년 다솜회 회비'],
      ['번호', '이름', ...MONTH_HEADERS, '낸 돈', '덜 낸 돈'],
      // 10월까지 기준: 2~10월 9칸 = 90,000원
      [1, '강민지', '○', ...blank(11), 10_000, 90_000],
      // 2~3월 쉼, 4~10월 7칸
      [2, '김도윤', '○', '/', '/', ...blank(9), 10_000, 70_000],
      // 7월에 들어옴: 15,000원이 7월 ○ + 8월 5,000원(만 원 단위가 아니라 원)
      [3, '박하늘', ...Array<WriteCell>(6).fill('-'), '○', '5000원', ...blank(4), 15_000, 25_000],
      // 그만둔 뒤 낸 돈만 있는 분: 회비 표처럼 줄이 있고 칸은 모두 "-" (다시 읽을 때 그만둔 달이 이어진다)
      [4, '이서준', ...Array<WriteCell>(12).fill('-'), 10_000, 0],
    ])
    expect(sheet.merges).toEqual([merge(0, 0, 0, 15)])
    expect(sheet.columnWidths).toHaveLength(16)
  })

  it('AC-32 회비 표 시작 해보다 이른 해도 회비내역을 만든다: 달 칸은 회원 아닌 달 "-"·쉬는 달 "/" 만, 낸 돈은 이름별 합계, 덜 낸 돈은 비움', () => {
    const sheet = sheetNamed(exportBook(CLUB, TODAY).sheets, '2025년 회비내역')

    expect(sheet.rows).toEqual([
      ['2025년 다솜회 회비 (회비 표는 2026년 1월부터 계산해요. 이 해는 낸 돈만 적었어요)'],
      ['번호', '이름', ...MONTH_HEADERS, '낸 돈', '덜 낸 돈'],
      [1, '강민지', ...blank(12), 130_000, null],
      [2, '김도윤', '-', '-', ...blank(10), 10_000, null],
      [3, '이서준', ...blank(12), 30_000, null],
    ])
  })

  it('AC-32 일부만 찬 칸은 만 원 단위면 "1만", 월 회비를 정하지 않은 해의 칸은 안 낸 빈칸과 다른 "모름", 시작 달 전 쉬는 달도 "/"', () => {
    const fees = bookOf(
      [
        { year: 2025, carryover: 0, entries: [] },
        { year: 2026, carryover: 0, monthlyFee: 20_000, entries: [entry(1, 5, 'income', '회비', 30_000, { payers: [{ memberId: 'm1', amount: 30_000 }] })] },
      ],
      { members: [{ id: 'm1', name: '강민지', joined: '2025-01', off: ['2025-01'] }], dues: { startMonth: '2025-02' } },
    )
    const sheets = exportBook(fees, TODAY).sheets

    expect(sheetNamed(sheets, '2025년 회비내역').rows[0]).toEqual(['2025년 한랑드림 회비 (회비 표는 2025년 2월부터 계산해요)'])
    expect(sheetNamed(sheets, '2025년 회비내역').rows[2]).toEqual([1, '강민지', '/', ...Array<WriteCell>(11).fill('모름'), 0, 0])
    // 10월까지 기준: 1~10월 200,000원 − 30,000원
    expect(sheetNamed(sheets, '2026년 회비내역').rows[2]).toEqual([1, '강민지', '○', '1만', ...blank(10), 30_000, 170_000])
  })

  it('AC-32 개인 가계부는 회원 값이 남아 있어도 입출금내역만, 동아리도 회원이 없거나 그 해 줄이 없으면 회비내역을 만들지 않는다', () => {
    const household: Book = { ...CLUB, kind: 'household' }
    const noMembers = bookOf([LEDGER_2026], { members: [] })
    const lateMembers = bookOf([{ year: 2024, carryover: 0, entries: [] }, LEDGER_2026], { members: MEMBERS, dues: { startMonth: '2026-01' } })

    expect(exportBook(household, TODAY).sheets.map((sheet) => sheet.name)).toEqual(['2026년 입출금내역', '2025년 입출금내역'])
    expect(exportBook(noMembers, TODAY).sheets.map((sheet) => sheet.name)).toEqual(['2026년 입출금내역'])
    expect(exportBook(lateMembers, TODAY).sheets.map((sheet) => sheet.name)).toEqual(['2026년 회비내역', '2026년 입출금내역', '2024년 입출금내역'])
  })
})

describe('SPEC-010 엑셀 내보내기 — 파일 이름과 담긴 것 (9절)', () => {
  it('파일 이름은 "{장부 이름} 장부 YYYY-MM-DD.xlsx"(오늘, 폰 날짜), 파일 이름에 못 쓰는 글자는 뺀다', () => {
    expect(exportFileName('다솜회', TODAY)).toBe('다솜회 장부 2026-11-24.xlsx')
    expect(exportFileName(' 다솜/회:2026?* "모임" <1>|\\ ', new Date(2026, 0, 5))).toBe('다솜회2026 모임 1 장부 2026-01-05.xlsx')
    expect(exportFileName('다솜\u0007회', TODAY)).toBe('다솜회 장부 2026-11-24.xlsx')
    expect(exportFileName('///', TODAY)).toBe('장부 2026-11-24.xlsx')
  })

  it('담긴 것: 해 범위와 시트 종류 ("2025~2026년 / 해마다 입출금내역 · 회비내역", 가계부·한 해)', () => {
    expect(exportContents(exportBook(CLUB, TODAY))).toEqual({ years: '2025~2026년', sheets: '해마다 입출금내역 · 회비내역' })
    expect(exportContents(exportBook({ ...CLUB, kind: 'household' }, TODAY))).toEqual({ years: '2025~2026년', sheets: '해마다 입출금내역' })
    expect(exportContents(exportBook(bookOf([LEDGER_2026]), TODAY))).toEqual({ years: '2026년', sheets: '입출금내역' })
  })

  it('담긴 해가 없으면 "undefined년" 대신 "기록 없음" (#180 리뷰)', () => {
    expect(exportContents({ years: [], hasDues: false })).toEqual({ years: '기록 없음', sheets: '입출금내역' })
  })
})

// 다시 읽은 장부를 이름으로 맞춰 보는 모양 (기록 번호·적은 시각·회원 번호는 새로 생긴다)
interface EntryKey {
  date: string // "3/5", 날짜 없으면 "3/-"
  type: Entry['type']
  name: string
  amount: number
  payers: string // "강민지 120000, 김도윤 10000" (이름 순)
}

function byKey<T>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

function entryKeys(target: Pick<Book, 'ledgers' | 'members'>, year: number): EntryKey[] {
  const names = new Map((target.members ?? []).map((member) => [member.id, member.name]))
  const ledger = target.ledgers[String(year)]
  return byKey(
    (ledger?.entries ?? []).map(({ month, day, type, name, amount, payers }) => ({
      date: `${month}/${day ?? '-'}`,
      type,
      name,
      amount,
      payers: (payers ?? [])
        .map((payer) => `${names.get(payer.memberId)} ${payer.amount}`)
        .sort()
        .join(', '),
    })),
  )
}

function memberKeys(members: readonly Member[]) {
  return members.map(({ name, joined, left, off }) => ({ name, joined, left, off })).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

describe('SPEC-010 엑셀 내보내기 — 다시 불러오기 (9절, AC-33)', () => {
  async function roundTrip(book: Book) {
    const blob = await writeWorkbook(exportBook(book, TODAY).sheets)
    let id = 0
    const read = readExcelBook(await readWorkbook(await blob.arrayBuffer()), { createId: () => `r${++id}`, now: () => TODAY })
    if (!read.ok) throw new Error('다시 읽지 못했다')
    return read
  }

  it('AC-33 내보낸 파일을 다시 불러오면 기록·이월금·회원(들어온 달·그만둔 달·쉬는 달)·낸 분이 같다', async () => {
    const { book: again, summary } = await roundTrip(CLUB)

    expect(Object.keys(again.ledgers).sort()).toEqual(['2025', '2026'])
    for (const year of [2025, 2026]) {
      expect(again.ledgers[String(year)].carryover).toBe(CLUB.ledgers[String(year)].carryover)
      expect(entryKeys(again, year)).toEqual(entryKeys(CLUB, year))
    }
    expect(memberKeys(again.members)).toEqual(memberKeys(MEMBERS))
    // 월 회비도 이름만 쓴 줄(한 분 몫 = 월 회비)로 다시 정해진다
    expect(summary.monthlyFees).toEqual([
      { year: 2025, fee: 10_000 },
      { year: 2026, fee: 10_000 },
    ])
    // 엑셀 글로 남아 있던 못 나눈 회비는 다시 못 나눈 회비(같은 엑셀 글)로
    expect(again.ledgers['2025'].entries.find((item) => item.amount === 15_000)?.sourceText).toBe('이서준')
    expect(summary.balanceMismatches).toEqual([])
  })

  it('AC-33 괄호로 구분한 같은 이름 두 분("김민지"·"김민지(91)")도 회원·낸 분이 같다 (#180 리뷰)', async () => {
    const twins: Member[] = [
      { id: 't1', name: '김민지', joined: '2026-01', off: [] },
      { id: 't2', name: '김민지(91)', joined: '2026-01', off: [] },
    ]
    const club = bookOf(
      [
        {
          year: 2026,
          carryover: 0,
          monthlyFee: 10_000,
          entries: [
            entry(1, 5, 'income', '회비', 20_000, { payers: [{ memberId: 't1', amount: 10_000 }, { memberId: 't2', amount: 10_000 }] }),
            entry(2, 5, 'income', '회비', 30_000, { payers: [{ memberId: 't2', amount: 30_000 }] }),
          ],
        },
      ],
      { members: twins, dues: { startMonth: '2026-01' } },
    )
    expect(sheetNamed(exportBook(club, TODAY).sheets, '2026년 입출금내역').rows.slice(3).map((row) => row[3])).toEqual([
      '김민지,김민지(91)',
      '김민지(91)(3만원)',
    ])

    const { book: again } = await roundTrip(club)

    expect(memberKeys(again.members)).toEqual(memberKeys(twins))
    expect(entryKeys(again, 2026)).toEqual(entryKeys(club, 2026))
  })

  it('AC-33 낸 분을 못 나눈 회비(엑셀 글)가 이름만 있는 줄보다 많아도 "월 회비" 칸 값으로 다시 나눠 낸 분·월 회비가 같다 (#180 리뷰)', async () => {
    // 한 분 1만 원 줄 하나 + 엑셀 글 "김도윤" 1만5천 원 셋: 추정하면 1만5천이 가장 흔해 1만 원 줄의 낸 분이 빠지고 1만5천 줄에 낸 분이 생긴다
    const unassigned = () => entry(2, 5, 'income', '회비', 15_000, { sourceText: '김도윤' })
    const club = bookOf(
      [
        {
          year: 2026,
          carryover: 0,
          monthlyFee: 10_000,
          entries: [entry(1, 5, 'income', '회비', 10_000, { payers: [{ memberId: 'm1', amount: 10_000 }] }), unassigned(), unassigned(), unassigned()],
        },
      ],
      { members: MEMBERS.slice(0, 2), dues: { startMonth: '2026-01' } },
    )
    const { book: again, summary } = await roundTrip(club)

    expect(entryKeys(again, 2026)).toEqual(entryKeys(club, 2026))
    expect(summary.monthlyFees).toEqual([{ year: 2026, fee: 10_000 }])
    expect(summary.unassignedDuesCount).toBe(3)
  })

  it('AC-33 개인 가계부도 기록(날짜·종류·항목·금액)·이월금이 같다 — 숨긴 회원 값(동아리였던 장부)은 내보내지 않는다', async () => {
    const household: Book = { ...CLUB, kind: 'household' }
    const { book: again } = await roundTrip(household)
    const withoutPayers = (keys: EntryKey[]) => byKey(keys.map((key) => ({ ...key, payers: '' })))

    expect(again.members).toEqual([])
    for (const year of [2025, 2026]) {
      expect(again.ledgers[String(year)].carryover).toBe(household.ledgers[String(year)].carryover)
      expect(withoutPayers(entryKeys(again, year))).toEqual(withoutPayers(entryKeys(household, year)))
    }
  })
})
