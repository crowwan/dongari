import { useId } from 'react'
import type { EntryType } from '../domain/types'
import { AmountText } from './AmountText'
import { Icon } from './Icon'
import './ui.css'

export type SavedEntry = {
  name: string
  type: EntryType
  amount: number
}

// 최근 줄만 남겨 "지금 적는 내역" 카드가 화면 아래로 밀리지 않게 한다
const RECENT_ROWS = 2

// 연달아 적기에서 이번에 장부에 넣은 내역 (SPEC-001 연달아 적기, AC-20): 면 없는 작은 회색 글자 —
// 머리 ✓ + "장부에 넣었어요 · N건" → 저장한 순서대로 이름 + 부호 붙은 금액, 방금 저장한 마지막 줄은 이름 옆 "방금".
// 최근 2줄만, 머리의 N 은 전체 건수. 줄은 누를 수 없다(고치기는 장부에서)
export function SavedEntries({ entries }: { entries: SavedEntry[] }) {
  const titleId = useId()
  const firstShown = Math.max(entries.length - RECENT_ROWS, 0)
  const lastIndex = entries.length - 1

  return (
    <section className="ui-saved" data-testid="saved-entries" aria-labelledby={titleId}>
      <p className="ui-saved__title" id={titleId}>
        <Icon name="check" />
        장부에 넣었어요 · {entries.length}건
      </p>
      <ul className="ui-saved__list">
        {entries.slice(firstShown).map(({ name, type, amount }, offset) => {
          const index = firstShown + offset
          const latest = index === lastIndex
          return (
            // 저장한 내역은 뒤에 붙기만 하므로 저장 순번이 줄 이름이다
            <li key={index} className="ui-saved__row" data-testid="saved-entries-row" data-state={latest ? 'latest' : 'saved'}>
              <span className="ui-saved__name">
                {name}
                {latest && <> <span className="ui-saved__latest">방금</span></>}
              </span>{' '}
              <AmountText type={type} amount={amount} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
