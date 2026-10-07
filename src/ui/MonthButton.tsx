import { Icon } from './Icon'
import './ui.css'

type MonthButtonProps = {
  // 지금 달 (1~12)
  month: number
  // 열두 달 선택 창 열기
  onClick: () => void
}

// 질문 제목 옆 달 버튼 [10월 ▾] (SPEC-001 "며칠인가요?"): 흰 면 + 달 글자 + ▾. 화면 읽기는 "10월 달 바꾸기"
export function MonthButton({ month, onClick }: MonthButtonProps) {
  return (
    <button type="button" className="ui-month-button" data-testid="month-button" aria-haspopup="dialog" onClick={onClick}>
      {month}월{/* 달과 띄어 읽히게 ("10월 달 바꾸기") */} <span className="ui-visually-hidden">달 바꾸기</span>
      <Icon name="down" />
    </button>
  )
}
