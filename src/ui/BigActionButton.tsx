import './ui.css'

type MoneyKind = 'income' | 'expense'

// 색만으로 구분하지 않도록 부호와 글자를 함께 쓴다
const LABELS: Record<MoneyKind, string> = {
  income: '+ 돈 들어옴',
  expense: '− 돈 나감',
}

type BigActionButtonProps = {
  kind: MoneyKind
  // 보조 설명 줄 (예: "회비, 지원금")
  description: string
  disabled?: boolean
  onClick?: () => void
}

// 장부 첫 화면의 큰 버튼: 돈 들어옴(파랑) / 돈 나감(빨강)
export function BigActionButton({ kind, description, disabled, onClick }: BigActionButtonProps) {
  return (
    <button
      type="button"
      className="ui-big-action"
      data-kind={kind}
      data-testid="big-action-button"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="ui-big-action__label">{LABELS[kind]}</span>
      <span className="ui-big-action__description">{description}</span>
    </button>
  )
}
