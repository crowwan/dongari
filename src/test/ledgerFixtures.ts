// 여러 테스트가 같이 쓰는 장부 기록 만들기와 v1 예시 데이터
import { CURRENT_SCHEMA_VERSION, type Book, type Entry, type EntryType, type Ledger, type Payer, type StoredData } from '../domain/types'
import type { LedgerRepository } from '../storage/LedgerRepository'

// [월, 종류, 이름, 금액] 목록을 입력 순 기록으로 바꾼다
export type EntrySpec = readonly [month: number, type: EntryType, name: string, amount: number]

export function entries(specs: readonly EntrySpec[]): Entry[] {
  return specs.map(([month, type, name, amount], index) => ({
    id: `e${index + 1}`,
    month,
    type,
    name,
    amount,
    createdAt: `2025-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
  }))
}

export function ledger(specs: readonly EntrySpec[], overrides: Partial<Omit<Ledger, 'entries'>> = {}): Ledger {
  return { year: 2025, carryover: 370_482, entries: entries(specs), ...overrides }
}

// 연도별 장부들을 담은 장부 하나 (기본: 지금 기록을 옮긴 첫 장부 모양 — 동아리·모임 "한랑드림")
export function book(ledgers: readonly Ledger[], overrides: Partial<Omit<Book, 'ledgers'>> = {}): Book {
  return {
    id: 'book-1',
    name: '한랑드림',
    kind: 'club',
    ledgers: Object.fromEntries(ledgers.map((item) => [String(item.year), item])),
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// 장부 하나(book 기본값)에 연도별 장부들을 담은 저장 데이터
export function storedWith(...ledgers: Ledger[]): StoredData {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, books: [book(ledgers)], settings: {} }
}

// 저장 형식 v4 칸이 모두 든 동아리 장부 (SPEC-010 1절): 회원 둘(한 분은 그만둔 달·쉬는 달·시작할 때 덜 낸 돈까지),
// 회비 표 시작 달, 2026년 월 회비, 두 분이 낸 회비 기록 하나와 엑셀에서 불러와 낸 분을 못 나눈 회비 기록 하나
export function duesBook(overrides: Partial<Omit<Book, 'ledgers'>> = {}): Book {
  const paid: Entry = {
    id: 'dues-1',
    month: 3,
    day: 5,
    type: 'income',
    name: '회비',
    amount: 40_000,
    createdAt: '2026-03-05T00:00:00.000Z',
    payers: [
      { memberId: 'm1', amount: 20_000 },
      { memberId: 'm2', amount: 20_000 },
    ],
  }
  const imported: Entry = {
    id: 'dues-2',
    month: 4,
    day: 1,
    type: 'income',
    name: '회비',
    amount: 30_000,
    createdAt: '2026-04-01T00:00:00.000Z',
    sourceText: '4월 -2명: 김도윤(1만원),이서준',
  }
  return book([{ year: 2026, carryover: 0, monthlyFee: 20_000, entries: [paid, imported] }], {
    members: [
      { id: 'm1', name: '김도윤', joined: '2026-01', off: [] },
      { id: 'm2', name: '강민지', joined: '2025-07', left: '2026-12', off: ['2026-02'], opening: -30_000 },
    ],
    dues: { startMonth: '2026-01' },
    ...overrides,
  })
}

// duesBook 하나가 든 v4 저장 데이터. 낸 분을 주면 두 분이 낸 회비 기록(dues-1, 40,000원)의 낸 분만 바꾼다
export function duesData(payers?: Payer[]): StoredData {
  const target = duesBook()
  if (payers) {
    const year = target.ledgers['2026']
    year.entries = year.entries.map((entry) => (entry.id === 'dues-1' ? { ...entry, payers } : entry))
  }
  return { schemaVersion: CURRENT_SCHEMA_VERSION, books: [target], settings: { lastBookId: target.id } }
}

// 타입은 맞지만 v4 가드(SPEC-010 1절)에 어긋나는 낸 분. duesData 에 넣으면 저장 형식 검사에서 깨진 데이터가 된다 (#172)
export const PAYERS_OFF_AMOUNT: Payer[] = [
  { memberId: 'm1', amount: 20_000 },
  { memberId: 'm2', amount: 10_000 },
] // 합 30,000원 ≠ 기록 금액 40,000원
export const PAYERS_OFF_ROSTER: Payer[] = [
  { memberId: 'm1', amount: 20_000 },
  { memberId: 'm9', amount: 20_000 },
] // m9 는 명단에 없다
export const BROKEN_PAYERS: Array<[string, Payer[]]> = [
  ['낸 분 금액 합이 기록 금액과 다름', PAYERS_OFF_AMOUNT],
  ['명단에 없는 회원 번호', PAYERS_OFF_ROSTER],
]

// 저장소에 저장된 첫 장부의 그 해 장부
export function savedLedger(repository: LedgerRepository, year: number): Ledger | undefined {
  return repository.load().data.books[0]?.ledgers[String(year)]
}

// PLANS.md 6장 예시 숫자(수입 1,777,203 / 지출 1,994,780 / 잔액 152,905)를 재현하도록 만든 1년치 기록.
// 6장에 나온 값(1·2·12월 수입, 1·2·12월 지출, 7월 지출 3줄, 수입내역 3줄)은 그대로 쓰고, 나오지 않은 달은 합계가 맞게 채웠다
export const V1_EXAMPLE_YEAR: readonly EntrySpec[] = [
  [1, 'income', '회비(14인)', 100_000],
  [1, 'income', '행사지원금', 40_806],
  [1, 'expense', '대관료', 40_000],
  [1, 'expense', '간식비', 28_340],
  [2, 'income', '회비(14인)', 390_000],
  [2, 'expense', '대관료', 40_000],
  [2, 'expense', '간식비', 31_900],
  [3, 'income', '회비(14인)', 140_000],
  [3, 'expense', '대관료', 40_000],
  [4, 'income', '회비(14인)', 140_000],
  [4, 'expense', '대관료', 40_000],
  [5, 'income', '회비(14인)', 140_000],
  [5, 'income', '행사지원금', 104_244],
  [5, 'expense', '대관료', 40_000],
  [6, 'income', '회비(14인)', 140_000],
  [6, 'income', '예금이자', 2_132],
  [7, 'income', '회비(14인)', 140_000],
  [7, 'expense', '대관료', 40_000],
  [7, 'expense', '간식비(8월)', 38_430],
  [7, 'expense', '간식비(2건)', 58_280],
  [8, 'income', '회비(14인)', 140_000],
  [8, 'expense', '대관료', 40_000],
  [9, 'income', '회비(14인)', 140_000],
  [9, 'expense', '대관료', 40_000],
  [10, 'expense', '대관료', 40_000],
  [10, 'expense', '야유회', 627_230],
  [11, 'expense', '행사비', 400_000],
  [12, 'income', '회비(14인)', 160_000],
  [12, 'income', '예금이자', 21],
  [12, 'expense', '대관료', 40_000],
  [12, 'expense', '송년회', 410_600],
]
