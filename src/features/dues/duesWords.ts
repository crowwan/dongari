// 회비 표·한 분 보기 화면 문구 (SPEC-010 4·5절). 계산 결과(domain/duesTable)를 글자로만 바꾸고 다시 계산하지 않는다
import type { DuesCell, DuesFill, DuesOpening, DuesPaidThrough, DuesPayment, DuesRow, DuesTable } from '../../domain/duesTable'
import { previousMonth, splitYearMonth, yearMonth } from '../../domain/members'
import type { YearMonth } from '../../domain/types'
import { formatAmount } from '../../ui/money'
import { fullMonthText, restingSince } from '../settings/roster'

// 짧은 돈 글자 (줄 상태 "1만 원 덜 냄"): 만 원 단위는 "12만 원", 나머지가 있으면 "1만 5,000원", 만 원 안 되면 "5,000원"
export function shortWon(amount: number): string {
  const man = Math.floor(amount / 10_000)
  const rest = amount % 10_000
  if (man === 0) return `${formatAmount(rest)}원`
  return rest === 0 ? `${formatAmount(man)}만 원` : `${formatAmount(man)}만 ${formatAmount(rest)}원`
}

// 달 글자: 보는 해면 "10월", 다른 해면 "2027년 2월"
function monthLabel(year: number, month: number, viewedYear: number): string {
  return year === viewedYear ? `${month}월` : `${year}년 ${month}월`
}

// 일부만 찬 칸의 금액: 정확히 반이면 "반", 아니면 "5,000원"
function partText(paid: number, fee: number): string {
  return paid * 2 === fee ? '반' : `${formatAmount(paid)}원`
}

// 채운 마지막 칸: "11월까지" / "10월 반까지" / "10월 5,000원까지" (다음 해 칸이면 "2027년 2월까지")
export function paidThroughText({ year, month, paid, fee }: DuesPaidThrough, viewedYear: number): string {
  const label = monthLabel(year, month, viewedYear)
  return paid < fee ? `${label} ${partText(paid, fee)}까지` : `${label}까지`
}

// 그 해 안에 이미 그만둔 분: 그만둔 달이 그 해 안이고(다음 해 1월이면 12월까지 회원) 이번 달까지 와 있다(이번 달 뒤에 그만둘 분은 아직 회원)
function leftWithin(member: DuesRow['member'], year: number, thisMonth: YearMonth): boolean {
  return member.left !== undefined && member.left < yearMonth(year + 1, 1) && member.left <= thisMonth
}

// 사람별 줄 상태 한 줄 (4절). 덜 냄 → 쉬는 분 → 그 해에 이미 그만둔 분 → 시작 달 뒤 그 해에 들어온 분 → 채운 달 → 칸에 못 넣은 남은 돈 순으로 하나.
// 회비 표 시작 해보다 이른 해는 칸이 없어 상태 줄도 없다 (이름과 낸 돈만). thisMonth: 이번 달 (그만둔 문구를 과거형으로 쓸지)
export function rowStatus(row: DuesRow, table: DuesTable, thisMonth: YearMonth): string | undefined {
  const { year, startMonth, referenceMonth } = table
  if (startMonth === undefined || splitYearMonth(startMonth).year > year) return undefined
  const { member, paidThrough } = row
  const paidText = paidThrough && paidThroughText(paidThrough, year)
  if (row.group === 'behind') return `${paidText ?? '아직 안 냈어요'} · ${shortWon(row.shortfall)} 덜 냄`
  if (row.group === 'resting' && referenceMonth !== undefined) {
    const since = restingSince(member.off, yearMonth(year, referenceMonth))
    if (since !== undefined) return `${yearMonthLabel(since, year)}부터 쉬어요`
  }
  if (member.left !== undefined && leftWithin(member, year, thisMonth)) {
    return `${yearMonthLabel(previousMonth(member.left), year)}까지 회원이었어요`
  }
  if (splitYearMonth(member.joined).year === year && member.joined > startMonth) {
    return `${yearMonthLabel(member.joined, year)}에 들어왔어요`
  }
  if (paidText) return `${paidText} 냈어요`
  // 월 회비를 몰라(어느 해에도 없음) 칸을 못 채운 돈은 낸 돈이니 "안 냈어요" 가 아니다
  return row.remaining > 0 ? `남은 돈 ${shortWon(row.remaining)}` : '아직 안 냈어요'
}

function yearMonthLabel(value: YearMonth, viewedYear: number): string {
  const { year, month } = splitYearMonth(value)
  return monthLabel(year, month, viewedYear)
}

// 칸을 채운 돈의 날짜: 입금 "1/19"(날짜 없는 예전 기록 "3월", 다른 해 "2025년 12/3"), 시작할 때 미리 낸 돈 "미리"
function fillDate(fill: DuesFill, viewedYear: number): string {
  if (fill.kind === 'opening') return '미리'
  const prefix = fill.year === viewedYear ? '' : `${fill.year}년 `
  return fill.day === undefined ? `${prefix}${fill.month}월` : `${prefix}${fill.month}/${fill.day}`
}

// 선택 창 설명의 날짜: "1월 19일", "2025년 12월 3일", 날짜 없는 예전 기록 "3월"
function fillDateLong(fill: DuesFill, viewedYear: number): string {
  if (fill.kind === 'opening') return '시작할 때 미리'
  const label = monthLabel(fill.year, fill.month, viewedYear)
  return fill.day === undefined ? label : `${label} ${fill.day}일`
}

// 한 분 보기 달력 칸 작은 글자 (5절): 채운 입금 날짜 "1/19" · "10/19 반" · "아직" · "쉼" · "회비 모름". 칸이 아니면 "-"
export function cellNote(cell: DuesCell, viewedYear: number): string {
  const last = cell.fills.at(-1)
  switch (cell.state) {
    case 'full':
      return last ? fillDate(last, viewedYear) : ''
    case 'partial':
      return `${last ? `${fillDate(last, viewedYear)} ` : ''}${partText(cell.paid, cell.fee ?? 0)}`
    case 'empty':
      return '아직'
    case 'off':
      return '쉼'
    case 'noFee':
      return '회비 모름'
    case 'notMember':
    case 'beforeStart':
      return '-'
  }
}

// 달 칸 선택 창 설명 한 줄 (5절)
export function cellSheetNote(cell: DuesCell, viewedYear: number): string {
  const last = cell.fills.at(-1)
  switch (cell.state) {
    case 'full':
      return last ? `${fillDateLong(last, viewedYear)}에 낸 돈으로 채웠어요` : '채웠어요'
    case 'partial':
      return `${last ? `${fillDateLong(last, viewedYear)}에 낸 돈으로 ` : ''}${partText(cell.paid, cell.fee ?? 0)}을 채웠어요`
    case 'empty':
      return '아직 채워지지 않았어요. 이 달에 회비를 안 내는 거면 쉬는 달로 표시해 주세요'
    case 'off':
      return '쉬는 달이에요. 다시 내기 시작하면 아래 버튼을 눌러 주세요'
    case 'noFee':
      return `${viewedYear}년 월 회비를 정하지 않아 채우지 못했어요`
    case 'notMember':
      return '회원이 아닌 달이에요'
    case 'beforeStart':
      return '회비 표를 계산하기 전 달이에요'
  }
}

// 입금 하나가 채운 칸: "9월 칸" · "10월 칸 반" · "1~12월 칸" · "12월~2027년 2월 칸"
function slotsText(slots: DuesPayment['slots'], feeOf: (year: number) => number | undefined, viewedYear: number): string | undefined {
  const first = slots[0]
  const last = slots.at(-1)
  if (!first || !last) return undefined
  if (slots.length === 1) {
    const fee = feeOf(first.year) ?? first.amount
    const part = first.amount < fee ? (first.amount * 2 === fee ? ' 반' : ' 일부') : ''
    return `${monthLabel(first.year, first.month, viewedYear)} 칸${part}`
  }
  if (first.year === last.year) {
    const prefix = first.year === viewedYear ? '' : `${first.year}년 `
    return `${prefix}${first.month}~${last.month}월 칸`
  }
  return `${monthLabel(first.year, first.month, viewedYear)}~${monthLabel(last.year, last.month, viewedYear)} 칸`
}

// 한 분 보기 "낸 기록" 줄 설명 (5절): 채운 칸, 같이 낸 분(이 분 말고 같은 기록에 든 분 수), 시작 전 덜 낸 돈·남은 돈
export function paymentNote(
  payment: DuesPayment,
  payerCount: number,
  feeOf: (year: number) => number | undefined,
  viewedYear: number,
): string {
  const parts = [
    payment.beforeStart ? '회비 표 시작 전' : undefined,
    payment.toDebt > 0 ? '시작 전 덜 낸 돈' : undefined,
    slotsText(payment.slots, feeOf, viewedYear),
    payment.remaining > 0 ? `남은 돈 ${formatAmount(payment.remaining)}원` : undefined,
    payerCount > 1 ? `같이 낸 분 ${payerCount - 1}명` : undefined,
  ]
  return parts.filter((part) => part !== undefined).join(' · ')
}

// 시작할 때 남은 돈 한 줄 (5절 요약): "2025년까지 덜 낸 돈 30,000원을 먼저 채웠어요". 없으면 undefined
export function openingNote({ amount, debtCovered }: DuesOpening, startMonth: YearMonth): string | undefined {
  if (amount === 0) return undefined
  const { year, month } = splitYearMonth(startMonth)
  const before = month === 1 ? `${year - 1}년까지` : `${fullMonthText(startMonth)} 전까지`
  if (amount > 0) return `${before} 미리 낸 돈 ${formatAmount(amount)}원으로 먼저 채웠어요`
  const debt = `${before} 덜 낸 돈 ${formatAmount(-amount)}원`
  if (debtCovered === -amount) return `${debt}을 먼저 채웠어요`
  if (debtCovered === 0) return `${debt}이 남아 있어요`
  return `${debt} 중 ${formatAmount(debtCovered)}원을 채웠어요`
}
