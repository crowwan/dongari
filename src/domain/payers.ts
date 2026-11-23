// 내역 적기·고치기 "누가 냈어요?" 에 보일 회원 (SPEC-010 3절) 순수 함수
import { isDuesEntry } from './dues'
import { monthlyFeeOf } from './duesTable'
import { yearMonth } from './members'
import type { Book, Member } from './types'

// 목록 한 줄: 회원 번호·이름, 그 기록의 달이 쉬는 달인지 (쉬는 분은 목록 맨 아래 "쉬는 분" 묶음),
// 그만둔 분인지 (고치기에서 이미 낸 분이라 남겨 둔 분. [모두] 에는 들지 않는다)
export interface PayerChoice {
  id: string
  name: string
  resting: boolean
  left: boolean
}

export interface PayerChoices {
  // 목록 순서: 쉬지 않는 분 가나다 → 쉬는 분 가나다
  members: PayerChoice[]
  // [지난번 낸 분]: 낸 분이 있는 회비 기록 중 가장 최근에 저장한 것의 낸 분 (목록에 있는 분만). 없으면 빈 목록 → 버튼 없음
  last: string[]
  // 그 해 월 회비 (그 해에 없으면 그 전 해 값). 없으면 금액을 채우지 않는다
  fee: number | undefined
}

// "누가 냈어요?" 를 묻는 장부: 동아리·모임이고 회원 명단에 한 분 이상(그만둔 분 포함). 아니면 내역 적기·고치기가 v2.7 과 같다 (SPEC-010 3·11절)
export function asksPayers(book: Book | undefined): book is Book {
  return book !== undefined && book.kind === 'club' && (book.members ?? []).length > 0
}

const byName = (a: Member, b: Member) => a.name.localeCompare(b.name, 'ko')

// 그 기록의 달(year·month)에 보일 회원: 지금 회원(그만둔 분 빼고). keep: 지금 회원이 아니어도 넣을 분 (고치기에서 이미 낸 분으로 들어간 그만둔 분)
export function payerChoices(book: Book, year: number, month: number, keep: readonly string[] = []): PayerChoices {
  const entryMonth = yearMonth(year, month)
  const listed = (book.members ?? []).filter((member) => member.left === undefined || keep.includes(member.id))
  const resting = (member: Member) => member.off.includes(entryMonth)
  const ordered = [...listed.filter((member) => !resting(member)).sort(byName), ...listed.filter(resting).sort(byName)]
  const members = ordered.map((member) => ({ id: member.id, name: member.name, resting: resting(member), left: member.left !== undefined }))
  const shown = new Set(members.map((member) => member.id))
  return {
    members,
    last: lastPayerIds(book).filter((id) => shown.has(id)),
    fee: monthlyFeeOf(book, year),
  }
}

// 낸 분이 있는 회비 기록 중 가장 최근에 저장한 것(적은 시각, 같으면 뒤에 있는 것)의 낸 분
function lastPayerIds(book: Book): string[] {
  const paid = Object.values(book.ledgers)
    .sort((a, b) => a.year - b.year)
    .flatMap((ledger) => ledger.entries)
    .filter((entry) => entry.payers !== undefined && entry.payers.length > 0 && isDuesEntry(entry))
  const latest = paid.reduce<(typeof paid)[number] | undefined>(
    (found, entry) => (found === undefined || entry.createdAt >= found.createdAt ? entry : found),
    undefined,
  )
  return (latest?.payers ?? []).map((payer) => payer.memberId)
}
