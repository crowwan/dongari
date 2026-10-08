// 장부(Book) 고르기 (SPEC-005). 장부마다 연도별 기록이 따로다
import type { Book, StoredData } from './types'

// 지금 장부: 마지막에 본 장부(settings.lastBookId), 없거나 지워졌으면 첫 장부(만든 순). 장부가 없으면 undefined (첫 실행)
export function currentBook(data: StoredData): Book | undefined {
  return data.books.find((book) => book.id === data.settings.lastBookId) ?? data.books[0]
}
