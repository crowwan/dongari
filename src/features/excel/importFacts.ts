// 읽은 내용 확인 화면에 보이는 글 (SPEC-010 8절 "읽은 내용 확인", #166). 화면을 모르는 순수 함수
import type { StoredData } from '../../domain/types'
import { formatAmount } from '../../ui/money'
import type { LineNote } from './ledgerSheet'
import type { BalanceCheck, ExcelImportSummary, ImportedBook } from './readExcelBook'

// 직렬화한 저장 데이터가 이보다 크면 자동으로 지키기 상한(1MB, SPEC-006)에 가깝다고 경고한다 (8절)
export const KEEP_WARNING_BYTES = 900_000

// 장부 이름 칸 처음 값: 파일 이름에서 확장자를 뺀 것. 같은 이름 장부가 있으면 뒤에 " (엑셀)"
export function importedBookName(fileName: string, existingNames: readonly string[]): string {
  const base = fileName.trim().replace(/\.[^.]+$/, '').trim()
  return existingNames.some((name) => name.trim() === base) ? `${base} (엑셀)` : base
}

// 사실 카드 "해": 2013 ~ 2026년 / 14개 해 (years 는 오름차순)
export function yearsText(years: readonly number[]): { main: string; sub: string } {
  const first = years[0]
  const last = years[years.length - 1]
  return { main: first === last ? `${first}년` : `${first} ~ ${last}년`, sub: `${years.length}개 해` }
}

function yearSpan(from: number, to: number): string {
  return from === to ? `${from}년` : `${from}~${to}년`
}

// 사실 카드 "월 회비": 이어진 해의 같은 금액을 한 줄로 ("2013~2016년 10,000원"), 없는 해는 "정하지 않음"
export function feeLines(fees: ExcelImportSummary['monthlyFees']): string[] {
  const groups: { from: number; to: number; fee?: number }[] = []
  for (const { year, fee } of fees) {
    const last = groups[groups.length - 1]
    if (last && last.fee === fee) last.to = year
    else groups.push({ from: year, to: year, fee })
  }
  return groups.map(({ from, to, fee }) => `${yearSpan(from, to)} ${fee === undefined ? '정하지 않음' : `${formatAmount(fee)}원`}`)
}

export type BalanceCheckText = { kind: 'ok' } | { kind: 'none' } | { kind: 'differ'; title: string; items: string[] }

// 검산 줄: 맞춰 본 곳(엑셀 마지막 잔액, 다음 해 이월금)이 모두 같으면 맞음, 다르면 곳 수와 해·차이.
// 엑셀에 잔액이 하나도 없어 맞춰 볼 곳이 없으면 "맞아요"라고 하지 않는다
export function balanceCheckText(checks: readonly BalanceCheck[]): BalanceCheckText {
  const compared = checks.reduce(
    (count, check) => count + (check.excelBalance === undefined ? 0 : 1) + (check.nextCarryover === undefined ? 0 : 1),
    0,
  )
  if (compared === 0) return { kind: 'none' }
  const items = checks.flatMap(({ year, computed, excelBalance, nextCarryover }) => [
    ...(excelBalance !== undefined && excelBalance !== computed
      ? [`${year}년 마지막 잔액 ${formatAmount(Math.abs(excelBalance - computed))}원 차이`]
      : []),
    ...(nextCarryover !== undefined && nextCarryover !== computed
      ? [`${year + 1}년 이월금 ${formatAmount(Math.abs(nextCarryover - computed))}원 차이`]
      : []),
  ])
  if (items.length === 0) return { kind: 'ok' }
  return { kind: 'differ', title: `잔액을 맞춰 보니 ${items.length}곳이 달라요`, items }
}

// 아래 Caption "읽지 않은 것: …". 없으면 undefined
export function unreadSheetsText(unread: ExcelImportSummary['unreadSheets']): string | undefined {
  if (unread.length === 0) return undefined
  const names = unread.map(({ name, reason }) => (reason === 'shape' ? `${name.trim()}(모양이 달라요)` : name.trim()))
  return `읽지 않은 것: ${names.join(', ')}`
}

// 날짜를 바꾼 줄·읽지 못한 줄 목록의 자리: "2024년 2월" (달을 모르면 해만)
export function lineNoteLabel({ year, month }: LineNote): string {
  return month === undefined ? `${year}년` : `${year}년 ${month}월`
}

// 지금 데이터에 불러올 장부를 더해 직렬화한 크기가 경고 기준을 넘는가 (UTF-8 바이트, 자동으로 지키기와 같은 셈)
export function isNearKeepLimit(data: StoredData, book: ImportedBook): boolean {
  const after = { ...data, books: [...data.books, book] }
  return new TextEncoder().encode(JSON.stringify(after)).length > KEEP_WARNING_BYTES
}
