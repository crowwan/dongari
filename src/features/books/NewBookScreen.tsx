import { useId, useState } from 'react'
import { BOOK_KIND_LABELS, carryoverWords } from '../../domain/book'
import type { BookSetup } from '../../domain/ledger'
import type { BookKind } from '../../domain/types'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { SegmentedControl, type SegmentOptions } from '../../ui/SegmentedControl'
import { TextField } from '../../ui/TextField'
import { BackToLedger } from '../BackToLedger'
import { CarryoverField } from '../ledger/CarryoverField'
import { bookKindIcon } from './bookKindIcon'
import './books.css'

const KIND_QUESTION = '어떤 장부인가요?'

const KIND_OPTIONS: SegmentOptions<BookKind> = [
  { value: 'club', label: BOOK_KIND_LABELS.club, icon: bookKindIcon('club') },
  { value: 'household', label: BOOK_KIND_LABELS.household, icon: bookKindIcon('household') },
]

// 이름 칸이 비어 있을 때 예시 글자 (종류를 고른 뒤에만)
const NAME_EXAMPLES: Readonly<Record<BookKind, string>> = { club: '예: 한랑드림', household: '예: 우리집 가계부' }

type NewBookScreenProps = {
  onCreate: (setup: BookSetup) => void
  // 장부 고르기 창에서 왔으면 [‹ 장부로]. 첫 실행(장부 없음)에는 돌아갈 장부가 없어 없다
  onBack?: () => void
}

// [만들기] 를 누를 수 없는 이유 (위쪽 질문부터 하나)
function missingReason(kind: BookKind | null, name: string): string | undefined {
  if (kind === null) return '어떤 장부인지 골라 주세요'
  if (name.trim() === '') return '장부 이름을 적어 주세요'
  return undefined
}

// 새 장부 만들기 (SPEC-005): 종류 → 장부 이름 → 이월금(동아리 "작년 이월금" / 가계부 "지금 남은 돈") → 아래 고정 [만들기].
// 첫 실행에도 이 화면이 뜬다 (위쪽 [백업 불러오기] 는 App 이 둔다)
export function NewBookScreen({ onCreate, onBack }: NewBookScreenProps) {
  const [kind, setKind] = useState<BookKind | null>(null)
  const [name, setName] = useState('')
  const [carryover, setCarryover] = useState(0)
  const kindQuestionId = useId()
  const reason = missingReason(kind, name)
  // 새 장부는 그 장부의 첫 해다. 종류를 고르기 전에는 동아리 말로 둔다
  const words = carryoverWords(kind ?? 'club', true)

  return (
    <div className="screen screen--groups books-new" data-testid="new-book-screen">
      {onBack ? (
        <div className="books-new__head">
          <BackToLedger onBack={onBack} />
          <h1 className="screen__title">새 장부 만들기</h1>
        </div>
      ) : (
        <h1 className="screen__title books-new__first-title">새 장부 만들기</h1>
      )}

      <section className="books-new__question" aria-labelledby={kindQuestionId}>
        <h2 className="books-new__heading" id={kindQuestionId}>
          {KIND_QUESTION}
        </h2>
        <SegmentedControl label={KIND_QUESTION} options={KIND_OPTIONS} value={kind} onChange={setKind} />
        <p className="screen__note">처음 보여 줄 항목만 달라요</p>
      </section>

      <TextField label="장부 이름" value={name} placeholder={kind ? NAME_EXAMPLES[kind] : undefined} onChange={setName} />

      {/* 이월금 칸과 그 안내는 한 묶음 */}
      <div className="books-new__question">
        <CarryoverField label={words.label} value={carryover} onChange={setCarryover} />
        <p className="screen__note">모르면 0으로 두고 나중에 설정에서 바꿀 수 있어요.</p>
      </div>

      <BottomActionBar
        label="만들기"
        icon="check"
        disabled={reason !== undefined}
        note={reason}
        onClick={() => {
          if (kind !== null && reason === undefined) onCreate({ kind, name, carryover })
        }}
      />
    </div>
  )
}
