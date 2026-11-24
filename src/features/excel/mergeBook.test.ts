import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type Book, type Entry, type Member } from '../../domain/types'
import { isStoredData } from '../../storage/schema'
import { defaultMergeYears, mergeImportedYears, mergePlan, mergeYearRows } from './mergeBook'
import type { ImportedBook } from './readExcelBook'

// 기록 하나 (낸 분은 [회원 번호, 금액])
function entry(id: string, month: number, name: string, amount: number, payers?: [string, number][]): Entry {
  const made: Entry = { id, month, day: 5, type: 'income', name, amount, createdAt: '2026-11-23T00:00:00.000Z' }
  if (payers) made.payers = payers.map(([memberId, share]) => ({ memberId, amount: share }))
  return made
}

function member(id: string, name: string, joined: string, extra: Partial<Member> = {}): Member {
  return { id, name, joined, off: [], ...extra }
}

// 앱에 있는 동아리 장부: 2025·2026년 기록, 2027년은 장부만 있고 기록 0건. 김도윤·박서연(앱에만)
function appBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    name: '한랑드림',
    kind: 'club',
    createdAt: '2025-01-01T00:00:00.000Z',
    ledgers: {
      '2025': {
        year: 2025,
        carryover: 50_000,
        monthlyFee: 20_000,
        entries: [entry('a1', 1, '회비', 20_000, [['m1', 20_000]]), { ...entry('a2', 2, '간식비', 8_000), type: 'expense' }],
      },
      '2026': { year: 2026, carryover: 62_000, entries: [entry('a3', 3, '회비', 20_000, [['m9', 20_000]])] },
      '2027': { year: 2027, carryover: 0, entries: [] },
    },
    members: [
      member('m1', '김도윤', '2025-03', { left: '2027-01', off: ['2024-03', '2025-08', '2026-02'], opening: -40_000 }),
      member('m9', '박서연', '2026-01'),
    ],
    dues: { startMonth: '2025-01', hideUnassigned: true },
    ...overrides,
  }
}

// 엑셀에서 읽은 것: 2024·2025·2027년. 김도윤(앱과 같은 이름, 앞뒤 공백)·이서준(새 이름)·정하늘(2021년에 그만둠)
function imported(overrides: Partial<ImportedBook> = {}): ImportedBook {
  return {
    ledgers: {
      '2024': {
        year: 2024,
        carryover: 30_000,
        monthlyFee: 10_000,
        entries: [entry('x1', 1, '회비', 20_000, [['e-kim', 10_000], ['e-lee', 10_000]]), entry('x2', 2, '이자', 1_000)],
      },
      '2025': {
        year: 2025,
        carryover: 51_000,
        monthlyFee: 10_000,
        entries: [entry('x3', 1, '회비', 30_000, [['e-lee', 30_000]]), entry('x4', 4, '회비', 15_000)],
      },
      '2027': { year: 2027, carryover: 96_000, entries: [entry('x5', 1, '회비', 10_000, [['e-kim', 10_000]])] },
    },
    members: [
      member('e-kim', ' 김도윤 ', '2023-01', { off: ['2024-03', '2024-07', '2025-02'], opening: -10_000 }),
      member('e-lee', '이서준', '2024-01', { off: ['2024-09'], opening: -20_000 }),
      member('e-jung', '정하늘', '2019-01', { left: '2022-01' }),
    ],
    dues: { startMonth: '2027-01' },
    ...overrides,
  }
}

function ids() {
  let next = 0
  return {
    createId: () => {
      next += 1
      return `new-${next}`
    },
  }
}

describe('SPEC-010 엑셀로 기존 장부에 넣기 — 해 목록 (8절 "다른 장부에 넣기", #169)', () => {
  it('해 목록은 엑셀 해마다 엑셀 기록 수와 지금 앱 기록 수다 (장부만 있고 기록이 없는 해는 0건)', () => {
    expect(mergeYearRows(appBook(), imported())).toEqual([
      { year: 2024, excelCount: 2, appCount: 0 },
      { year: 2025, excelCount: 2, appCount: 2 },
      { year: 2027, excelCount: 1, appCount: 0 },
    ])
  })

  it('AC-31 앱 기록이 있는 해는 체크 없이 시작하고, 앱 기록이 없는 해만 처음부터 고른다', () => {
    expect(defaultMergeYears(mergeYearRows(appBook(), imported()))).toEqual([2024, 2027])
  })
})

describe('SPEC-010 엑셀로 기존 장부에 넣기 — 넣기 (8절 "다른 장부에 넣기", #169)', () => {
  it('AC-31 고른 해만 엑셀 것(이월금·기록·월 회비)으로 통째로 바뀌고, 고르지 않은 해는 그대로다', () => {
    const merged = mergeImportedYears(appBook(), imported(), [2025, 2027], ids())

    expect(Object.keys(merged.ledgers).sort()).toEqual(['2025', '2026', '2027'])
    expect(merged.ledgers['2025']).toMatchObject({ year: 2025, carryover: 51_000, monthlyFee: 10_000 })
    expect(merged.ledgers['2025'].entries.map((item) => item.id)).toEqual(['x3', 'x4'])
    expect(merged.ledgers['2027'].carryover).toBe(96_000)
    // 고르지 않은 해: 앱 2026년은 그대로, 엑셀 2024년은 넣지 않는다
    expect(merged.ledgers['2026']).toEqual(appBook().ledgers['2026'])
    expect(merged.ledgers['2024']).toBeUndefined()
    expect(merged).toMatchObject({ id: 'book-1', name: '한랑드림', kind: 'club', createdAt: '2025-01-01T00:00:00.000Z' })
  })

  it('AC-31 회원은 이름으로 합쳐 엑셀 기록의 낸 분을 앱 회원 번호로 바꿔 끼우고, 없는 이름은 새 번호로 넣는다', () => {
    const merged = mergeImportedYears(appBook(), imported(), [2024, 2025], ids())

    expect(merged.members?.map((item) => [item.id, item.name])).toEqual([
      ['m1', '김도윤'],
      ['m9', '박서연'],
      ['new-1', '이서준'],
    ])
    expect(merged.ledgers['2024'].entries[0].payers).toEqual([
      { memberId: 'm1', amount: 10_000 },
      { memberId: 'new-1', amount: 10_000 },
    ])
    expect(merged.ledgers['2025'].entries[0].payers).toEqual([{ memberId: 'new-1', amount: 30_000 }])
    // 앱에 있던 기록의 낸 분은 그대로
    expect(merged.ledgers['2026'].entries[0].payers).toEqual([{ memberId: 'm9', amount: 20_000 }])
  })

  it('합친 회원의 들어온 달·그만둔 달·시작할 때 남은 돈은 앱 값 그대로, 쉬는 달은 넣는 해 안만 엑셀 값으로 바뀐다', () => {
    const merged = mergeImportedYears(appBook(), imported(), [2024, 2025], ids())

    const kim = merged.members?.find((item) => item.id === 'm1')
    // 2024·2025년 쉬는 달은 엑셀(2024-03·2024-07·2025-02), 그 밖의 해(2026-02)는 앱 값. 앱의 2025-08 은 넣는 해라 빠진다
    expect(kim).toEqual(member('m1', '김도윤', '2025-03', { left: '2027-01', off: ['2024-03', '2024-07', '2025-02', '2026-02'], opening: -40_000 }))
  })

  it('넣는 해에 회원이 아니었고 넣는 해 기록에 낸 분으로도 없는 엑셀 회원은 넣지 않는다', () => {
    // 2027년만: 이서준은 2024년에 들어와 2027년에도 회원(그만둔 달 없음)이라 넣고, 2021년까지 회원이던 정하늘은 넣지 않는다
    const merged = mergeImportedYears(appBook(), imported(), [2027], ids())

    expect(merged.members?.map((item) => item.name)).toEqual(['김도윤', '박서연', '이서준'])
  })

  it('넣는 해에 그만둔 뒤라도 그 해 기록에 낸 분으로 나오면 넣는다', () => {
    const book = imported({ members: [member('e-jung', '정하늘', '2019-01', { left: '2022-01' })] })
    book.ledgers['2024'].entries = [entry('x1', 1, '회비', 10_000, [['e-jung', 10_000]])]

    const merged = mergeImportedYears(appBook(), book, [2024], ids())

    expect(merged.members?.at(-1)).toEqual(member('new-1', '정하늘', '2019-01', { left: '2022-01' }))
    expect(merged.ledgers['2024'].entries[0].payers).toEqual([{ memberId: 'new-1', amount: 10_000 }])
  })

  it('회비 표 시작 달과 카드 숨김은 그 장부 값 그대로다', () => {
    const merged = mergeImportedYears(appBook(), imported(), [2024, 2027], ids())

    expect(merged.dues).toEqual({ startMonth: '2025-01', hideUnassigned: true })
  })

  it('회비 표 시작 달이 없는 장부(명단을 넣기 전)는 마지막으로 넣은 해의 1월이 된다', () => {
    const merged = mergeImportedYears(appBook({ members: undefined, dues: undefined }), imported(), [2024, 2025], ids())

    expect(merged.dues).toEqual({ startMonth: '2025-01' })
    expect(merged.members?.map((item) => item.name)).toEqual(['김도윤', '이서준'])
  })

  it('새 회원의 시작할 때 남은 돈(엑셀 미수합계)은 회비 표 시작 달이 엑셀과 같을 때만 넣는다 (다른 달 앞까지의 셈이라)', () => {
    const differ = mergeImportedYears(appBook(), imported(), [2024], ids())
    expect(differ.members?.find((item) => item.name === '이서준')?.opening).toBeUndefined()

    const same = mergeImportedYears(appBook({ dues: { startMonth: '2027-01' } }), imported(), [2024], ids())
    expect(same.members?.find((item) => item.name === '이서준')?.opening).toBe(-20_000)
  })

  it('AC-31 넣은 결과는 저장 형식 검사(v4)를 통과한다', () => {
    const merged = mergeImportedYears(appBook(), imported(), [2024, 2025, 2027], ids())

    expect(isStoredData({ schemaVersion: CURRENT_SCHEMA_VERSION, books: [merged], settings: {} })).toBe(true)
  })
})

describe('SPEC-010 엑셀로 기존 장부에 넣기 — 확인 창 (8절 "다른 장부에 넣기", #169)', () => {
  it('바꾸는 해와 그 해 앱 기록 수, 기록 0건인 해, 합칠 이름과 새로 넣는 이름(가나다), 넣는 엑셀 기록 수, 이어지지 않는 이월금을 알려 준다', () => {
    expect(mergePlan(appBook(), imported(), [2024, 2025, 2027])).toEqual({
      replaced: [{ year: 2025, excelCount: 2, appCount: 2 }],
      emptyYears: [2027],
      mergedNames: ['김도윤'],
      addedNames: ['이서준'],
      entryCount: 5,
      carryoverGaps: [
        { year: 2026, carryover: 62_000, carryoverFrom: 'app', previousBalance: 96_000 },
        { year: 2027, carryover: 96_000, carryoverFrom: 'excel', previousBalance: 82_000 },
      ],
    })
    expect(mergePlan(appBook({ members: [] }), imported(), [2024])).toEqual({
      replaced: [],
      emptyYears: [],
      mergedNames: [],
      addedNames: ['김도윤', '이서준'],
      entryCount: 2,
      carryoverGaps: [{ year: 2025, carryover: 50_000, carryoverFrom: 'app', previousBalance: 51_000 }],
    })
  })

  it('#193 장부만 있고 기록이 0건인 해를 고르면 그 해를 알린다 (이월금·월 회비·쉬는 달도 엑셀 값이 되므로). 장부가 없는 해·고르지 않은 해는 아니다', () => {
    expect(mergePlan(appBook(), imported(), [2024, 2027]).emptyYears).toEqual([2027])
    expect(mergePlan(appBook(), imported(), [2024]).emptyYears).toEqual([])
  })
})

// 끝 잔액 = 이월금 + 수입 − 지출. 앱: 2025년 50,000 + 20,000 − 8,000 = 62,000, 2026년 62,000 + 20,000 = 82,000, 2027년 이월금 0(기록 0건).
// 엑셀: 2024년 30,000 + 21,000 = 51,000, 2025년 51,000 + 45,000 = 96,000, 2027년 이월금 96,000
describe('SPEC-010 엑셀로 기존 장부에 넣기 — 이월금 이어짐 (8절 "다른 장부에 넣기", #193)', () => {
  it('AC-42 넣는 해의 다음 해를 넣지 않으면 넣은 엑셀 끝 잔액과 앱 다음 해 이월금이 다를 때 알린다 (지난 해만 넣는 경우)', () => {
    expect(mergePlan(appBook(), imported(), [2025]).carryoverGaps).toEqual([
      { year: 2026, carryover: 62_000, carryoverFrom: 'app', previousBalance: 96_000 },
    ])
  })

  it('AC-42 넣는 해의 앞 해를 넣지 않으면 앱 앞 해 끝 잔액과 넣은 엑셀 이월금이 다를 때 알린다', () => {
    expect(mergePlan(appBook(), imported(), [2027]).carryoverGaps).toEqual([
      { year: 2027, carryover: 96_000, carryoverFrom: 'excel', previousBalance: 82_000 },
    ])
  })

  it('AC-42 앞 해 끝 잔액과 뒤 해 이월금이 같으면 알리지 않는다', () => {
    const book = appBook()
    book.ledgers['2026'] = { ...book.ledgers['2026'], carryover: 96_000 }

    expect(mergePlan(book, imported(), [2025]).carryoverGaps).toEqual([])
  })

  it('맞닿은 해가 장부에 없으면 비교하지 않는다 (2025년만 있는 장부에 2025년을 넣음)', () => {
    const book = appBook()
    const only2025 = { ...book, ledgers: { '2025': book.ledgers['2025'] } }

    expect(mergePlan(only2025, imported(), [2025]).carryoverGaps).toEqual([])
  })

  it('맞닿은 해도 넣으면 비교하지 않는다 — 넣은 뒤 장부 기준이라 엑셀끼리는 보지 않는다', () => {
    // 2024년만 넣으면 앱 2025년 이월금(50,000)이 엑셀 2024년 끝 잔액(51,000)과 다르지만, 2025년도 넣으면 엑셀 2025년 이월금끼리라 그 곳은 없다
    expect(mergePlan(appBook(), imported(), [2024, 2025]).carryoverGaps).toEqual([
      { year: 2026, carryover: 62_000, carryoverFrom: 'app', previousBalance: 96_000 },
    ])
  })

  it('연이은 두 해를 다 넣으면 엑셀끼리 달라도 알리지 않는다 (엑셀 안에서 다른 것은 읽은 내용 확인 화면 검산이 알린다)', () => {
    const excel = imported()
    // 엑셀 2025년 이월금 50,500 ≠ 엑셀 2024년 끝 잔액 51,000. 2025년 끝 잔액은 50,500 + 45,000 = 95,500
    excel.ledgers['2025'] = { ...excel.ledgers['2025'], carryover: 50_500 }

    expect(mergePlan(appBook(), excel, [2024, 2025]).carryoverGaps).toEqual([
      { year: 2026, carryover: 62_000, carryoverFrom: 'app', previousBalance: 95_500 },
    ])
  })

  it('넣는 해가 이어지지 않아도 넣는 해마다 같은 규칙으로 보고, 해 순으로 알린다', () => {
    expect(mergePlan(appBook(), imported(), [2027, 2025]).carryoverGaps).toEqual([
      { year: 2026, carryover: 62_000, carryoverFrom: 'app', previousBalance: 96_000 },
      { year: 2027, carryover: 96_000, carryoverFrom: 'excel', previousBalance: 82_000 },
    ])
  })

  it('AC-42 이어지지 않아도 넣은 장부의 이월금은 바꾸지 않는다 (알려 주기만)', () => {
    const merged = mergeImportedYears(appBook(), imported(), [2025], ids())

    expect(merged.ledgers['2026'].carryover).toBe(62_000)
  })
})
