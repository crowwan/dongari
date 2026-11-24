// 엑셀로 기존 장부에 넣기 (SPEC-010 8절 "다른 장부에 넣기", F4, #169). 화면을 모르는 순수 함수 — 엑셀 조각에만 든다.
// 고른 해는 그 해 장부를 엑셀 것으로 통째로 바꾸고(이월금·기록·월 회비), 회원은 이름으로 합친다.
// 결과는 저장 형식 검사(v4)를 늘 통과해야 한다: 넣는 해 기록의 낸 분은 모두 명단에 있는 번호로 바꿔 끼운다
import { splitYearMonth, yearMonth } from '../../domain/members'
import type { Book, Entry, Ledger, Member } from '../../domain/types'
import type { ImportedBook } from './readExcelBook'

// "어느 해를 넣을까요?" 해 줄 하나: 엑셀 기록 수와 그 해 지금 앱 기록 수
export interface MergeYearRow {
  year: number
  excelCount: number
  appCount: number // 0 이면 새로 넣는 해 (장부만 있고 기록이 없는 해도)
}

// 화면이 App 에 넘기는 넣기: 어느 장부에 어느 해를, 그 장부를 바꾸는 법 (App·useLedger 는 지금 데이터의 그 장부에 적용한다)
export interface ExcelMerge {
  bookId: string
  years: readonly number[]
  apply: (book: Book) => Book
}

// 엑셀 해마다 (오름차순)
export function mergeYearRows(book: Book, imported: ImportedBook): MergeYearRow[] {
  return Object.values(imported.ledgers)
    .sort((a, b) => a.year - b.year)
    .map((ledger) => ({
      year: ledger.year,
      excelCount: ledger.entries.length,
      appCount: book.ledgers[String(ledger.year)]?.entries.length ?? 0,
    }))
}

// 처음 고른 해 (시안 결정 E-4): 앱 기록이 없는 해만. 앱 기록이 있는 해는 사람이 골라야 바뀐다
export function defaultMergeYears(rows: readonly MergeYearRow[]): number[] {
  return rows.filter((row) => row.appCount === 0).map((row) => row.year)
}

// 그 해 한 달이라도 회원이었나 (들어온 달 ≤ 그 해 12월, 그만둔 달 > 그 해 1월)
function memberInYear(member: Member, year: number): boolean {
  return member.joined <= yearMonth(year, 12) && (member.left === undefined || member.left > yearMonth(year, 1))
}

function chosenLedgers(imported: ImportedBook, years: readonly number[]): Ledger[] {
  return years.flatMap((year) => {
    const ledger = imported.ledgers[String(year)]
    return ledger ? [ledger] : []
  })
}

type MemberMatch = { excel: Member; app: Member | undefined }

// 넣을 엑셀 회원과 같은 이름(앞뒤 공백 무시)의 앱 회원 (같은 이름이 둘이면 명단 앞쪽 분).
// 넣는 해에 회원이었거나 넣는 해 기록에 낸 분으로 나오는 분만 — 다른 해에만 있는 분까지 명단에 늘리지 않는다
function matchMembers(book: Book, imported: ImportedBook, years: readonly number[]): MemberMatch[] {
  const payerIds = new Set(
    chosenLedgers(imported, years).flatMap((ledger) => ledger.entries.flatMap((entry) => (entry.payers ?? []).map((payer) => payer.memberId))),
  )
  const appMembers = book.members ?? []
  return imported.members
    .filter((excel) => payerIds.has(excel.id) || years.some((year) => memberInYear(excel, year)))
    .map((excel) => ({ excel, app: appMembers.find((app) => app.name.trim() === excel.name.trim()) }))
}

const byKorean = (a: string, b: string) => a.localeCompare(b, 'ko')

// 확인 창 "N개 해를 넣을까요?" 에 보일 것: 바꾸는 해(앱 기록이 있는 해), 합칠 이름, 새로 넣는 이름(가나다), 넣는 엑셀 기록 수
export interface MergePlan {
  replaced: MergeYearRow[]
  mergedNames: string[]
  addedNames: string[]
  entryCount: number
}

export function mergePlan(book: Book, imported: ImportedBook, years: readonly number[]): MergePlan {
  const chosen = new Set(years)
  const rows = mergeYearRows(book, imported).filter((row) => chosen.has(row.year))
  const matches = matchMembers(book, imported, years)
  return {
    replaced: rows.filter((row) => row.appCount > 0),
    mergedNames: matches.flatMap(({ app }) => (app ? [app.name] : [])).sort(byKorean),
    addedNames: matches.flatMap(({ excel, app }) => (app ? [] : [excel.name.trim()])).sort(byKorean),
    entryCount: rows.reduce((sum, row) => sum + row.excelCount, 0),
  }
}

// 고른 해를 엑셀 것으로 바꾼 장부 (8절 "넣는 해").
// - 고른 해: 그 해 장부를 엑셀 것으로 통째로(이월금·기록·월 회비). 고르지 않은 해는 앱·엑셀 어느 쪽도 손대지 않는다
// - 회원: 같은 이름이면 앱 회원으로 합친다 — 들어온 달·그만둔 달·시작할 때 남은 돈은 앱 값(사람이 앱에서 고친 값),
//   해에 묶인 쉬는 달만 넣는 해 안은 엑셀 값(그 해를 통째로 엑셀 것으로 바꾸므로). 없는 이름은 새 번호로 엑셀 값 그대로 넣는다
// - 회비 표 시작 달은 그 장부 값 그대로, 없으면 마지막으로 넣은 해의 1월. 새 회원의 시작할 때 남은 돈(엑셀 미수합계)은
//   엑셀이 정한 시작 달 앞까지의 셈이라 시작 달이 같을 때만 넣는다
export function mergeImportedYears(book: Book, imported: ImportedBook, years: readonly number[], deps: { createId: () => string }): Book {
  const ledgers = chosenLedgers(imported, years)
  if (ledgers.length === 0) return book
  const chosen = new Set(ledgers.map((ledger) => ledger.year))
  const inChosenYear = (month: string) => chosen.has(splitYearMonth(month).year)
  const dues = book.dues ?? { startMonth: yearMonth(Math.max(...chosen), 1) }
  const keepOpening = dues.startMonth === imported.dues.startMonth

  // 엑셀 회원 번호 → 앱 명단의 번호
  const ids = new Map<string, string>()
  const offFromExcel = new Map<string, string[]>()
  const added: Member[] = []
  for (const { excel, app } of matchMembers(book, imported, [...chosen])) {
    if (app) {
      ids.set(excel.id, app.id)
      offFromExcel.set(app.id, excel.off.filter(inChosenYear))
      continue
    }
    const { opening, ...rest } = excel
    const created: Member = { ...rest, id: deps.createId(), name: excel.name.trim() }
    if (keepOpening && opening !== undefined) created.opening = opening
    ids.set(excel.id, created.id)
    added.push(created)
  }

  const members = (book.members ?? []).map((app) => {
    const excelOff = offFromExcel.get(app.id)
    if (!excelOff) return app
    return { ...app, off: [...new Set([...app.off.filter((month) => !inChosenYear(month)), ...excelOff])].sort() }
  })
  const remap = (entry: Entry): Entry =>
    entry.payers ? { ...entry, payers: entry.payers.map((payer) => ({ ...payer, memberId: ids.get(payer.memberId) ?? payer.memberId })) } : entry

  return {
    ...book,
    ledgers: { ...book.ledgers, ...Object.fromEntries(ledgers.map((ledger) => [String(ledger.year), { ...ledger, entries: ledger.entries.map(remap) }])) },
    members: [...members, ...added],
    dues,
  }
}
