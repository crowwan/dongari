// 엑셀 → 가져올 장부 + 확인 화면 요약 (SPEC-010 8절 "읽는 규칙"). SheetJS 를 모르는 순수 함수 (ADR 009)
import type { EntryDeps } from '../../domain/ledger'
import type { Book, Entry, Ledger, Member, YearMonth } from '../../domain/types'
import { collectMembers, readDuesSheet, type DuesSheetRow } from './duesSheet'
import { readLedgerSheet, type LedgerLine, type LedgerSheetRead, type LineNote } from './ledgerSheet'
import { equalShare, matchPayers, splitPayers } from './payers'
import { compactText, type ExcelWorkbook } from './sheet'

// 엑셀로 새로 만들 장부의 내용 (이름·종류·번호는 #166 확인 화면이 붙인다)
export type ImportedBook = Required<Pick<Book, 'ledgers' | 'members' | 'dues'>>

// 읽지 않은 시트의 이유
// - shape: 입출금내역·회비내역 이름이지만 머리 줄·이월금 줄이 없다 ("모양이 달라 읽지 않은 시트")
// - year: 2013 전 시트 (2011·2012)
// - other: 그 밖의 시트(연락처·미수금내역·Sheet3), 같은 해 두 번째 시트, 같은 해 입출금내역이 없는 회비내역
export type UnreadSheetReason = 'shape' | 'year' | 'other'

// 해마다 검산: 이월금 + 수입 − 지출(computed)을 엑셀 마지막 잔액, 다음 해 이월금과 비교
export interface BalanceCheck {
  year: number
  computed: number
  excelBalance?: number // 잔액 열에 숫자가 없으면 없음
  nextCarryover?: number // 다음 해 시트가 없으면 없음
}

export interface BalanceMismatch {
  year: number
  against: 'excel-balance' | 'next-carryover'
  excel: number
  computed: number
}

// 읽은 내용 확인 화면에 보여 줄 사실 (SPEC-010 8절)
export interface ExcelImportSummary {
  sheetCount: number
  readSheets: string[]
  unreadSheets: { name: string; reason: UnreadSheetReason }[]
  years: number[] // 오름차순
  incomeCount: number
  expenseCount: number
  memberCount: number
  lastYearMemberCount: number // 마지막 해에 한 달이라도 회원이었던 분
  monthlyFees: { year: number; fee?: number }[]
  startMonth: YearMonth
  balanceChecks: BalanceCheck[]
  balanceMismatches: BalanceMismatch[]
  // 낸 분을 다 못 나눈 회비(모든 해). 그중 회비 표 시작 달 이후 것이 7절 카드(domain/duesTable.unassignedDues)에 모인다
  unassignedDuesCount: number
  changedDates: LineNote[] // 날짜를 바꾼 줄
  unreadLines: LineNote[] // 읽지 못한 줄
}

export type ExcelBookRead = { ok: true; book: ImportedBook; summary: ExcelImportSummary } | { ok: false; problem: 'no-sheets' }

// 2011·2012 년 시트는 모양이 달라 읽지 않는다 (SPEC-010 "읽는 규칙")
const FIRST_SUPPORTED_YEAR = 2013
const SHEET_NAME = /^(\d{4})년(입출금내역|회비내역)$/

type SheetStatus = { read: true } | { read: false; reason: UnreadSheetReason }

interface YearRead {
  year: number
  sheet: LedgerSheetRead
}

function sheetKind(name: string): { kind: 'ledger' | 'dues'; year: number } | undefined {
  const match = SHEET_NAME.exec(compactText(name))
  if (!match) return undefined
  return { kind: match[2] === '입출금내역' ? 'ledger' : 'dues', year: Number(match[1]) }
}

function statusOf(read: unknown): SheetStatus {
  return read === undefined ? { read: false, reason: 'shape' } : { read: true }
}

// 시트마다 읽기: 입출금내역을 먼저 읽고(2013 이후, 해마다 첫 시트), 회비내역은 같은 해 입출금내역을 읽었을 때만.
// 어디에도 걸리지 않은 시트는 'other'
function readSheets(workbook: ExcelWorkbook) {
  const kinds = workbook.sheets.map((sheet) => sheetKind(sheet.name))
  const statuses: SheetStatus[] = kinds.map(() => ({ read: false, reason: 'other' }))
  const ledgers = new Map<number, LedgerSheetRead>()
  const dues = new Map<number, DuesSheetRow[]>()

  workbook.sheets.forEach((sheet, index) => {
    const kind = kinds[index]
    if (kind?.kind !== 'ledger' || ledgers.has(kind.year)) return
    if (kind.year < FIRST_SUPPORTED_YEAR) {
      statuses[index] = { read: false, reason: 'year' }
      return
    }
    const read = readLedgerSheet(sheet, kind.year)
    if (read) ledgers.set(kind.year, read)
    statuses[index] = statusOf(read)
  })
  workbook.sheets.forEach((sheet, index) => {
    const kind = kinds[index]
    if (kind?.kind !== 'dues' || dues.has(kind.year)) return
    if (kind.year < FIRST_SUPPORTED_YEAR) {
      statuses[index] = { read: false, reason: 'year' }
      return
    }
    if (!ledgers.has(kind.year)) return
    const read = readDuesSheet(sheet)
    if (read) dues.set(kind.year, read)
    statuses[index] = statusOf(read)
  })

  const yearReads: YearRead[] = [...ledgers].map(([year, sheet]) => ({ year, sheet })).sort((a, b) => a.year - b.year)
  const duesSheets = [...dues].map(([year, rows]) => ({ year, rows })).sort((a, b) => a.year - b.year)
  return { statuses, yearReads, duesSheets }
}

// 가장 많이 나온 값. 같은 횟수면 작은 값 (큰 몫이 그 배수일 수 있게)
function mostCommon(values: readonly number[]): number | undefined {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: number | undefined
  for (const [value, count] of counts) {
    const bestCount = best === undefined ? 0 : (counts.get(best) ?? 0)
    if (best === undefined || count > bestCount || (count === bestCount && value < best)) best = value
  }
  return best
}

type Roster = ReadonlyMap<string, string>

// 해마다 월 회비 (8절 "월 회비"): 그 해 낸 분을 다 나눈 줄의 한 분 몫 중 가장 흔한 값, 없으면 전 해 값
function monthlyFees(yearReads: readonly YearRead[], roster: Roster): Map<number, number | undefined> {
  const fees = new Map<number, number | undefined>()
  let previous: number | undefined
  for (const { year, sheet } of yearReads) {
    const shares = sheet.lines.flatMap(({ income, content }) => {
      if (income === undefined) return []
      const match = matchPayers(content, roster)
      const share = match.kind === 'members' ? equalShare(match.members, income) : undefined
      return share === undefined ? [] : [share]
    })
    const fee = mostCommon(shares) ?? previous
    fees.set(year, fee)
    previous = fee
  }
  return fees
}

type EntryContent = Pick<Entry, 'type' | 'name' | 'amount' | 'payers' | 'sourceText'>

// 수입 줄 (8절 "낸 분"): 회원이 하나도 없으면 내용 글이 항목 이름(비면 "수입"),
// 회원이 섞였으면 항목 "회비" + 엑셀 글, 월 회비 배수 판정까지 맞으면 낸 분도
function incomeContent(content: string, amount: number, roster: Roster, fee: number | undefined): EntryContent {
  const match = matchPayers(content, roster)
  if (match.kind === 'no-member') return { type: 'income', name: content || '수입', amount }
  const dues: EntryContent = { type: 'income', name: '회비', amount, sourceText: content }
  const payers = match.kind === 'members' ? splitPayers(match.members, amount, fee) : undefined
  return payers ? { ...dues, payers } : dues
}

// 기록 만들기: 번호는 deps.createId, 적은 시각은 deps.now() 에서 기록마다 1ms 씩 늘린다(같은 날 기록이 엑셀 줄 순서대로)
function entryMaker(deps: EntryDeps) {
  const base = deps.now().getTime()
  let order = 0
  return (line: LedgerLine, content: EntryContent): Entry => {
    const createdAt = new Date(base + order).toISOString()
    order += 1
    const dated = line.day === undefined ? {} : { day: line.day }
    return { id: deps.createId(), month: line.month, ...dated, ...content, createdAt }
  }
}

function yearMonth(year: number, month: number): YearMonth {
  return `${year}-${String(month).padStart(2, '0')}`
}

function sumOf(entries: readonly Entry[], type: Entry['type']): number {
  return entries.reduce((sum, entry) => (entry.type === type ? sum + entry.amount : sum), 0)
}

// 엑셀 시트들 → 가져올 장부 + 확인 화면 요약. 기록·회원 번호와 적은 시각은 deps 로 받는다(테스트에서 고정).
// 아무것도 저장하지 않는다 — 저장은 확인 화면의 [새 장부 만들기] (#166)
export function readExcelBook(workbook: ExcelWorkbook, deps: EntryDeps): ExcelBookRead {
  const { statuses, yearReads, duesSheets } = readSheets(workbook)
  if (yearReads.length === 0) return { ok: false, problem: 'no-sheets' }
  const lastYear = yearReads[yearReads.length - 1].year
  const startMonth = yearMonth(lastYear, 1)

  const members: Member[] = (duesSheets.length === 0 ? [] : collectMembers(duesSheets, lastYear)).map((draft) => ({
    id: deps.createId(),
    ...draft,
  }))
  const roster = new Map(members.map((member) => [member.name, member.id]))

  // 월 회비를 먼저 정하고, 그 배수 판정으로 낸 분을 나눈다 (8절 "월 회비": 배수 판정은 이 값이 정해진 뒤 한 번 더)
  const fees = monthlyFees(yearReads, roster)
  const makeEntry = entryMaker(deps)
  const ledgers: Record<string, Ledger> = {}
  for (const { year, sheet } of yearReads) {
    const fee = fees.get(year)
    // 한 줄에 입금·출금이 다 있으면 수입·지출 두 기록 (지출은 내용 글이 항목 이름, 비면 "지출")
    const entries = sheet.lines.flatMap((line) => [
      ...(line.income === undefined ? [] : [makeEntry(line, incomeContent(line.content, line.income, roster, fee))]),
      ...(line.expense === undefined ? [] : [makeEntry(line, { type: 'expense', name: line.content || '지출', amount: line.expense })]),
    ])
    const ledger: Ledger = { year, carryover: sheet.carryover, entries }
    if (fee !== undefined) ledger.monthlyFee = fee
    ledgers[String(year)] = ledger
  }

  // 검산 (8절 "검산"): 이월금은 엑셀 값을 그대로 쓰고, 다른 곳만 알린다
  const balanceChecks = yearReads.map(({ year, sheet }): BalanceCheck => {
    const { carryover, entries } = ledgers[String(year)]
    const check: BalanceCheck = { year, computed: carryover + sumOf(entries, 'income') - sumOf(entries, 'expense') }
    if (sheet.lastBalance !== undefined) check.excelBalance = sheet.lastBalance
    const next = ledgers[String(year + 1)]
    if (next) check.nextCarryover = next.carryover
    return check
  })
  const balanceMismatches = balanceChecks.flatMap(({ year, computed, excelBalance, nextCarryover }) => {
    const mismatches: BalanceMismatch[] = []
    if (excelBalance !== undefined && excelBalance !== computed) mismatches.push({ year, against: 'excel-balance', excel: excelBalance, computed })
    if (nextCarryover !== undefined && nextCarryover !== computed) mismatches.push({ year, against: 'next-carryover', excel: nextCarryover, computed })
    return mismatches
  })

  const allEntries = Object.values(ledgers).flatMap((ledger) => ledger.entries)
  const lastYearEnd = yearMonth(lastYear, 12)
  const summary: ExcelImportSummary = {
    sheetCount: workbook.sheets.length,
    readSheets: workbook.sheets.filter((_, index) => statuses[index].read).map((sheet) => sheet.name),
    unreadSheets: workbook.sheets.flatMap((sheet, index) => {
      const status = statuses[index]
      return status.read ? [] : [{ name: sheet.name, reason: status.reason }]
    }),
    years: yearReads.map(({ year }) => year),
    incomeCount: allEntries.filter((item) => item.type === 'income').length,
    expenseCount: allEntries.filter((item) => item.type === 'expense').length,
    memberCount: members.length,
    lastYearMemberCount: members.filter((member) => member.joined <= lastYearEnd && (member.left === undefined || member.left > startMonth)).length,
    monthlyFees: yearReads.map(({ year }) => {
      const fee = fees.get(year)
      return fee === undefined ? { year } : { year, fee }
    }),
    startMonth,
    balanceChecks,
    balanceMismatches,
    // 낸 분을 다 못 나눈 회비 = 엑셀 글은 있는데 낸 분이 없는 기록 (7절 "낸 분 붙이기" 대상)
    unassignedDuesCount: allEntries.filter((item) => item.sourceText !== undefined && item.payers === undefined).length,
    changedDates: yearReads.flatMap(({ sheet }) => sheet.changedDates),
    unreadLines: yearReads.flatMap(({ sheet }) => sheet.unreadLines),
  }

  return { ok: true, book: { ledgers, members, dues: { startMonth } }, summary }
}
