import type { EntryType } from '../domain/types'
import { formatAmount } from './money'
import './ui.css'

// 색만으로 구분하지 않도록 부호를 함께 쓴다. 빼기는 하이픈이 아닌 글자 빼기표
const SIGN: Record<EntryType, string> = { income: '+', expense: '−' }

type AmountTextProps = {
  type: EntryType
  // 양수 금액 (부호는 type 으로 정한다)
  amount: number
}

// 수입/지출 금액 글자: 수입은 차분한 초록 + "+", 지출은 본문색 + "−". 글자 크기는 놓인 자리를 따른다
export function AmountText({ type, amount }: AmountTextProps) {
  return (
    <span className="ui-amount" data-kind={type} data-testid="amount-text">
      {SIGN[type]}
      {formatAmount(amount)}원
    </span>
  )
}
