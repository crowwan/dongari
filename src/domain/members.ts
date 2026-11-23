// 회원 명단·월 회비·회비 표 시작 달 바꾸기 (SPEC-010 6절) 순수 함수. 결과는 저장 형식 검사(storage/schema, v4)를 늘 통과해야 한다
import { InvalidLedgerInputError } from './ledger'
import { ENTRY_AMOUNT_MAX, type Book, type Ledger, type Member, type YearMonth } from './types'

// 회원 넣기에서 적는 것 (이름 + 들어온 달)
export interface NewMember {
  name: string
  joined: YearMonth
}

// 회원 정보 편집에서 고치는 것. 쉬는 달은 한 분 보기에서 넣는다(#163)
export interface MemberChanges {
  name: string
  joined: YearMonth
  left?: YearMonth // 그만둔 달 (그 달부터 회원이 아니다). 없으면 지금 회원
  opening: number // 시작할 때 남은 돈: 양수 = 미리 낸 돈, 음수 = 덜 낸 돈, 0 = 없음
}

// 해·달 → 'YYYY-MM'
export function yearMonth(year: number, month: number): YearMonth {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function splitYearMonth(value: YearMonth): { year: number; month: number } {
  const [year, month] = value.split('-').map(Number)
  return { year: year ?? 0, month: month ?? 0 }
}

// 오늘이 속한 달
export function thisMonthOf(today: Date): YearMonth {
  return yearMonth(today.getFullYear(), today.getMonth() + 1)
}

export function nextMonth(value: YearMonth): YearMonth {
  const { year, month } = splitYearMonth(value)
  return month === 12 ? yearMonth(year + 1, 1) : yearMonth(year, month + 1)
}

export function previousMonth(value: YearMonth): YearMonth {
  const { year, month } = splitYearMonth(value)
  return month === 1 ? yearMonth(year - 1, 12) : yearMonth(year, month - 1)
}

function checkName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new InvalidLedgerInputError('회원 이름이 비어 있다')
  return trimmed
}

// 시작할 때 남은 돈: 이월금과 같은 ±ENTRY_AMOUNT_MAX 안 정수
function checkOpening(opening: number): number {
  if (!Number.isInteger(opening) || Math.abs(opening) > ENTRY_AMOUNT_MAX) {
    throw new InvalidLedgerInputError(`시작할 때 남은 돈은 ±${ENTRY_AMOUNT_MAX} 이내 정수여야 한다: ${opening}`)
  }
  return opening
}

// 같은 이름(앞뒤 띄어쓰기 무시)의 회원이 있는가. 그만둔 분도 본다. exceptId: 고치는 분 자신
export function hasSameName(members: readonly Member[], name: string, exceptId?: string): boolean {
  const trimmed = name.trim()
  return members.some((member) => member.id !== exceptId && member.name.trim() === trimmed)
}

// 회원 넣기. 번호는 앱이 만들고(deps.createId) 명단 안에서 겹치지 않아야 한다.
// 명단을 처음 넣을 때 회비 표 시작 달이 없으면 장부 연도(deps.year, 설정에서 보던 해) 1월로 정한다 (SPEC-010 1·11절)
export function addMember(book: Book, input: NewMember, deps: { createId: () => string; year: number }): Book {
  const members = book.members ?? []
  const id = deps.createId()
  if (members.some((member) => member.id === id)) throw new InvalidLedgerInputError(`이미 있는 회원 번호다: ${id}`)
  const added: Member = { id, name: checkName(input.name), joined: input.joined, off: [] }
  return { ...book, members: [...members, added], dues: book.dues ?? { startMonth: yearMonth(deps.year, 1) } }
}

// 회원 정보 편집. 번호·쉬는 달은 그대로 두고, 그만둔 달·남은 돈이 없으면(0) 칸째 뺀다
export function updateMember(book: Book, id: string, changes: MemberChanges): Book {
  const name = checkName(changes.name)
  const opening = checkOpening(changes.opening)
  return {
    ...book,
    members: (book.members ?? []).map((member) => {
      if (member.id !== id) return member
      const changed: Member = { id, name, joined: changes.joined, off: member.off }
      if (changes.left !== undefined) changed.left = changes.left
      if (opening !== 0) changed.opening = opening
      return changed
    }),
  }
}

// 어느 해 기록이든 낸 분으로 들어간 회원인가 (그런 회원은 지울 수 없다, SPEC-010 1절)
export function memberHasRecords(book: Book, id: string): boolean {
  return Object.values(book.ledgers).some((ledger) =>
    ledger.entries.some((entry) => (entry.payers ?? []).some((payer) => payer.memberId === id)),
  )
}

// 기록에 없는 회원만 지운다. 기록에 있는 분을 지우면 낸 분이 명단 밖 번호를 가리켜 저장 형식 검사가 장부 전체를 깨진 것으로 본다
export function deleteMember(book: Book, id: string): Book {
  if (memberHasRecords(book, id)) throw new InvalidLedgerInputError('회비 기록에 낸 분으로 들어간 회원은 지울 수 없다')
  return { ...book, members: (book.members ?? []).filter((member) => member.id !== id) }
}

// 회비 표 시작 달 바꾸기. "낸 분을 안 적은 회비" 카드 숨김은 그대로
export function changeDuesStart(book: Book, startMonth: YearMonth): Book {
  return { ...book, dues: { ...book.dues, startMonth } }
}

// 그 해 월 회비. 그 해에 없으면 가장 가까운 그 전 해 값, 어느 해에도 없으면 undefined (SPEC-010 1절)
export function monthlyFeeOf(book: Book, year: number): number | undefined {
  return Object.values(book.ledgers)
    .filter((ledger) => ledger.year <= year && ledger.monthlyFee !== undefined)
    .sort((a, b) => b.year - a.year)[0]?.monthlyFee
}

// 그 해 월 회비 바꾸기: 기록 금액과 같은 범위(1 ~ ENTRY_AMOUNT_MAX 정수)
export function changeMonthlyFee(ledger: Ledger, fee: number): Ledger {
  if (!Number.isInteger(fee) || fee < 1 || fee > ENTRY_AMOUNT_MAX) {
    throw new InvalidLedgerInputError(`월 회비는 1 ~ ${ENTRY_AMOUNT_MAX} 정수여야 한다: ${fee}`)
  }
  return { ...ledger, monthlyFee: fee }
}

// 새 연도 장부에 작년 월 회비를 가져온다 (SPEC-010 6절, SPEC-001 새 연도 시작). 작년에도 없으면 그 전 해 값
export function carryMonthlyFee(book: Book, ledger: Ledger): Ledger {
  const fee = monthlyFeeOf(book, ledger.year - 1)
  return fee === undefined ? ledger : { ...ledger, monthlyFee: fee }
}
