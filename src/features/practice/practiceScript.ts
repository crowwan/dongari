// 연습 장부 예시 값 (SPEC-008 "가계부 예시"). 장부 종류별로 한 곳에 둔다
import type { BookKind, StoredData } from '../../domain/types'

export const PRACTICE_BOOK_NAME = '연습 장부'

type PracticeLine = { name: string; amount: number }

// 수입 한 줄을 적고, 지출 한 줄을 적었다가 ③ 에서 지운다. 지출을 지워도 결산에 남을 줄(수입)이 있어야 ④ 보내기를 눌러 본다
export type PracticeExample = { income: PracticeLine; expense: PracticeLine }

// 기본 항목(SPEC-005)에 있는 이름이라 "무엇인가요?" 목록에 처음부터 보인다
export const PRACTICE_EXAMPLES: Readonly<Record<BookKind, PracticeExample>> = {
  club: { income: { name: '회비', amount: 10_000 }, expense: { name: '간식비', amount: 5_000 } },
  household: { income: { name: '용돈', amount: 10_000 }, expense: { name: '장보기', amount: 5_000 } },
}

// 연습 장부 하나만 든 데이터: 이름 "연습 장부", 그 종류, 올해, 이월금 0원, 기록 없음. 메모리에만 둔다
export function practiceData(kind: BookKind, now: Date): StoredData {
  const year = now.getFullYear()
  const createdAt = now.toISOString()
  return {
    schemaVersion: 3,
    books: [{ id: 'practice', name: PRACTICE_BOOK_NAME, kind, createdAt, ledgers: { [String(year)]: { year, carryover: 0, entries: [] } } }],
    // 기록 파일을 막 보낸 것으로 두어 30일 안내가 생길 일이 없다 (연습 화면에서는 어차피 그리지 않는다)
    settings: { lastBookId: 'practice', lastBackupAt: createdAt },
  }
}
