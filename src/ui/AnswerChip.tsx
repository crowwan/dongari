import { Icon, type IconName } from './Icon'
import './ui.css'

type AnswerChipProps = {
  icon?: IconName
  // 답한 값 (예: "10월", "대관료")
  children: string
  // 그 값 고치기
  onClick: () => void
}

// 하나씩 채우기에서 답한 것: 화면 위쪽에 알약으로 쌓이고, 누르면 그 질문으로 돌아가 고친다 (SPEC-001 AC-16)
export function AnswerChip({ icon, children, onClick }: AnswerChipProps) {
  return (
    <button type="button" className="ui-answer" data-testid="answer-chip" onClick={onClick}>
      {icon && <Icon name={icon} />}
      {children}
      {/* 눈에는 값만, 화면 읽기에는 할 수 있는 일까지 ("대관료 고치기") */}{' '}
      <span className="ui-visually-hidden">고치기</span>
    </button>
  )
}
