import { useState } from 'react'
import { ENTRY_AMOUNT_MAX, type Payer } from '../../domain/types'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { MoneyInput } from '../../ui/MoneyInput'
import { formatAmount } from '../../ui/money'
import { BackButton } from '../BackToLedger'
import './entry.css'

type PayerSharesPageProps = {
  // 맨 위 [‹ …]: 내역 적기 / 내역 고치기
  backLabel: string
  // 고른 분 (목록 순서)
  members: readonly { id: string; name: string }[]
  // 처음 몫 (payerShares.startingShares: 정한 몫 → 똑같이 나눈 값 → 월 회비 → 빈칸)
  initial: readonly Payer[]
  // [이대로 할게요]: 합계가 기록 금액이 된다
  onDone: (shares: Payer[]) => void
  onBack: () => void
}

// 한 분씩 금액 (SPEC-010 3절): 한 분만 금액이 다를 때(밀린 회비를 한꺼번에 낸 분). 금액이 사람 수로 안 나눠떨어질 때 [저장] 이 여기로 보내고,
// 링크 [한 분만 금액이 달라요] 로도 온다. 내역 적기·고치기 위에 뜨는 칸(방문 기록 한 칸)이라 뒤로 버튼은 이 화면만 닫는다
export function PayerSharesPage({ backLabel, members, initial, onDone, onBack }: PayerSharesPageProps) {
  const [amounts, setAmounts] = useState(() => new Map(initial.map((share) => [share.memberId, share.amount])))
  const shares = members.map((member) => ({ memberId: member.id, amount: amounts.get(member.id) ?? 0 }))
  const total = shares.reduce((sum, share) => sum + share.amount, 0)
  const missing = shares.some((share) => share.amount < 1)
    ? '모든 분 금액을 적어 주세요'
    : total > ENTRY_AMOUNT_MAX
      ? `합계는 ${formatAmount(ENTRY_AMOUNT_MAX)}원까지예요`
      : undefined

  return (
    <div className="screen screen--groups entry" data-testid="payer-shares">
      <div className="entry__page-head">
        <BackButton label={backLabel} onBack={onBack} />
        <h1 className="screen__title">한 분씩 금액</h1>
        <p className="screen__note">달라진 분만 고치면 돼요. 합계가 이 기록의 금액이 돼요.</p>
      </div>
      <div className="entry__shares">
        {members.map((member) => (
          <MoneyInput
            key={member.id}
            label={member.name}
            labelRole="label"
            value={amounts.get(member.id) ?? 0}
            onChange={(amount) => setAmounts((current) => new Map(current).set(member.id, amount))}
          />
        ))}
      </div>
      <p className="entry__shares-total" aria-live="polite">
        {`합계 ${formatAmount(total)}원 (${members.length}명)`}
      </p>
      <BottomActionBar label="이대로 할게요" disabled={missing !== undefined} note={missing} onClick={() => onDone(shares)} />
    </div>
  )
}
