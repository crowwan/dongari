import { Icon, type IconName } from './Icon'
import './ui.css'

type PickRowProps = {
  icon?: IconName
  // 지금 정해진 값 (예: "10월")
  value: string
  // 오른쪽 글자 (기본 "바꾸기")
  actionLabel?: string
  // 선택 창 열기
  onClick: () => void
}

// 정해진 값 바꾸기: 흰 면 한 줄에 값 + "바꾸기 ›". 열두 칸 같은 격자를 늘 펼쳐 두지 않고 누르면 선택 창을 연다
export function PickRow({ icon, value, actionLabel = '바꾸기', onClick }: PickRowProps) {
  return (
    <button type="button" className="ui-pick" data-testid="pick-row" onClick={onClick}>
      {icon && (
        <span className="ui-pick__icon">
          <Icon name={icon} />
        </span>
      )}
      <span className="ui-pick__value">{value}</span>
      {/* 값과 띄어 읽히게 ("10월 바꾸기") */}{' '}
      <span className="ui-pick__action">
        {actionLabel}
        <Icon name="right" />
      </span>
    </button>
  )
}
