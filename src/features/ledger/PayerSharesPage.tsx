import { useState } from 'react'
import { ENTRY_AMOUNT_MAX, type Payer } from '../../domain/types'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { MoneyInput } from '../../ui/MoneyInput'
import { formatAmount } from '../../ui/money'
import { BackButton } from '../BackToLedger'
import './entry.css'

type PayerSharesPageProps = {
  // 맨 위 [‹ …]: 내역 적기 / 내역 고치기 / 낸 분 붙이기
  backLabel: string
  // 고른 분 (목록 순서)
  members: readonly { id: string; name: string }[]
  // 처음 몫 (payerShares.startingShares: 정한 몫 → 똑같이 나눈 값 → 월 회비 → 빈칸)
  initial: readonly Payer[]
  // 금액을 바꿀 수 없는 기록의 금액 (낸 분 붙이기, SPEC-010 7절): 합계가 이 금액일 때만 [이대로 할게요]. 없으면 합계가 기록 금액이 된다
  total?: number
  // [이대로 할게요]
  onDone: (shares: Payer[]) => void
  onBack: () => void
}

// 누를 수 없는 이유: 빈칸·0원 → (금액이 정해진 기록이면) 합계가 그 금액이 아님 → 합계 상한
function missingOf(shares: readonly Payer[], sum: number, total: number | undefined): string | undefined {
  if (shares.some((share) => share.amount < 1)) return '모든 분 금액을 적어 주세요'
  if (total !== undefined && sum !== total) return `합계가 ${formatAmount(total)}원이어야 해요`
  if (sum > ENTRY_AMOUNT_MAX) return `합계는 ${formatAmount(ENTRY_AMOUNT_MAX)}원까지예요`
  return undefined
}

// 한 분씩 금액 (SPEC-010 3절): 한 분만 금액이 다를 때(밀린 회비를 한꺼번에 낸 분). 금액이 사람 수로 안 나눠떨어질 때 [저장] 이 여기로 보내고,
// 링크 [한 분만 금액이 달라요] 로도 온다. 내역 적기·고치기 위에 뜨는 칸(방문 기록 한 칸)이라 뒤로 버튼은 이 화면만 닫는다.
// 낸 분 붙이기(7절)는 금액을 바꿀 수 없어 합계가 그 기록 금액이어야 한다(total)
export function PayerSharesPage({ backLabel, members, initial, total, onDone, onBack }: PayerSharesPageProps) {
  const [amounts, setAmounts] = useState(() => new Map(initial.map((share) => [share.memberId, share.amount])))
  const shares = members.map((member) => ({ memberId: member.id, amount: amounts.get(member.id) ?? 0 }))
  const sum = shares.reduce((acc, share) => acc + share.amount, 0)
  const missing = missingOf(shares, sum, total)

  return (
    <div className="screen screen--groups entry" data-testid="payer-shares">
      <div className="entry__page-head">
        <BackButton label={backLabel} onBack={onBack} />
        <h1 className="screen__title">한 분씩 금액</h1>
        <p className="screen__note entry__note">
          {total === undefined
            ? '달라진 분만 고치면 돼요. 합계가 이 기록의 금액이 돼요.'
            : `합계가 이 기록의 금액 ${formatAmount(total)}원이 되게 적어 주세요.`}
        </p>
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
        {`합계 ${formatAmount(sum)}원 (${members.length}명)`}
      </p>
      <BottomActionBar label="이대로 할게요" disabled={missing !== undefined} note={missing} onClick={() => onDone(shares)} />
    </div>
  )
}
