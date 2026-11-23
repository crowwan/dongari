// 연습용 엑셀 (SPEC-010 10절): 연습 ⑥(가계부 ⑤) 에서 파일 고르기 창 대신 읽는 지어낸 엑셀. 파일(.xlsx)이 아니라 시트 배열로 만든다.
// - 읽는 규칙(readExcelBook)은 시트 배열만 알아서 SheetJS 를 연습 중에 받지 않는다 (진짜 파일만 SheetJS 가 시트 배열로 바꾼다)
// - 엑셀 조각(ExcelImportScreen)만 이 파일을 불러 첫 화면 번들에 들지 않고, 그 조각은 서비스 워커가 미리 받아 오프라인에서도 열린다
// - 해를 연습하는 날의 작년·올해로 맞춘다(올해는 이번 달까지)
// 이름은 모두 지어낸 것 (예시 회원 PRACTICE_MEMBERS)
import type { BookKind } from '../../domain/types'
import type { ExcelWorkbook, SheetCell, SheetData, SheetMerge } from '../excel/sheet'
import { PRACTICE_MEMBERS, PRACTICE_MONTHLY_FEE } from './practiceScript'

// 입출금내역 한 줄: 월, 일, 입금, 내용, 출금
type Line = readonly [month: number, day: number, income: number | null, content: string, expense: number | null]

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

function merge(r1: number, c1: number, r2: number, c2: number): SheetMerge {
  return { s: { r: r1, c: c1 }, e: { r: r2, c: c2 } }
}

// 입출금내역 시트 (앱이 내보낸 9절 모양): 1행 제목 / 2행 머리 [월, 일, 입금, (내용), 출금, 잔액] / 3행 "작년 이월금" + 잔액 / 4행부터 기록.
// 잔액은 줄마다 이어 계산해 검산이 맞는다. 끝 잔액을 같이 돌려줘 다음 해 이월금으로 쓴다
function ledgerSheet(year: number, title: string, carryover: number, lines: readonly Line[]): { sheet: SheetData; balance: number } {
  let balance = carryover
  const rows = lines.map(([month, day, income, content, expense]): SheetCell[] => {
    balance += (income ?? 0) - (expense ?? 0)
    return [month, day, income, content, expense, balance]
  })
  const sheet: SheetData = {
    name: `${year}년 입출금내역`,
    rows: [
      [`${year}년 ${title} 입출금 내역`, null, null, null, null, null],
      ['월', '일', '입금', null, '출금', '잔액'],
      [`${year - 1}년 이월금`, null, null, null, null, carryover],
      ...rows,
    ],
    merges: [merge(0, 0, 0, 5), merge(2, 0, 2, 4)],
  }
  return { sheet, balance }
}

// 회비내역 시트 (9절 모양): 1행 제목 / 2행 머리 [번호, 이름, 1월 … 12월, 낸 돈, 덜 낸 돈] / 회원 줄. 낸 달까지 ○, 그 뒤는 빈칸
function duesSheet(year: number, title: string, paidMonths: number): SheetData {
  const header: SheetCell[] = ['번호', '이름', ...MONTHS.map((month) => `${month}월`), '낸 돈', '덜 낸 돈']
  const members = PRACTICE_MEMBERS.map(({ name }, index): SheetCell[] => [
    index + 1,
    name,
    ...MONTHS.map((month) => (month <= paidMonths ? '○' : null)),
    paidMonths * PRACTICE_MONTHLY_FEE,
    0,
  ])
  return { name: `${year}년 회비내역`, rows: [[`${year}년 ${title} 회비`], header, ...members], merges: [merge(0, 0, 0, 13)] }
}

// 동아리: 달마다 세 분이 같이 낸 회비(이름을 쉼표로) + 가끔 간식비·대관료
function clubLines(months: readonly number[], expenses: Readonly<Record<number, readonly [string, number]>>): Line[] {
  const names = PRACTICE_MEMBERS.map((member) => member.name).join(',')
  return months.flatMap((month): Line[] => {
    const dues: Line = [month, 5, PRACTICE_MEMBERS.length * PRACTICE_MONTHLY_FEE, names, null]
    const expense = expenses[month]
    return expense ? [dues, [month, 20, null, expense[0], expense[1]]] : [dues]
  })
}

// 가계부: 달마다 용돈 수입 + 장보기·관리비 지출
function householdLines(months: readonly number[]): Line[] {
  return months.flatMap((month): Line[] => [
    [month, 1, 300_000, '용돈', null],
    [month, 10, null, '장보기', 120_000],
    [month, 25, null, '관리비', 80_000],
  ])
}

const CLUB_TITLE = '연습 모임'
const HOUSEHOLD_TITLE = '연습 가계부'

// 연습하는 날의 작년(1~12월)과 올해(1월~이번 달) 두 해 치
export function practiceWorkbook(kind: BookKind, now: Date): ExcelWorkbook {
  const year = now.getFullYear()
  const thisYearMonths = MONTHS.slice(0, now.getMonth() + 1)
  if (kind === 'household') {
    const last = ledgerSheet(year - 1, HOUSEHOLD_TITLE, 100_000, householdLines(MONTHS))
    const current = ledgerSheet(year, HOUSEHOLD_TITLE, last.balance, householdLines(thisYearMonths))
    return { sheets: [last.sheet, current.sheet] }
  }
  const last = ledgerSheet(year - 1, CLUB_TITLE, 50_000, clubLines(MONTHS, { 3: ['간식비', 20_000], 6: ['대관료', 50_000], 12: ['송년회', 90_000] }))
  const current = ledgerSheet(year, CLUB_TITLE, last.balance, clubLines(thisYearMonths, { 1: ['간식비', 15_000] }))
  return {
    sheets: [last.sheet, duesSheet(year - 1, CLUB_TITLE, 12), current.sheet, duesSheet(year, CLUB_TITLE, thisYearMonths.length)],
  }
}
