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
  // 줄 맨 끝 › (누르면 고칠 수 있다는 표시, 모양만이라 화면 읽기 이름에는 없다)
  chevron?: boolean
  // 보조 줄 아래 노란 알약 (예: "저장 안 됨", SPEC-002 v2.6). 화면 읽기 이름에는 줄 끝에 붙는다
  badge?: string
}

// 목록 한 줄: 원형 아이콘 + 두 줄 글 + 오른쪽 (토스 TDS ListRow 패턴). 장부 내역, 설정 줄.
// 이름과 오른쪽 내용이 한 줄에 안 들어가면 오른쪽 내용이 이름 아래 줄로 내려간다 (금액은 한 덩어리, SPEC-001 v2.6)
export function ListRow({ icon, tone = 'neutral', title, description, end, onClick, chevron = false, badge }: ListRowProps) {
  // 줄(.ui-row)은 폭을 재는 컨테이너, 안쪽(.ui-row__inner)이 배치. 아주 좁으면 안쪽 배치를 바꾼다 (ui.css)
  const content = (
    <span className="ui-row__inner">
      <span className="ui-row__icon">
        <Icon name={icon} />
      </span>
      <span className="ui-row__body">
        <span className="ui-row__text">
          <span className="ui-row__title">{title}</span>
          {/* 줄 버튼 이름이 "회비 수입 +140,000원" 처럼 띄어 읽히게 */}
          {description && <> <span className="ui-row__description">{description}</span></>}
          {/* 알약은 보조 줄 아래에 보이고, 화면 읽기는 금액 뒤(줄 이름 끝)에서 읽는다: "대관료 지출 −40,000원 저장 안 됨" */}
          {badge && (
            <span className="ui-row__badge" data-testid="list-row-badge" aria-hidden="true">
              <Icon name="alert" />
              {badge}
            </span>
          )}
        </span>
        {end !== undefined && <> <span className="ui-row__end">{end}</span></>}
        {badge && <> <span className="ui-visually-hidden">{badge}</span></>}
      </span>
      {chevron && (
        <span className="ui-row__chevron" data-testid="list-row-chevron" aria-hidden="true">
          <Icon name="right" />
        </span>
      )}
    </span>
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
