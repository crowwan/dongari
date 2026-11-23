// 내역 적기·고치기 "누가 냈어요?" 에 넘길 것 (SPEC-010 3절)
import { yearMonth } from '../../domain/members'
import { asksPayers, payerChoices, type PayerChoices } from '../../domain/payers'
import type { Member } from '../../domain/types'
import type { LedgerState } from './useLedger'

// 회비 적기 (SPEC-010 3절): "누가 냈어요?" 를 묻는 장부(동아리·모임 + 회원 명단 한 분 이상)일 때만 준다
export type EntryDues = {
  // 그 기록의 달에 보일 회원·[지난번 낸 분]·그 해 월 회비. keep: 지금 회원이 아니어도 넣을 분 (고치기의 이미 낸 분)
  choices: (month: number, keep?: readonly string[]) => PayerChoices
  // 같은 이름 안내용 명단 (그만둔 분 포함)
  members: readonly Member[]
  // [+ 회원 넣기]: 명단에 넣고(들어온 달 = 이 기록의 달) 새 회원 번호를 돌려준다
  onAddMember: (name: string, month: number) => string
}

// 내역 적기·고치기 위에 뜨는 칸 이름 (방문 기록 한 칸 — 뒤로 버튼은 그것만 닫는다)
export const PAYER_SHARES_PAGE = 'entry-payer-shares'
export const ADD_PAYER_SHEET = 'entry-add-payer'

// 낸 분 줄 값: 이름을 쉼표로(목록 순서), 둘째 줄 "N명". [이름 없이 적기] 는 "이름 없이"
export function payerNames(memberIds: readonly string[], choices: PayerChoices): string[] {
  return choices.members.filter((member) => memberIds.includes(member.id)).map((member) => member.name)
}

// 명단이 있는 동아리 장부일 때만 (아니면 v2.7 과 같다). 목록은 보고 있는 장부 연도의 그 달 기준.
// [+ 회원 넣기] 는 명단에 넣고(들어온 달 = 이 기록의 달) 기기에 저장했을 때만 "회원을 넣었어요" 를 알린다 (설정 회원 넣기와 같은 말)
export function entryDues(state: Pick<LedgerState, 'book' | 'year' | 'addMember'>, notify: (message: string) => void): EntryDues | undefined {
  const { book, year } = state
  if (!asksPayers(book)) return undefined
  return {
    choices: (month, keep) => payerChoices(book, year, month, keep),
    members: book.members ?? [],
    onAddMember: (name, month) => {
      const { saved, id } = state.addMember({ name, joined: yearMonth(year, month) })
      if (saved) notify('회원을 넣었어요')
      return id
    },
  }
}
