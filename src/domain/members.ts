// 회원 명단·월 회비·회비 표 시작 달 바꾸기 (SPEC-010 6절) 순수 함수. 결과는 저장 형식 검사(storage/schema, v4)를 늘 통과해야 한다
import { monthlyFeeOf } from './duesTable'
import { InvalidLedgerInputError } from './ledger'
import { ENTRY_AMOUNT_MAX, type Book, type Ledger, type Member, type YearMonth } from './types'

// 회원 넣기에서 적는 것 (이름 + 들어온 달)
export interface NewMember {
  name: string
  joined: YearMonth
}

// 회원 정보 편집에서 고치는 것. 쉬는 달은 한 분 보기에서 넣는다(restMember·resumeMember, #163)
export interface MemberChanges {
  name: string
  joined: YearMonth
  left?: YearMonth // 그만둔 달 (그 달부터 회원이 아니다). 없으면 지금 회원
  opening: number // 시작할 때 남은 돈: 양수 = 미리 낸 돈, 음수 = 덜 낸 돈, 0 = 없음
}

// 'YYYY-MM' 달 (SPEC-010 1절). 한 자리 달·13월·날짜까지 붙은 글은 아니다. 저장 형식 검사(storage/schema)도 이 규칙 하나를 쓴다
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export function isYearMonth(value: unknown): value is YearMonth {
  return typeof value === 'string' && YEAR_MONTH.test(value)
}

// 바꾸는 값의 달 형식 검사 (엑셀 불러오기처럼 화면 밖에서 불러도 저장 형식 검사와 어긋나게 넣지 않는다)
function checkYearMonth(value: string, what: string): YearMonth {
  if (!isYearMonth(value)) throw new InvalidLedgerInputError(`${what}은 YYYY-MM 이어야 한다: ${value}`)
  return value
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

// 회원 이름에 못 쓰는 글자: 엑셀 내용 칸에서 낸 분을 가르는 쉼표(`,` `，` `、`, SPEC-010 8절 "낸 분").
// 이름에 있으면 내보낸 엑셀을 다시 읽을 때 두 분으로 갈린다 (6·9절, #180 리뷰). 같은 이름 구분은 괄호("김민지(91)")로
export const MEMBER_NAME_SEPARATORS: readonly string[] = [',', '，', '、']
export const NAME_SEPARATOR_ERROR = '이름에 쉼표(,)는 쓸 수 없어요. 구분하려면 괄호를 써 주세요'

export function hasNameSeparator(name: string): boolean {
  return MEMBER_NAME_SEPARATORS.some((separator) => name.includes(separator))
}

function checkName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new InvalidLedgerInputError('회원 이름이 비어 있다')
  if (hasNameSeparator(trimmed)) throw new InvalidLedgerInputError(`회원 이름에 쉼표를 쓸 수 없다: ${trimmed}`)
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
  const added: Member = { id, name: checkName(input.name), joined: checkYearMonth(input.joined, '들어온 달'), off: [] }
  return { ...book, members: [...members, added], dues: book.dues ?? { startMonth: yearMonth(deps.year, 1) } }
}

// 회원 정보 편집. 번호·쉬는 달은 그대로 두고, 그만둔 달·남은 돈이 없으면(0) 칸째 뺀다
export function updateMember(book: Book, id: string, changes: MemberChanges): Book {
  // 예전부터 쉼표가 든 이름(엑셀에서 불러온 명단)은 그대로 두면 다른 칸을 고칠 수 있다 — 새로 쉼표를 넣는 것만 막는다
  const current = (book.members ?? []).find((member) => member.id === id)?.name
  const name = current !== undefined && changes.name.trim() === current ? current : checkName(changes.name)
  const opening = checkOpening(changes.opening)
  const joined = checkYearMonth(changes.joined, '들어온 달')
  const left = changes.left === undefined ? undefined : checkYearMonth(changes.left, '그만둔 달')
  return {
    ...book,
    members: (book.members ?? []).map((member) => {
      if (member.id !== id) return member
      const changed: Member = { id, name, joined, off: member.off }
      if (left !== undefined) changed.left = left
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

// 회원 한 분의 쉬는 달만 바꾼다
function changeOff(book: Book, id: string, change: (off: readonly YearMonth[]) => YearMonth[]): Book {
  return {
    ...book,
    members: (book.members ?? []).map((member) => (member.id === id ? { ...member, off: change(member.off) } : member)),
  }
}

// 쉬는 기간 넣기 (SPEC-010 5절 한 분 보기 [N월부터 쉬어요]): from 부터 until 까지(둘 다 포함) 달마다 쉬는 달로 저장한다.
// 이미 쉬는 달은 한 번만, 달 순서로 둔다 ('YYYY-MM' 글자 순서 = 달 순서)
export function restMember(book: Book, id: string, from: YearMonth, until: YearMonth): Book {
  const first = checkYearMonth(from, '쉬는 달')
  const last = checkYearMonth(until, '쉬는 끝 달')
  if (last < first) throw new InvalidLedgerInputError(`쉬는 끝 달이 첫 달보다 앞이다: ${first} ~ ${last}`)
  const months: YearMonth[] = []
  for (let month = first; month <= last; month = nextMonth(month)) months.push(month)
  return changeOff(book, id, (off) => [...new Set([...off, ...months])].sort())
}

// 다시 내기 (5절 [N월부터 다시 내요]): from 부터 이어진 쉬는 달을 지운다. 앞의 쉬는 달·사이가 떨어진 쉬는 달은 남긴다
export function resumeMember(book: Book, id: string, from: YearMonth): Book {
  return changeOff(book, id, (off) => {
    const resting = new Set(off)
    for (let month = checkYearMonth(from, '다시 내는 달'); resting.has(month); month = nextMonth(month)) resting.delete(month)
    return off.filter((month) => resting.has(month))
  })
}

// [아직 몰라요]의 끝 달: 쉬는 달은 달마다 저장해 끝이 있어야 하니, 그 달의 해와 올해 중 늦은 해의 다음 해 12월까지 (#163).
// "언제까지 쉬나요?" 달 고르기의 마지막 해와 같다. 다시 내면 [N월부터 다시 내요]로 지운다
export function openEndedRestUntil(from: YearMonth, today: Date): YearMonth {
  return yearMonth(Math.max(splitYearMonth(from).year, today.getFullYear()) + 1, 12)
}

// 회비 표 시작 달 바꾸기. "낸 분을 안 적은 회비" 카드 숨김은 그대로
export function changeDuesStart(book: Book, startMonth: YearMonth): Book {
  return { ...book, dues: { ...book.dues, startMonth: checkYearMonth(startMonth, '회비 표 시작 달') } }
}

// 그 해 월 회비 바꾸기: 기록 금액과 같은 범위(1 ~ ENTRY_AMOUNT_MAX 정수)
export function changeMonthlyFee(ledger: Ledger, fee: number): Ledger {
  if (!Number.isInteger(fee) || fee < 1 || fee > ENTRY_AMOUNT_MAX) {
    throw new InvalidLedgerInputError(`월 회비는 1 ~ ${ENTRY_AMOUNT_MAX} 정수여야 한다: ${fee}`)
  }
  return { ...ledger, monthlyFee: fee }
}

// 새 연도 장부에 작년 월 회비를 가져온다 (SPEC-010 6절, SPEC-001 새 연도 시작). 작년에도 없으면 그 전 해 값 (duesTable.monthlyFeeOf)
export function carryMonthlyFee(book: Book, ledger: Ledger): Ledger {
  const fee = monthlyFeeOf(book, ledger.year - 1)
  return fee === undefined ? ledger : { ...ledger, monthlyFee: fee }
}
