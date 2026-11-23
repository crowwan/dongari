import type { PayerChoices } from '../../domain/payers'
import { CheckList } from '../../ui/CheckList'
import './entry.css'

// 회원이 이보다 많으면 7명까지만 보이고 [회원 N명 더 보기] 로 펼친다 (SPEC-010 3절: 8명 넘으면 7명)
const VISIBLE_MEMBERS = 7

type PayerPickerProps = {
  choices: PayerChoices
  checked: readonly string[]
  onToggle: (memberId: string) => void
  // 빠른 고르기: 그 분들로 바꾼다
  onPick: (memberIds: string[]) => void
  // [+ 회원 넣기] → 이름 칸 하나짜리 창
  onAddMember: () => void
}

// "누가 냈어요?" 답 (SPEC-010 3절, 내역 적기·고치기 같은 목록): 빠른 고르기 [지난번 낸 분 N명](없으면 없음)·[모두 N명](쉬는 분 빼고)
// → 세로 체크 목록(가나다, 그 달이 쉬는 달인 분은 맨 아래 "쉬는 분" 묶음) → [+ 회원 넣기]
export function PayerPicker({ choices, checked, onToggle, onPick, onAddMember }: PayerPickerProps) {
  const active = choices.members.filter((member) => !member.resting)
  const resting = choices.members.filter((member) => member.resting)
  const option = ({ id, name }: { id: string; name: string }) => ({ value: id, label: name })
  // [모두 N명]: 지금 회원 중 그 달 쉬는 분을 뺀 분 (고치기에서 남겨 둔 그만둔 분도 뺀다)
  const everyone = active.filter((member) => !member.left).map((member) => member.id)

  return (
    <div className="entry__payers">
      {(choices.last.length > 0 || everyone.length > 0) && (
        <div className="entry__quick" role="group" aria-label="한 번에 고르기">
          {choices.last.length > 0 && (
            <button type="button" className="entry__quick-button" onClick={() => onPick(choices.last)}>
              지난번 낸 분 {choices.last.length}명
            </button>
          )}
          {everyone.length > 0 && (
            <button type="button" className="entry__quick-button" onClick={() => onPick(everyone)}>
              모두 {everyone.length}명
            </button>
          )}
        </div>
      )}
      <CheckList
        label="회원"
        options={active.map(option)}
        tail={resting.length > 0 ? { title: '쉬는 분', options: resting.map(option) } : undefined}
        checked={checked}
        onToggle={onToggle}
        collapse={{ visible: VISIBLE_MEMBERS, label: (hidden) => `회원 ${hidden}명 더 보기` }}
        action={{ label: '회원 넣기', icon: 'plus', onClick: onAddMember }}
      />
    </div>
  )
}
