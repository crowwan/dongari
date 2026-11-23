// 낸 분 붙이기 (SPEC-010 7절): 회비 표 카드·회원 명단 [낸 분 붙이기]·붙이기 화면에 넘길 것과 아래 안내 글
import type { Book, Payer, YearMonth } from '../../domain/types'
import { formatAmount } from '../../ui/money'
import type { LedgerState } from '../ledger/useLedger'

export interface PayerAssign {
  book: Book // 지금 장부: 대상(unassignedDues)·"누가 냈어요?" 목록·월 회비를 여기서 센다
  thisYear: number // 올해 (날짜 줄에 해를 붙일지)
  // [다음]·[끝]: 그 해 기록에 낸 분을 붙여 저장했는지 (실패면 화면을 닫아 위쪽 실패 안내를 보인다)
  onAssign: (year: number, entryId: string, payers: readonly Payer[]) => boolean
  // [+ 회원 넣기]: 명단에 넣고(들어온 달 = 그 기록의 달) 새 회원 번호를 돌려준다
  onAddMember: (name: string, joined: YearMonth) => string
  onHide: () => void // [이 카드 숨기기]
  onFinish: (assigned: number) => void // 끝까지 갔을 때: 이번에 붙인 건수
}

// [이 카드 숨기기] 알림: 숨긴 뒤에도 들어가는 길을 같이 알린다
export const HIDE_CARD_MESSAGE = '카드를 숨겼어요. 회원 명단에서 붙일 수 있어요'

// 동아리·모임 장부일 때만 (명단·회비 표가 있는 장부). 알림은 기기에 저장했을 때만 (실패면 위쪽 안내 띠만)
export function payerAssign(
  state: Pick<LedgerState, 'book' | 'assignPayers' | 'addMember' | 'hideUnassignedDues'>,
  today: Date,
  notify: (message: string) => void,
): PayerAssign | undefined {
  const { book } = state
  if (!book) return undefined
  return {
    book,
    thisYear: today.getFullYear(),
    onAssign: state.assignPayers,
    onAddMember: (name, joined) => {
      const { saved, id } = state.addMember({ name, joined })
      if (saved) notify('회원을 넣었어요')
      return id
    },
    onHide: () => {
      if (state.hideUnassignedDues()) notify(HIDE_CARD_MESSAGE)
    },
    onFinish: (assigned) => {
      if (assigned > 0) notify(`낸 분을 붙였어요 · ${assigned}건`)
    },
  }
}

// 붙이기 화면 아래 고정 안내 (7절): 아무도 안 고르면 [다음] 비활성 + 이유, 고르면 몫이 어떻게 정해지는지.
// 금액은 바꿀 수 없으니 사람 수로 나눠떨어지면 한 분 몫, 아니면 [다음] 이 "한 분씩 금액" 으로 간다
export type AssignNote = { missing: string } | { note: string }

export function assignNote(count: number, amount: number, shares: readonly Payer[] | undefined): AssignNote {
  if (count === 0) return { missing: '누가 냈는지 골라 주세요' }
  if (shares !== undefined) return { note: `${count}명 · 한 분씩 정한 금액` }
  const each = amount / count
  return { note: Number.isInteger(each) ? `${count}명 · 한 분 ${formatAmount(each)}원` : `${count}명 · 똑같이 나눠지지 않아요` }
}
