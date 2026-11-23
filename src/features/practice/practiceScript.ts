// 연습 장부 예시 값 (SPEC-008 "가계부 예시", SPEC-010 10절). 장부 종류별로 한 곳에 둔다
import { CURRENT_SCHEMA_VERSION, type Book, type BookKind, type StoredData } from '../../domain/types'

export const PRACTICE_BOOK_NAME = '연습 장부'

type PracticeLine = { name: string; amount: number }

// 동아리 연습 장부의 예시 회원 (SPEC-010 10절). 지어낸 이름, 들어온 달은 이번 해 1월. 연습용 엑셀(practiceExcel)도 같은 분들이다
export const PRACTICE_MEMBERS = [
  { id: 'practice-kim', name: '김예시' },
  { id: 'practice-park', name: '박예시' },
  { id: 'practice-lee', name: '이예시' },
] as const

// 동아리 연습 장부의 월 회비: 회비 예시 금액과 같아 ① 에서 한 분을 고르면 금액이 그대로 채워진다 ([+1만] 없이 [저장])
export const PRACTICE_MONTHLY_FEE = 10_000

// 수입 한 줄을 적고, 지출 한 줄을 적었다가 ③ 에서 지운다. 지출을 지워도 결산에 남을 줄(수입)이 있어야 ④ 보내기를 눌러 본다.
// payer: 회비 예시에서 "누가 냈어요?" 에 고를 분 (동아리만, SPEC-010 10절 ①)
export type PracticeExample = { income: PracticeLine; expense: PracticeLine; payer?: { id: string; name: string } }

// 기본 항목(SPEC-005)에 있는 이름이라 "무엇인가요?" 목록에 처음부터 보인다
export const PRACTICE_EXAMPLES: Readonly<Record<BookKind, PracticeExample>> = {
  club: { income: { name: '회비', amount: 10_000 }, expense: { name: '간식비', amount: 5_000 }, payer: PRACTICE_MEMBERS[0] },
  household: { income: { name: '용돈', amount: 10_000 }, expense: { name: '장보기', amount: 5_000 } },
}

// 연습 ⑥(가계부 ⑤) 에서 파일 고르기 창 대신 읽는 연습용 엑셀의 파일 이름 (확인 화면 "파일이름.xlsx · 시트 …", 장부 이름 칸)
export const PRACTICE_EXCEL_NAMES: Readonly<Record<BookKind, string>> = {
  club: '연습용 동아리 장부.xlsx',
  household: '연습용 가계부.xlsx',
}

// 동아리 연습 장부의 회비 값: 예시 회원 3명, 회비 표 시작 달 이번 해 1월 (SPEC-010 10절)
function clubDues(year: number): Pick<Book, 'members' | 'dues'> {
  const start = `${year}-01`
  return {
    members: PRACTICE_MEMBERS.map(({ id, name }) => ({ id, name, joined: start, off: [] })),
    dues: { startMonth: start },
  }
}

// 연습 장부 하나만 든 데이터: 이름 "연습 장부", 그 종류, 올해, 이월금 0원, 기록 없음. 메모리에만 둔다.
// 동아리면 예시 회원·월 회비·회비 표 시작 달도 넣는다 (SPEC-010 10절)
export function practiceData(kind: BookKind, now: Date): StoredData {
  const year = now.getFullYear()
  const createdAt = now.toISOString()
  const club = kind === 'club'
  const ledger = { year, carryover: 0, entries: [], ...(club ? { monthlyFee: PRACTICE_MONTHLY_FEE } : {}) }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    books: [
      {
        id: 'practice',
        name: PRACTICE_BOOK_NAME,
        kind,
        createdAt,
        ledgers: { [String(year)]: ledger },
        ...(club ? clubDues(year) : {}),
      },
    ],
    // 기록 파일을 막 보낸 것으로 두어 30일 안내가 생길 일이 없다 (연습 화면에서는 어차피 그리지 않는다)
    settings: { lastBookId: 'practice', lastBackupAt: createdAt },
  }
}
