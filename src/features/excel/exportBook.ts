// 장부 → 엑셀 시트 배열 (SPEC-010 9절 "엑셀 내보내기", #167). SheetJS 를 모르는 순수 함수 — 파일은 어댑터(sheetjs.writeWorkbook)가 만든다.
// 회비내역 칸·낸 돈·덜 낸 돈은 회비 표 계산(domain/duesTable)을 그대로 쓰고 다시 계산하지 않는다.
// 내보낸 파일을 8절 읽는 규칙(readExcelBook)으로 다시 읽으면 기록·이월금·회원·낸 분이 같게 나오는 모양이다 (AC-33)
import { isDuesEntry } from '../../domain/dues'
import { duesTable, monthlyFeeOf, type DuesCell, type DuesRow } from '../../domain/duesTable'
import { byDate } from '../../domain/entryDate'
import type { Book, Entry, Ledger, Member } from '../../domain/types'
import type { SheetMerge, WriteCell, WriteSheet } from './sheet'

export interface ExcelExport {
  fileName: string
  sheets: WriteSheet[] // 새 해부터, 해마다 회비내역 → 입출금내역
  years: number[] // 담은 해, 오름차순
  hasDues: boolean // 회비내역 시트가 하나라도 있다
}

const MONTHS: readonly number[] = Array.from({ length: 12 }, (_, index) => index + 1)

function merge(r1: number, c1: number, r2: number, c2: number): SheetMerge {
  return { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } }
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

// 파일 이름에 쓸 수 있는 글자인가: 윈도·안드로이드 공통으로 못 쓰는 \ / : * ? " < > | 와 제어 문자를 뺀다
function isFileNameChar(char: string): boolean {
  return !'\\/:*?"<>|'.includes(char) && char.charCodeAt(0) >= 0x20
}

// "{장부 이름} 장부 YYYY-MM-DD.xlsx" (오늘 = 폰 날짜). 못 쓰는 글자를 빼고 이름이 비면 "장부 YYYY-MM-DD.xlsx"
export function exportFileName(bookName: string, today: Date): string {
  const name = [...bookName].filter(isFileNameChar).join('').replace(/\s+/g, ' ').trim()
  const date = `${today.getFullYear()}-${twoDigits(today.getMonth() + 1)}-${twoDigits(today.getDate())}`
  return `${name === '' ? '' : `${name} `}장부 ${date}.xlsx`
}

// 금액 글: 만 원 단위면 "12만원", 아니면 "15000원" (8절 낸 분 읽기 "이름(N만원)"·"이름(N원)")
function wonLabel(amount: number): string {
  return amount % 10_000 === 0 ? `${amount / 10_000}만원` : `${amount}원`
}

// 입출금내역 내용 칸 (9절):
// - 동아리 장부의 낸 분 있는 회비 → 이름을 쉼표로. 월 회비와 금액이 다른 분은 "이름(12만원)". 다시 읽을 때 월 회비를 이름만 쓴 줄의
//   한 분 몫으로 정하므로(8절) 이름만 쓰는 건 한 분 몫이 그 해 월 회비인 분뿐이다 — 그 해 월 회비가 없으면 모두 금액을 붙인다
// - 낸 분 없는 회비 → 엑셀 글이 있으면 그 글(낸 분 붙이기 대상으로 다시 읽힌다), 없으면 항목 이름
// - 그 밖(지출·회비가 아닌 수입, 가계부) → 항목 이름. 가계부는 숨긴 회원 값(동아리였던 장부)을 내보내지 않는다
function contentOf(entry: Entry, club: boolean, names: ReadonlyMap<string, string>, fee: number | undefined): string {
  if (!club || entry.type !== 'income') return entry.name
  const payers = (entry.payers ?? []).map((payer) => ({ name: names.get(payer.memberId), amount: payer.amount }))
  if (payers.length > 0 && payers.every((payer) => payer.name !== undefined)) {
    return payers.map(({ name, amount }) => (amount === fee ? name : `${name}(${wonLabel(amount)})`)).join(',')
  }
  return isDuesEntry(entry) && entry.sourceText !== undefined ? entry.sourceText : entry.name
}

// 그 달 기록 순서: 날짜 없는 예전 기록 먼저(적은 순), 그다음 날짜순 — 다시 읽을 때 일 칸이 빈 줄은 윗줄의 날을 이어받으므로 (8절)
function monthEntries(ledger: Ledger, month: number): Entry[] {
  const inMonth = ledger.entries.filter((entry) => entry.month === month)
  return [...byDate(inMonth.filter((entry) => entry.day === undefined)), ...byDate(inMonth.filter((entry) => entry.day !== undefined))]
}

// 열 너비(글자 수): 월·일 좁게, 내용 열을 넓게
const LEDGER_COLUMN_WIDTHS = [6, 6, 12, 40, 12, 14]

// 입출금내역 (9절): 1행 제목(A~F 병합) / 2행 머리 / 3행 "YYYY−1년 이월금"(A~E 병합) + 잔액 / 4행부터 기록.
// 잔액 칸은 수식(=F{윗줄}+C{줄}-E{줄})과 계산한 값 — 컴퓨터에서 고치면 따라 바뀌고 미리보기에서도 숫자가 보인다(ADR 009)
function ledgerSheet(book: Book, ledger: Ledger, names: ReadonlyMap<string, string>): WriteSheet {
  const club = book.kind === 'club'
  const fee = monthlyFeeOf(book, ledger.year)
  const rows: WriteCell[][] = [
    [`${ledger.year}년 ${book.name} 입출금 내역`],
    ['월', '일', '입금', null, '출금', '잔액'],
    [`${ledger.year - 1}년 이월금`, null, null, null, null, ledger.carryover],
  ]
  let balance = ledger.carryover
  for (const month of MONTHS) {
    monthEntries(ledger, month).forEach((entry, index) => {
      const income = entry.type === 'income' ? entry.amount : null
      const expense = entry.type === 'expense' ? entry.amount : null
      balance += (income ?? 0) - (expense ?? 0)
      const row = rows.length + 1 // 엑셀 줄 번호(1부터)
      rows.push([
        index === 0 ? month : null,
        entry.day ?? null,
        income,
        contentOf(entry, club, names, fee),
        expense,
        { formula: `F${row - 1}+C${row}-E${row}`, value: balance },
      ])
    })
  }
  return { name: `${ledger.year}년 입출금내역`, rows, merges: [merge(0, 0, 0, 5), merge(2, 0, 2, 4)], columnWidths: LEDGER_COLUMN_WIDTHS }
}

// 일부만 찬 칸: 만 원 단위면 "1만", 아니면 "5000원"
function partialLabel(paid: number): string {
  return paid % 10_000 === 0 ? `${paid / 10_000}만` : `${paid}원`
}

// 회비내역 칸 하나 (9절, 2절 1의 칸 상태). 다시 읽을 때 "/"·"-" 만 뜻이 있고 그 밖은 회원인 달이다 (8절)
// - 월 회비 모름(noFee)은 안 낸 빈칸과 다르게 "모름" — 덜 낸 돈에도 넣지 않는 칸이라 (#160 이 남긴 숙제)
// - 시작 달 전 칸은 계산하지 않는 달이라 빈칸. 쉬는 달은 시작 달 전이어도 "/" (회비 표는 시작 달 전을 쉬는 달보다 먼저 본다)
function duesMark(cell: DuesCell, member: Member, year: number): WriteCell {
  switch (cell.state) {
    case 'full':
      return '○'
    case 'partial':
      return partialLabel(cell.paid)
    case 'empty':
      return null
    case 'noFee':
      return '모름'
    case 'off':
      return '/'
    case 'notMember':
      return '-'
    case 'beforeStart':
      return member.off.includes(`${year}-${twoDigits(cell.month)}`) ? '/' : null
  }
}

// 회비 표 시작 달을 걸친 해의 제목 덧말: 시작 해보다 이른 해는 낸 돈만, 시작 해가 1월부터가 아니면 시작 달
function duesTitleNote(year: number, startMonth: string | undefined): string {
  if (startMonth === undefined) return ''
  const startYear = Number(startMonth.slice(0, 4))
  const month = Number(startMonth.slice(5, 7))
  const start = `회비 표는 ${startYear}년 ${month}월부터 계산해요`
  if (year < startYear) return ` (${start}. 이 해는 낸 돈만 적었어요)`
  return year === startYear && month > 1 ? ` (${start})` : ''
}

const DUES_HEADER: WriteCell[] = ['번호', '이름', ...MONTHS.map((month) => `${month}월`), '낸 돈', '덜 낸 돈']
const DUES_COLUMN_WIDTHS = [6, 10, ...MONTHS.map(() => 6), 10, 10]

function byName(a: DuesRow, b: DuesRow): number {
  return a.member.name.localeCompare(b.member.name, 'ko')
}

// 회비내역 (9절): 1행 제목 / 2행 머리 / 회비 표의 그 해 줄(그 해 회원이었거나 그 해 낸 돈이 있는 분)을 가나다 순으로.
// 낸 돈 = 그 해 이름별 합계, 덜 낸 돈 = 2절 5 기준 달까지(기준 달이 없는 해는 비움). 줄이 없는 해는 만들지 않는다
function duesSheet(book: Book, year: number, today: Date): WriteSheet | undefined {
  const table = duesTable(book, year, today)
  if (table.rows.length === 0) return undefined
  const rows = [...table.rows].sort(byName).map((row, index): WriteCell[] => [
    index + 1,
    row.member.name,
    ...row.cells.map((cell) => duesMark(cell, row.member, year)),
    row.yearPaid,
    table.referenceMonth === undefined ? null : row.shortfall,
  ])
  return {
    name: `${year}년 회비내역`,
    rows: [[`${year}년 ${book.name} 회비${duesTitleNote(year, table.startMonth)}`], DUES_HEADER, ...rows],
    merges: [merge(0, 0, 0, DUES_HEADER.length - 1)],
    columnWidths: DUES_COLUMN_WIDTHS,
  }
}

// 지금 장부의 모든 해를 한 파일로 (9절). 동아리·모임 장부는 회원 명단이 있으면 해마다 회비내역도
export function exportBook(book: Book, today: Date): ExcelExport {
  const ledgers = Object.values(book.ledgers).sort((a, b) => b.year - a.year)
  const names = new Map((book.members ?? []).map((member) => [member.id, member.name]))
  const withDues = book.kind === 'club' && names.size > 0
  const sheets = ledgers.flatMap((ledger) => {
    const dues = withDues ? duesSheet(book, ledger.year, today) : undefined
    return [...(dues ? [dues] : []), ledgerSheet(book, ledger, names)]
  })
  return {
    fileName: exportFileName(book.name, today),
    sheets,
    years: ledgers.map((ledger) => ledger.year).reverse(),
    hasDues: sheets.some((sheet) => sheet.name.endsWith('회비내역')),
  }
}

// "엑셀 파일을 저장했어요" 창의 담긴 것: "2013~2026년" / "해마다 입출금내역 · 회비내역" (한 해면 "해마다" 없이)
export function exportContents({ years, hasDues }: Pick<ExcelExport, 'years' | 'hasDues'>): { years: string; sheets: string } {
  const first = years[0]
  const last = years[years.length - 1]
  const kinds = hasDues ? '입출금내역 · 회비내역' : '입출금내역'
  // 해가 없는 장부(시트가 없어 파일을 만들지 못하는 경우라 화면에는 보이지 않지만) "undefined년" 이 되지 않게 (#180 리뷰)
  if (first === undefined || last === undefined) return { years: '기록 없음', sheets: kinds }
  return {
    years: first === last ? `${first}년` : `${first}~${last}년`,
    sheets: years.length > 1 ? `해마다 ${kinds}` : kinds,
  }
}
