import { useId } from 'react'
import type { UnassignedDues } from '../../domain/duesTable'
import { IconButton } from '../../ui/IconButton'
import { formatAmount } from '../../ui/money'
import './dues.css'

type UnassignedDuesCardProps = {
  unassigned: UnassignedDues // 낸 분을 안 적은 회비 (시작 달 이후, 하나 이상)
  onAssign: () => void // [낸 분 붙이기] → 붙이기 화면
  onHide: () => void // [이 카드 숨기기]
}

// 회비 표 요약 아래 "알아 둘 것" 카드 (SPEC-010 7절, 시안 G1): 제목 "낸 분을 안 적은 회비 N건 · M원" / 설명 / [👥 낸 분 붙이기] / 글자 버튼 [이 카드 숨기기].
// 색은 --info-bg/--info-ink (덜 낸 분 알약과 같은 "알아 둘 것"). 노랑(저장 안 됨)·빨강(위험)이 아니다
export function UnassignedDuesCard({ unassigned, onAssign, onHide }: UnassignedDuesCardProps) {
  const titleId = useId()
  return (
    <section className="dues-unassigned" aria-labelledby={titleId}>
      <h2 className="dues-unassigned__title" id={titleId}>
        낸 분을 안 적은 회비 {unassigned.items.length}건 · {formatAmount(unassigned.total)}원
      </h2>
      <p className="dues-unassigned__text">낸 분을 붙이면 회비 표에 들어가요. 안 붙여도 잔액과 결산은 맞아요.</p>
      <div className="dues-unassigned__assign">
        <IconButton icon="users" variant="surface" onClick={onAssign}>
          낸 분 붙이기
        </IconButton>
      </div>
      <button type="button" className="dues-unassigned__hide" onClick={onHide}>
        이 카드 숨기기
      </button>
    </section>
  )
}
