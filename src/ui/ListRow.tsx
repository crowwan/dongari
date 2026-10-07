import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './ui.css'

type ListRowProps = {
  icon: IconName
  // 수입 줄은 청록 원(아이콘 모양 + 원 색 + 금액 부호로 세 번 구분), 그 밖은 회색 원
  tone?: 'income' | 'neutral'
  // 줄 이름 (예: "대관료")
  title: string
  // 이름 아래 보조 줄 (예: "10월 · 지출")
  description?: string
  // 오른쪽 내용 (예: 금액 AmountText)
  end?: ReactNode
  // 있으면 줄 전체가 버튼 (예: 눌러 고치기)
  onClick?: () => void
}

// 목록 한 줄: 원형 아이콘 + 두 줄 글 + 오른쪽 (토스 TDS ListRow 패턴). 장부 내역, 항목 목록, 설정 줄
export function ListRow({ icon, tone = 'neutral', title, description, end, onClick }: ListRowProps) {
  const content = (
    <>
      <span className="ui-row__icon">
        <Icon name={icon} />
      </span>
      <span className="ui-row__text">
        <span className="ui-row__title">{title}</span>
        {description && <span className="ui-row__description">{description}</span>}
      </span>
      {end !== undefined && <span className="ui-row__end">{end}</span>}
    </>
  )

  if (onClick) {
    return (
      <button type="button" className="ui-row" data-testid="list-row" data-tone={tone} onClick={onClick}>
        {content}
      </button>
    )
  }
  return (
    <div className="ui-row" data-testid="list-row" data-tone={tone}>
      {content}
    </div>
  )
}
