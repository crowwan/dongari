// 여러 테스트가 같이 쓰는 장부 기록 만들기와 v1 예시 데이터
import type { Entry, EntryType, Ledger } from '../domain/types'

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
  return { year: 2025, clubName: '한랑드림', carryover: 370_482, entries: entries(specs), ...overrides }
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
