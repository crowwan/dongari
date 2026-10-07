import { useId } from 'react'
import { Icon, type IconName } from './Icon'
import './ui.css'

export type AnswersCardRow = {
  // 작은 이름표 (예: "달", "항목"). [바꾸기] 의 화면 읽기 이름에도 붙는다 ("달 바꾸기")
  label: string
  icon: IconName
  // 적은 값 (예: "10월", "대관료 · 지출")
  value: string
  // [바꾸기]: 그 값 고치기
  onChange: () => void
}

// 하나씩 채우기에서 이미 적은 것 (SPEC-001 기록 입력, AC-16): 옅은 청록 "✓ 적은 내용" 카드 안에
// 줄마다 흰 면 — ✓ 동그라미 + 작은 이름표 + 굵은 값 + [바꾸기]. 지금 질문(흰 목록·금액 칸)과 면 색으로 갈린다
export function AnswersCard({ rows }: { rows: AnswersCardRow[] }) {
  const titleId = useId()
  return (
    <section className="ui-answers" data-testid="answers-card" aria-labelledby={titleId}>
      {/* 질문 제목(h2)과 겹치지 않게 제목 요소 대신 카드 이름으로만 읽힌다 */}
      <p className="ui-answers__title" id={titleId}>
        <Icon name="check" />
        적은 내용
      </p>
      <ul className="ui-answers__list">
        {rows.map(({ label, icon, value, onChange }) => (
          <li key={label} className="ui-answers__row" data-testid="answers-card-row">
            <span className="ui-answers__done" aria-hidden="true">
              <Icon name="check" />
            </span>
            <span className="ui-answers__text">
              <span className="ui-answers__label" data-testid="answers-card-label">
                {label}
              </span>{' '}
              <span className="ui-answers__value" data-testid="answers-card-value">
                <Icon name={icon} />
                {value}
              </span>
            </span>
            <button type="button" className="ui-answers__change" onClick={onChange}>
              {/* 눈에는 "바꾸기", 화면 읽기에는 무엇을 바꾸는지까지 ("달 바꾸기") */}
              <span className="ui-visually-hidden">{label}</span> 바꾸기
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
