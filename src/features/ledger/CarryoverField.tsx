import { useState } from 'react'
import type { FieldLabelRole } from '../../ui/fieldLabel'
import { MoneyInput } from '../../ui/MoneyInput'
import { SegmentedControl, type SegmentOptions } from '../../ui/SegmentedControl'
import './ledger.css'

type Balance = 'surplus' | 'deficit'

const BALANCE_OPTIONS: SegmentOptions<Balance> = [
  { value: 'surplus', label: '남았어요' },
  { value: 'deficit', label: '적자였어요' },
]

type CarryoverFieldProps = {
  // 이월금 (적자면 음수)
  value: number
  onChange: (value: number) => void
  // 금액 칸 이름. 장부 종류마다 다르다 (동아리 "작년 이월금", 가계부 첫 해 "지금 남은 돈", SPEC-005)
  label?: string
  // 금액 칸 이름 글자 역할. 시작 화면은 질문 제목 급(기본), 설정 카드 안은 보조 이름(label)
  labelRole?: FieldLabelRole
}

// 이월금 입력. 빼기표를 치는 대신 금액은 양수로 적고 한 몸통 스위치로 "남았어요 / 적자였어요"를 고른다
// (큰 글씨 사용자가 숫자 키패드에서 '-' 를 찾지 않아도 되게, SPEC-001 첫 실행)
export function CarryoverField({ value, onChange, label = '작년 이월금', labelRole }: CarryoverFieldProps) {
  // 금액이 0 일 때도 고른 쪽을 기억해야 해서 부호를 따로 든다
  const [deficit, setDeficit] = useState(value < 0)
  const amount = Math.abs(value)

  function choose(nextDeficit: boolean) {
    setDeficit(nextDeficit)
    onChange(nextDeficit ? -amount : amount)
  }

  return (
    <div className="carryover" data-testid="carryover-field" data-state={deficit ? 'deficit' : 'surplus'}>
      <MoneyInput label={label} labelRole={labelRole} value={amount} onChange={(next) => onChange(deficit ? -next : next)} />
      <SegmentedControl
        label="남았나요, 적자였나요?"
        options={BALANCE_OPTIONS}
        value={deficit ? 'deficit' : 'surplus'}
        onChange={(next) => choose(next === 'deficit')}
      />
    </div>
  )
}
