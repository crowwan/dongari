import { useState } from 'react'
import { ChoiceChip } from '../../ui/ChoiceChip'
import type { FieldLabelRole } from '../../ui/fieldLabel'
import { MoneyInput } from '../../ui/MoneyInput'
import './ledger.css'

type CarryoverFieldProps = {
  // 이월금 (적자면 음수)
  value: number
  onChange: (value: number) => void
  // 금액 칸 이름 글자 역할. 시작 화면은 질문 제목 급(기본), 설정 카드 안은 보조 이름(label)
  labelRole?: FieldLabelRole
}

// 작년 이월금 입력. 빼기표를 치는 대신 금액은 양수로 적고 "남았어요 / 적자였어요"를 고른다
// (큰 글씨 사용자가 숫자 키패드에서 '-' 를 찾지 않아도 되게, SPEC-001 첫 실행)
export function CarryoverField({ value, onChange, labelRole }: CarryoverFieldProps) {
  // 금액이 0 일 때도 고른 쪽을 기억해야 해서 부호를 따로 든다
  const [deficit, setDeficit] = useState(value < 0)
  const amount = Math.abs(value)

  function choose(nextDeficit: boolean) {
    setDeficit(nextDeficit)
    onChange(nextDeficit ? -amount : amount)
  }

  return (
    <div className="carryover" data-testid="carryover-field" data-state={deficit ? 'deficit' : 'surplus'}>
      <MoneyInput label="작년 이월금" labelRole={labelRole} value={amount} onChange={(next) => onChange(deficit ? -next : next)} />
      <div className="carryover__choices" role="group" aria-label="작년 장부가 남았나요, 적자였나요?">
        <ChoiceChip selected={!deficit} onClick={() => choose(false)}>
          남았어요
        </ChoiceChip>
        <ChoiceChip selected={deficit} onClick={() => choose(true)}>
          적자였어요
        </ChoiceChip>
      </div>
    </div>
  )
}
