import { formatAmount } from './money'
import './ui.css'

type BalanceCardProps = {
  // 숫자 위 이름 (예: "지금 잔액")
  label: string
  // 원 단위 잔액. 적자면 음수
  amount: number
  // 숫자 아래 보조 줄 (예: "작년 이월금 370,482원 포함")
  note?: string
}

// 첫 화면 맨 위 잔액 카드: 이름 → 가장 큰 숫자("원"은 작게) → 보조 줄
export function BalanceCard({ label, amount, note }: BalanceCardProps) {
  return (
    <section className="ui-balance" data-testid="balance-card">
      <p className="ui-balance__label">{label}</p>
      <p className="ui-balance__amount" data-testid="balance-card-amount">
        {formatAmount(amount)}
        <span className="ui-unit">원</span>
      </p>
      {note && (
        <p className="ui-balance__note" data-testid="balance-card-note">
          {note}
        </p>
      )}
    </section>
  )
}
