import { useId, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './ui.css'

export type EntryCardRow = {
  // 작은 이름표 (예: "달", "항목"). [바꾸기] 의 화면 읽기 이름에도 붙는다 ("달 바꾸기")
  label: string
  icon: IconName
  // 답한 값 (예: "10월", "대관료 · 지출")
  value: string
  // [바꾸기]: 그 값 고치기
  onChange: () => void
}

type EntryCardProps = {
  rows: EntryCardRow[]
  // 지금 질문 (제목 + 답 칸). 카드 안 맨 아래 옅은 면 칸에 펼쳐진다
  children: ReactNode
}

// 하나씩 채우기에서 지금 적는 내역 하나 (SPEC-001 기록 입력, AC-16·23): 흰 면 + 청록 둘레 카드 "지금 적는 내역" 안에
// 답한 줄(작은 이름표 + 굵은 값 + [바꾸기], 줄 사이 가는 선) → 맨 아래 옅은 면에 지금 질문. ✓ 는 "장부에 들어감" 에만 써서 여기엔 없다
export function EntryCard({ rows, children }: EntryCardProps) {
  const titleId = useId()
  return (
    <section className="ui-entry-card" data-testid="entry-card" aria-labelledby={titleId}>
      {/* 질문 제목(h2)과 겹치지 않게 제목 요소 대신 카드 이름으로만 읽힌다 */}
      <p className="ui-entry-card__title" id={titleId}>
        지금 적는 내역
      </p>
      <ul className="ui-entry-card__list">
        {rows.map(({ label, icon, value, onChange }) => (
          <li key={label} className="ui-entry-card__row" data-testid="entry-card-row">
            <span className="ui-entry-card__label" data-testid="entry-card-label">
              {label}
            </span>{' '}
            <span className="ui-entry-card__value" data-testid="entry-card-value">
              <Icon name={icon} />
              {value}
            </span>
            <button type="button" className="ui-entry-card__change" onClick={onChange}>
              {/* 눈에는 "바꾸기", 화면 읽기에는 무엇을 바꾸는지까지 ("달 바꾸기") */}
              <span className="ui-visually-hidden">{label}</span> 바꾸기
            </button>
          </li>
        ))}
      </ul>
      <div className="ui-entry-card__question" data-testid="entry-card-question">
        {children}
      </div>
    </section>
  )
}
