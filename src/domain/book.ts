// 장부(Book) 고르기와 종류별 문구 (SPEC-005). 장부마다 연도별 기록이 따로다
import { calculateTotals } from './ledger'
import type { Book, BookKind, StoredData } from './types'

// 장부 종류 이름: 새 장부 만들기·설정의 고르기 칸 / 장부 고르기 창 줄의 작은 글자
export const BOOK_KIND_LABELS: Readonly<Record<BookKind, string>> = { club: '동아리·모임', household: '개인 가계부' }
export const BOOK_KIND_SHORT_LABELS: Readonly<Record<BookKind, string>> = { club: '동아리', household: '가계부' }

// 지금 장부: 마지막에 본 장부(settings.lastBookId), 없거나 지워졌으면 첫 장부(만든 순). 장부가 없으면 undefined (첫 실행)
export function currentBook(data: StoredData): Book | undefined {
  return data.books.find((book) => book.id === data.settings.lastBookId) ?? data.books[0]
}

// 장부 고르기 창에 보이는 잔액 (AC-3): 그 장부의 올해 장부, 없으면 마지막 연도 장부의 잔액. 연도별 장부가 없으면 undefined
export function bookBalance(book: Book, thisYear: number): number | undefined {
  const latest = Object.values(book.ledgers).sort((a, b) => b.year - a.year)[0]
  const shown = book.ledgers[String(thisYear)] ?? latest
  return shown && calculateTotals(shown).balance
}

// 그 장부의 첫 해인가: 앞선 연도 장부가 없다 (가계부 이월금 이름이 "지금 남은 돈" 인 해)
export function isFirstYear(book: Book | undefined, year: number): boolean {
  return !Object.values(book?.ledgers ?? {}).some((ledger) => ledger.year < year)
}

// 이월금을 부르는 말 (SPEC-005 종류별 차이). 적자면 금액 앞에 deficit 을 쓰고 빼기표는 쓰지 않는다
export interface CarryoverWords {
  label: string // 입력칸·설정 줄 이름 ("작년 이월금")
  surplus: string // 잔액 카드 보조 줄 "… N원 포함" 앞말 ("작년 이월")
  opening: string // 월 정리 1월의 전달까지 잔액 줄 ("작년 이월금")
  deficit: string // 적자일 때 잔액 카드·월 정리 ("작년 적자")
  sheet: string // 올해 결산표 위쪽 오른쪽 ("이월금 ₩ …", v1 양식)
}

const CLUB_WORDS: CarryoverWords = {
  label: '작년 이월금',
  surplus: '작년 이월',
  opening: '작년 이월금',
  deficit: '작년 적자',
  sheet: '이월금',
}

// 가계부 첫 해: 장부를 만들 때 "지금 남은 돈" 으로 적고, 그 뒤 화면에서는 처음에 있던 돈이라 "처음 남은 돈"
const HOUSEHOLD_FIRST_WORDS: CarryoverWords = {
  label: '지금 남은 돈',
  surplus: '처음 남은 돈',
  opening: '처음 남은 돈',
  deficit: '처음 적자',
  sheet: '처음 남은 돈',
}

const HOUSEHOLD_NEXT_WORDS: CarryoverWords = {
  label: '작년에서 넘어온 돈',
  surplus: '작년에서 넘어온 돈',
  opening: '작년에서 넘어온 돈',
  deficit: '작년 적자',
  sheet: '넘어온 돈',
}

export function carryoverWords(kind: BookKind, firstYear: boolean): CarryoverWords {
  if (kind === 'club') return CLUB_WORDS
  return firstYear ? HOUSEHOLD_FIRST_WORDS : HOUSEHOLD_NEXT_WORDS
}
