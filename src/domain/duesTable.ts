// 회비 표 계산 순수 함수 (SPEC-010 2절). 저장은 사실(낸 날·금액·낸 분), 표는 계산으로 몇 달 치.
// 회비 표 화면·한 분 보기·장부 [회비 표] 버튼·엑셀 회비내역이 이 결과를 그대로 쓴다. 저장하지 않고 볼 때마다 처음부터 다시 계산한다(2절 6)
import { isDuesEntry } from './dues'
import { byDate } from './entryDate'
import type { Book, Entry, Member, YearMonth } from './types'

const MONTHS: readonly number[] = Array.from({ length: 12 }, (_, index) => index + 1)

// 달 번호: 해 × 12 + (달 − 1). 해를 넘어 이어지는 칸을 한 줄로 세려고 쓴다
function monthIndex(year: number, month: number): number {
  return year * 12 + month - 1
}

// 'YYYY-MM' (저장 형식 검사를 지난 값) → 달 번호
function parseYearMonth(value: YearMonth): number {
  return monthIndex(Number(value.slice(0, 4)), Number(value.slice(5, 7)))
}

function yearOf(index: number): number {
  return Math.floor(index / 12)
}

function monthOf(index: number): number {
  return (index % 12) + 1
}

// 오지 않는 달: 회비 표 시작 달이 없는 장부(어느 달도 시작 달 전), 그만둔 달이 없는 분(칸이 끝나지 않음)
const NEVER = Number.POSITIVE_INFINITY
// 미리 낸 돈으로 칸을 채우는 범위: 기준 해(보는 해와 올해 중 늦은 해) + 이만큼 해의 12월까지. 넘는 돈은 남은 돈(remaining).
// 금액 오타(월 회비 1,000원에 999,999,000원)에도 장부 화면을 그릴 때마다 수십만 칸을 돌지 않게 한다
const PREPAID_YEARS = 10

// 칸 한 개의 상태: 채움 ○ / 일부 / 빈칸(안 냄) / 월 회비를 몰라 못 채우는 칸 / 쉬는 달 "/" / 회원 아님 "-" / 시작 달 전.
// noFee 는 덜 낸 돈에도 넣지 않으니 빈칸(안 냄)과 다르게 그린다 (2절 3)
export type DuesCellState = 'full' | 'partial' | 'empty' | 'noFee' | 'off' | 'notMember' | 'beforeStart'

// 칸을 채운 돈 한 덩이: 입금(회비 기록) 또는 시작할 때 미리 낸 돈
export type DuesFill =
  | { kind: 'payment'; entryId: string; year: number; month: number; day?: number; amount: number }
  | { kind: 'opening'; amount: number }

export interface DuesCell {
  month: number // 1~12
  state: DuesCellState
  fee?: number // 채움·일부·빈칸이면 그 칸이 있는 해의 월 회비 (noFee·칸 아님은 없음)
  paid: number // 이 칸에 채운 돈 (칸이 아니면 0)
  fills: DuesFill[] // 이 칸을 채운 돈, 채운 순서 (여러 입금이 한 칸을 나눠 채울 수 있다)
}

// 입금 하나가 채운 칸 하나
export interface DuesSlotFill {
  year: number
  month: number
  amount: number
}

// 한 분의 입금 하나 (그 회비 기록에서 그분 몫)와 그 돈이 간 곳
export interface DuesPayment {
  entryId: string
  year: number
  month: number
  day?: number
  amount: number // 이 기록에서 이 회원 몫
  beforeStart: boolean // 회비 표 시작 달 전 날짜라 칸에 넣지 않은 입금 (그 해 낸 돈에는 들어간다, 2절 2)
  toDebt: number // 시작할 때 덜 낸 돈을 먼저 메운 금액
  slots: DuesSlotFill[] // 채운 칸, 오래된 달부터
  remaining: number // 칸을 다 채우고 남은 금액 (그만둔 뒤 낸 돈, 월 회비를 몰라 못 채운 돈, 채우는 범위를 넘는 미리 낸 돈)
}

// 시작할 때 남은 돈과 그 반영 결과
export interface DuesOpening {
  amount: number // 양수 = 미리 낸 돈(가장 먼저 칸을 채운다), 음수 = 덜 낸 돈
  debtCovered: number // 덜 낸 돈일 때 입금으로 먼저 메운 금액 (0 ~ −amount)
}

// 채운 마지막 칸 (상태 문구 "11월까지 냈어요"·"10월 반까지"). 다음 해 칸일 수도 있다
export interface DuesPaidThrough {
  year: number
  month: number
  paid: number // fee 보다 작으면 일부만 찬 칸
  fee: number
}

// 요약 알약 묶음. 한 분은 한 묶음에만: 덜 낸 분 → 쉬는 분(기준 달이 쉬는 달) → 다 낸 분
export type DuesGroup = 'behind' | 'resting' | 'paid'

export interface DuesRow {
  member: Member
  cells: DuesCell[] // 보는 해 1~12월, 늘 12개
  yearPaid: number // 그 해 낸 돈 (이름별 합계): 그 해 날짜의 회비 기록에서 그분 몫의 합. 시작 달 전 해도 계산한다
  shortfall: number // 기준 달까지 덜 낸 돈 (0 이상)
  group: DuesGroup
  paidThrough?: DuesPaidThrough // 채운 칸이 하나도 없으면 없음
  opening: DuesOpening
  remaining: number // 칸을 다 채우고 남은 미리 낸 돈 (그만둔 뒤 낸 돈 등, 한 분 보기 "남은 돈 M원")
  payments: DuesPayment[] // 보는 해 날짜의 입금, 날짜순
}

export interface DuesSummary {
  behind: number // 덜 낸 분
  paid: number // 다 낸 분
  resting: number // 쉬는 분
}

export interface DuesTable {
  year: number
  startMonth?: YearMonth // 회비 표 시작 달. 이 해보다 늦으면 화면은 12칸 띠 없이 이름과 낸 돈만 (4절)
  monthlyFee?: number // 그 해 월 회비 (그 해 없으면 그 전 해 값)
  // 월 회비를 몰라 칸을 채우지 못하는 첫 해: 시작 해부터 보는 해 사이에 있을 때만 ("YYYY년 월 회비를 정해 주세요")
  missingFeeYear?: number
  referenceMonth?: number // 덜 낸 돈의 기준 달 (1~12). 없으면 아무도 덜 냄이 아니다
  rows: DuesRow[] // 덜 낸 분 먼저, 그다음 가나다
  summary: DuesSummary
}

// 날짜가 붙은 기록: 기록에는 달만 있고 해는 장부 연도에 있다
export interface DatedEntry {
  year: number
  entry: Entry
}

// "낸 분을 안 적은 회비" (7절 카드·붙이기 화면)
export interface UnassignedDues {
  items: DatedEntry[] // 오래된 것부터
  total: number
}

// 그 해에 쓰는 월 회비와 그 값을 정한 해 (설정 월 회비 편집이 "2025년 금액을 이어 쓰고 있어요"에 쓴다, #161)
export interface MonthlyFeeSource {
  amount: number
  year: number // 그 해, 또는 값을 이어 온 가장 가까운 그 전 해
}

// 그 해 월 회비: 그 해 값, 없으면 가장 가까운 그 전 해 값, 어느 해에도 없으면 undefined (2절 3, 1절)
export function monthlyFeeSource(book: Book, year: number): MonthlyFeeSource | undefined {
  const withFee = Object.values(book.ledgers).filter((ledger) => ledger.year <= year && ledger.monthlyFee !== undefined)
  const source = withFee.sort((a, b) => b.year - a.year)[0]
  return source?.monthlyFee === undefined ? undefined : { amount: source.monthlyFee, year: source.year }
}

export function monthlyFeeOf(book: Book, year: number): number | undefined {
  return monthlyFeeSource(book, year)?.amount
}

// 칸마다 월 회비를 찾으니 해별로 한 번만 센다
function feeLookup(book: Book): (year: number) => number | undefined {
  const cache = new Map<number, number | undefined>()
  return (year) => {
    if (!cache.has(year)) cache.set(year, monthlyFeeOf(book, year))
    return cache.get(year)
  }
}

// 회비 기록을 날짜순으로: 해 → 달 → 그 달 안은 장부 날짜순(byDate: 같은 날은 적은 순, 날짜 없는 예전 기록은 그 달 맨 뒤)
function duesEntriesByDate(book: Book): DatedEntry[] {
  return Object.values(book.ledgers)
    .sort((a, b) => a.year - b.year)
    .flatMap((ledger) =>
      MONTHS.flatMap((month) =>
        byDate(ledger.entries.filter((entry) => entry.month === month && isDuesEntry(entry))).map((entry) => ({
          year: ledger.year,
          entry,
        })),
      ),
    )
}

function startIndexOf(book: Book): number {
  const startMonth = book.dues?.startMonth
  return startMonth === undefined ? NEVER : parseYearMonth(startMonth)
}

function shareOf(entry: Entry, memberId: string): number {
  return entry.payers?.find((payer) => payer.memberId === memberId)?.amount ?? 0
}

// 회원 한 분의 달 범위: 들어온 달 ≤ 회원인 달 < 그만둔 달, 쉬는 달
interface MemberMonths {
  joined: number
  left: number
  off: Set<number>
}

function monthsOf(member: Member): MemberMonths {
  return {
    joined: parseYearMonth(member.joined),
    left: member.left === undefined ? NEVER : parseYearMonth(member.left),
    off: new Set(member.off.map(parseYearMonth)),
  }
}

function isMemberAt(months: MemberMonths, index: number): boolean {
  return index >= months.joined && index < months.left
}

// 칸을 채우는 돈 한 덩이. 채우면서 unused 가 줄고 간 곳(toDebt·slots)이 쌓인다
interface Deposit {
  payment?: DatedEntry // 없으면 시작할 때 미리 낸 돈
  unused: number
  toDebt: number
  slots: DuesSlotFill[]
}

interface FilledSlot {
  fee: number
  paid: number
  fills: DuesFill[]
}

interface MemberFill {
  slots: Map<number, FilledSlot> // 달 번호 → 채운 칸 (채운 순 = 오래된 달부터)
  // 기록 → 입금 (칸 계산에 넣은 입금만). 기록 id 는 해끼리 겹칠 수 있어 날짜 붙은 기록 자체로 찾는다
  deposits: Map<DatedEntry, Deposit>
  debtCovered: number
  remaining: number
}

interface TableContext {
  year: number // 보는 해
  startIndex: number // 회비 표 시작 달
  fillUntil: number // 칸을 채우는 마지막 달 (PREPAID_YEARS)
  referenceIndex: number | undefined // 기준 달
  feeOf: (year: number) => number | undefined
  duesEntries: readonly DatedEntry[] // 장부의 회비 기록, 날짜순
}

function fillOf(deposit: Deposit, amount: number): DuesFill {
  if (deposit.payment === undefined) return { kind: 'opening', amount }
  const { year, entry } = deposit.payment
  return { kind: 'payment', entryId: entry.id, year, month: entry.month, day: entry.day, amount }
}

// 2절 2~4: 시작할 때 미리 낸 돈 + 시작 달 이후 입금(날짜순)을 앞에서부터 꺼내, 시작할 때 덜 낸 돈 → 칸(오래된 달부터) 순으로 채운다.
// 칸 하나에 드는 돈은 그 칸이 있는 해의 월 회비. 월 회비를 모르는 해의 칸은 건너뛴다. 채우는 범위(fillUntil)를 넘는 돈은 남은 돈
function fillMember(
  member: Member,
  months: MemberMonths,
  payments: readonly DatedEntry[],
  { startIndex, fillUntil, feeOf }: TableContext,
): MemberFill {
  const opening = member.opening ?? 0
  const counted = payments.filter(({ year, entry }) => monthIndex(year, entry.month) >= startIndex)
  const deposits: Deposit[] = [
    ...(opening > 0 ? [{ unused: opening, toDebt: 0, slots: [] }] : []),
    ...counted.map((payment) => ({ payment, unused: shareOf(payment.entry, member.id), toDebt: 0, slots: [] })),
  ]
  let cursor = 0

  // need 만큼 앞 입금부터 꺼낸다. 돈이 모자라면 있는 만큼만
  function take(need: number): { deposit: Deposit; amount: number }[] {
    const taken: { deposit: Deposit; amount: number }[] = []
    let left = need
    while (left > 0 && cursor < deposits.length) {
      const deposit = deposits[cursor]
      const amount = Math.min(left, deposit.unused)
      deposit.unused -= amount
      left -= amount
      taken.push({ deposit, amount })
      if (deposit.unused === 0) cursor += 1
    }
    return taken
  }

  const debtTaken = take(Math.max(0, -opening))
  for (const { deposit, amount } of debtTaken) deposit.toDebt += amount

  // 덜 낸 돈을 다 못 메웠으면 남은 입금이 없어 칸은 하나도 차지 않는다
  const slots = new Map<number, FilledSlot>()
  const end = Math.min(months.left, fillUntil + 1)
  for (let index = Math.max(startIndex, months.joined); index < end && cursor < deposits.length; index += 1) {
    if (months.off.has(index)) continue
    const fee = feeOf(yearOf(index))
    if (fee === undefined) continue // 월 회비를 모르는 칸은 건너뛴다
    const taken = take(fee)
    for (const { deposit, amount } of taken) deposit.slots.push({ year: yearOf(index), month: monthOf(index), amount })
    slots.set(index, {
      fee,
      paid: taken.reduce((sum, item) => sum + item.amount, 0),
      fills: taken.map(({ deposit, amount }) => fillOf(deposit, amount)),
    })
  }

  return {
    slots,
    deposits: new Map(
      deposits.flatMap((deposit): [DatedEntry, Deposit][] => (deposit.payment ? [[deposit.payment, deposit]] : [])),
    ),
    debtCovered: debtTaken.reduce((sum, item) => sum + item.amount, 0),
    remaining: deposits.reduce((sum, deposit) => sum + deposit.unused, 0),
  }
}

// 2절 1: 회원 아님 → 시작 달 전 → 쉬는 달 → 월 회비 모름 → 칸(채운 돈에 따라 채움·일부·빈칸)
function cellOf(months: MemberMonths, index: number, startIndex: number, fill: MemberFill, fee: number | undefined): DuesCell {
  const month = monthOf(index)
  if (!isMemberAt(months, index)) return { month, state: 'notMember', paid: 0, fills: [] }
  if (index < startIndex) return { month, state: 'beforeStart', paid: 0, fills: [] }
  if (months.off.has(index)) return { month, state: 'off', paid: 0, fills: [] }
  if (fee === undefined) return { month, state: 'noFee', paid: 0, fills: [] }
  const slot = fill.slots.get(index)
  if (slot === undefined) return { month, state: 'empty', fee, paid: 0, fills: [] }
  return { month, state: slot.paid === slot.fee ? 'full' : 'partial', fee, paid: slot.paid, fills: slot.fills }
}

// 2절 5: 기준 달까지 칸에 들어갈 돈 − 채운 돈 (시작 달부터 쌓인 것, 지난해 빈칸 포함). 월 회비를 모르는 해의 칸은 들어갈 돈을 몰라 세지 않는다.
// 못 메운 시작할 때 덜 낸 돈도 넣되(시작 달 앞의 셈이라 늘 기준 달 전), 기준 달까지 들어온 분만 (아직 안 들어온 분은 덜 냄이 아니다)
function shortfallOf(months: MemberMonths, fill: MemberFill, debt: number, context: TableContext): number {
  const { startIndex, referenceIndex, feeOf } = context
  if (referenceIndex === undefined) return 0
  let shortfall = months.joined <= referenceIndex ? debt - fill.debtCovered : 0
  const last = Math.min(referenceIndex, months.left - 1)
  for (let index = Math.max(startIndex, months.joined); index <= last; index += 1) {
    if (months.off.has(index)) continue
    shortfall += (feeOf(yearOf(index)) ?? 0) - (fill.slots.get(index)?.paid ?? 0)
  }
  return shortfall
}

// 기준 달 (2절 5): 올해면 지난달, 지난 해면 그해 12월. 올해 1월·앞으로 올 해·시작 달 전이면 기준 칸이 없다
function referenceIndexOf(year: number, today: Date, startIndex: number): number | undefined {
  const thisYear = today.getFullYear()
  const lastMonth = today.getMonth() // 0 = 1월 → 지난달 없음
  let index: number | undefined
  if (year < thisYear) index = monthIndex(year, 12)
  else if (year === thisYear && lastMonth > 0) index = monthIndex(year, lastMonth)
  return index !== undefined && index >= startIndex ? index : undefined
}

function paymentOf(payment: DatedEntry, memberId: string, deposit: Deposit | undefined): DuesPayment {
  const { year, entry } = payment
  return {
    entryId: entry.id,
    year,
    month: entry.month,
    day: entry.day,
    amount: shareOf(entry, memberId),
    beforeStart: deposit === undefined, // 칸 계산에 넣지 않은 입금 = 시작 달 전 입금
    toDebt: deposit?.toDebt ?? 0,
    slots: deposit?.slots ?? [],
    remaining: deposit?.unused ?? 0,
  }
}

// 그 해 한 달이라도 회원이었거나 그 해 낸 돈이 있는 분만 줄이 된다
function memberRow(member: Member, context: TableContext): DuesRow | undefined {
  const { year, startIndex, referenceIndex, feeOf } = context
  const months = monthsOf(member)
  const payments = context.duesEntries.filter(({ entry }) => shareOf(entry, member.id) > 0)
  const ofYear = payments.filter((payment) => payment.year === year)
  const yearPaid = ofYear.reduce((sum, { entry }) => sum + shareOf(entry, member.id), 0)
  const memberThisYear = months.joined <= monthIndex(year, 12) && months.left > monthIndex(year, 1)
  if (!memberThisYear && yearPaid === 0) return undefined

  const fill = fillMember(member, months, payments, context)
  const opening = member.opening ?? 0
  const shortfall = shortfallOf(months, fill, Math.max(0, -opening), context)
  const resting =
    referenceIndex !== undefined && isMemberAt(months, referenceIndex) && months.off.has(referenceIndex)
  const lastSlot = [...fill.slots].at(-1)
  return {
    member,
    cells: MONTHS.map((month) => cellOf(months, monthIndex(year, month), startIndex, fill, feeOf(year))),
    yearPaid,
    shortfall,
    group: shortfall > 0 ? 'behind' : resting ? 'resting' : 'paid',
    paidThrough: lastSlot && {
      year: yearOf(lastSlot[0]),
      month: monthOf(lastSlot[0]),
      paid: lastSlot[1].paid,
      fee: lastSlot[1].fee,
    },
    opening: { amount: opening, debtCovered: fill.debtCovered },
    remaining: fill.remaining,
    payments: ofYear.map((payment) => paymentOf(payment, member.id, fill.deposits.get(payment))),
  }
}

// 덜 낸 분 먼저, 그다음 가나다 (4절). 같은 이름은 명단 순
function byBehindThenName(a: DuesRow, b: DuesRow): number {
  const behind = Number(b.group === 'behind') - Number(a.group === 'behind')
  return behind !== 0 ? behind : a.member.name.localeCompare(b.member.name, 'ko')
}

// 보는 해 하나의 회비 표 (2절·4절). today 는 기준 달(지난달)을 정하는 오늘
export function duesTable(book: Book, year: number, today: Date): DuesTable {
  const startIndex = startIndexOf(book)
  const feeOf = feeLookup(book)
  const referenceIndex = referenceIndexOf(year, today, startIndex)
  const context: TableContext = {
    year,
    startIndex,
    fillUntil: monthIndex(Math.max(year, today.getFullYear()) + PREPAID_YEARS, 12),
    referenceIndex,
    feeOf,
    duesEntries: duesEntriesByDate(book),
  }
  const rows = (book.members ?? [])
    .flatMap((member) => memberRow(member, context) ?? [])
    .sort(byBehindThenName)
  // 월 회비는 그 전 해 값을 이어 쓰니 모르는 해는 앞쪽 해들뿐이다. 그래서 시작 해만 보면 된다
  const startYear = yearOf(startIndex)
  return {
    year,
    startMonth: book.dues?.startMonth,
    monthlyFee: feeOf(year),
    missingFeeYear: startYear <= year && feeOf(startYear) === undefined ? startYear : undefined,
    referenceMonth: referenceIndex === undefined ? undefined : monthOf(referenceIndex),
    rows,
    summary: {
      behind: rows.filter((row) => row.group === 'behind').length,
      paid: rows.filter((row) => row.group === 'paid').length,
      resting: rows.filter((row) => row.group === 'resting').length,
    },
  }
}

// 회비 표 해 넘기기 범위: 시작 해와 올해 중 이른 해부터 늦은 해까지 (4절). 화면은 올해를 열고 장부 버튼도 올해로 세니 올해는 늘 든다.
// 보통은 시작 해 ~ 올해, 시작 달을 내년으로 정했으면 올해 ~ 내년. 시작 달이 없으면 올해만
export function duesYears(book: Book, today: Date): number[] {
  const thisYear = today.getFullYear()
  const startMonth = book.dues?.startMonth
  const startYear = startMonth === undefined ? thisYear : yearOf(parseYearMonth(startMonth))
  const first = Math.min(startYear, thisYear)
  const last = Math.max(startYear, thisYear)
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}

// 장부 [회비 표] 버튼 보조 글 "· 지난달까지 덜 낸 분 N명" (4절). 올해 1월이면 0
export function behindMemberCount(book: Book, today: Date): number {
  return duesTable(book, today.getFullYear(), today).summary.behind
}

// 낸 분을 안 적은 회비 (7절): 회비 기록 중 낸 분이 없고 날짜가 회비 표 시작 달 이후인 것. 시작 달이 없으면 없다
export function unassignedDues(book: Book): UnassignedDues {
  const startIndex = startIndexOf(book)
  const items = duesEntriesByDate(book).filter(
    ({ year, entry }) => monthIndex(year, entry.month) >= startIndex && (entry.payers ?? []).length === 0,
  )
  return { items, total: items.reduce((sum, { entry }) => sum + entry.amount, 0) }
}
