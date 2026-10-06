import { useId, useState } from 'react'
import type { EntryInput, FrequentChoice } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { ChoiceChip } from '../../ui/ChoiceChip'
import { MoneyInput } from '../../ui/MoneyInput'
import { TextField } from '../../ui/TextField'
import { BackToLedger } from '../BackToLedger'
import { checkDraft, type EntryDraft } from './entryDraft'
import './entry.css'

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

const TYPE_LABELS: Readonly<Record<EntryType, string>> = { income: '수입', expense: '지출' }
const TYPES: readonly EntryType[] = ['income', 'expense']

type EntryFormProps = {
  // 화면 제목 ("내역 적기", 고치기 화면은 "내역 고치기")
  title: string
  // 처음 값. 새 기록은 emptyDraft(보던 달), 고치기는 그 기록 값
  initial: EntryDraft
  // 자주 쓴 항목 버튼 목록. 종류를 고르기 전(type 없음)엔 두 종류를 섞어서
  frequentChoices: (type?: EntryType) => FrequentChoice[]
  onSave: (input: EntryInput) => void
  onBack: () => void
}

// 기록 입력 (SPEC-001): 위에서 아래로 몇 월 → 수입/지출 → 무엇 → 얼마, 아래 고정 [저장]
// 값은 이 폼이 들고, 바깥에는 처음 값(initial)과 저장할 기록(onSave)만 오간다 — 고치기 화면(#14)이 같은 폼을 쓴다
export function EntryForm({ title, initial, frequentChoices, onSave, onBack }: EntryFormProps) {
  const [draft, setDraft] = useState(initial)
  const monthHeadingId = useId()
  const typeHeadingId = useId()
  const nameHeadingId = useId()
  const check = checkDraft(draft)

  function change(next: Partial<EntryDraft>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  return (
    <div className="screen entry" data-testid="entry-form">
      <BackToLedger onBack={onBack} />
      <h1 className="screen__title">{title}</h1>

      <section className="entry__part" aria-labelledby={monthHeadingId}>
        <h2 className="entry__question" id={monthHeadingId}>
          몇 월인가요?
        </h2>
        <div className="entry__months" role="group" aria-labelledby={monthHeadingId}>
          {MONTHS.map((month) => (
            <ChoiceChip key={month} selected={draft.month === month} onClick={() => change({ month })}>
              {month}월
            </ChoiceChip>
          ))}
        </div>
      </section>

      <section className="entry__part" aria-labelledby={typeHeadingId}>
        <h2 className="entry__question" id={typeHeadingId}>
          수입인가요, 지출인가요?
        </h2>
        <div className="entry__types" role="group" aria-labelledby={typeHeadingId} data-testid="entry-type">
          {TYPES.map((type) => (
            <ChoiceChip key={type} selected={draft.type === type} onClick={() => change({ type })}>
              {TYPE_LABELS[type]}
            </ChoiceChip>
          ))}
        </div>
      </section>

      <section className="entry__part" aria-labelledby={nameHeadingId}>
        <h2 className="entry__question" id={nameHeadingId}>
          무엇인가요?
        </h2>
        <div className="entry__choices" role="group" aria-label="자주 쓴 항목">
          {frequentChoices(draft.type).map((choice) => (
            <ChoiceChip
              key={choice.name}
              selected={draft.name.trim() === choice.name}
              // 이름과 함께 그 항목을 마지막으로 쓴 종류를 고른다 (AC-4)
              onClick={() => change({ name: choice.name, type: choice.type })}
            >
              {choice.name}
            </ChoiceChip>
          ))}
        </div>
        <TextField label="직접 적기" value={draft.name} placeholder="예: 꽃값" onChange={(name) => change({ name })} />
      </section>

      <MoneyInput label="얼마인가요?" value={draft.amount} onChange={(amount) => change({ amount })} />

      <BottomActionBar
        label="저장"
        disabled={!check.ok}
        note={check.ok ? undefined : check.missing}
        onClick={() => {
          if (check.ok) onSave(check.input)
        }}
      />
    </div>
  )
}
