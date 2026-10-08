import { BOOK_KIND_SHORT_LABELS } from '../../domain/book'
import { Icon } from '../../ui/Icon'
import { formatAmount } from '../../ui/money'
import type { BookChoice } from '../ledger/useLedger'
import { bookKindIcon } from './bookKindIcon'
import './books.css'

type BookPickerProps = {
  books: readonly BookChoice[] // 만든 순
  currentId: string // 지금 보고 있는 장부
  onPick: (id: string) => void
  onNew: () => void
}

// 줄 아래 작은 글자: "동아리 · 잔액 537,142원". 잔액을 모르면(연도별 장부 없음) 종류만
function choiceNote({ kind, balance }: BookChoice): string {
  const kindLabel = BOOK_KIND_SHORT_LABELS[kind]
  return balance === undefined ? kindLabel : `${kindLabel} · 잔액 ${formatAmount(balance)}원`
}

// 장부 고르기 창 "어느 장부를 볼까요?" 안 (SPEC-005 A): 장부마다 한 줄(종류 아이콘 + 이름 + 종류·잔액), 지금 장부는 청록 둘레 + ✓,
// 맨 아래 점선 [+ 새 장부 만들기]. 창은 장부 화면이 연다 (BottomSheet, 뒤로 버튼은 창만 닫는다)
export function BookPicker({ books, currentId, onPick, onNew }: BookPickerProps) {
  return (
    <>
      <div className="books__list" role="group" aria-label="장부" data-testid="book-picker">
        {books.map((book) => {
          const current = book.id === currentId
          return (
            <button
              key={book.id}
              type="button"
              className="books__choice"
              aria-pressed={current}
              onClick={() => onPick(book.id)}
            >
              <span className="books__icon">
                <Icon name={bookKindIcon(book.kind)} />
              </span>
              <span className="books__text">
                <span className="books__name">{book.name}</span>
                <span className="books__note">{choiceNote(book)}</span>
              </span>
              {current && <Icon name="check" />}
            </button>
          )
        })}
      </div>
      <button type="button" className="books__new" onClick={onNew}>
        <Icon name="plus" />
        새 장부 만들기
      </button>
    </>
  )
}
