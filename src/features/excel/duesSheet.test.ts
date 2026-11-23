import { describe, expect, it } from 'vitest'
import { duesSheet, months } from '../../test/excelFixtures'
import { collectMembers, readDuesSheet, type DuesSheetRow } from './duesSheet'
import type { SheetCell, SheetData } from './sheet'

function rowsOf(sheet: SheetData): DuesSheetRow[] {
  const rows = readDuesSheet(sheet)
  if (!rows) throw new Error('회비내역 시트를 읽지 못했다')
  return rows
}

// 해마다 회비내역 시트 하나씩 → 회원 (회비 표 시작 해 = 마지막 해)
function membersOf(sheets: readonly { year: number; rows: readonly (readonly SheetCell[])[]; unpaidColumn?: boolean }[]) {
  const read = sheets.map(({ year, rows, unpaidColumn }) => ({ year, rows: rowsOf(duesSheet(year, rows, { unpaidColumn })) }))
  return collectMembers(read, Math.max(...sheets.map((sheet) => sheet.year)))
}

describe('SPEC-010 엑셀 회비내역 시트 읽기 — 회원 (8절 "회원")', () => {
  it('AC-24 번호 열이 숫자인 줄에서 이름을 모은다 (앞뒤 공백 무시, 번호 없는 줄·합계 줄은 건너뜀)', () => {
    const rows = rowsOf(
      duesSheet(2025, [
        [1, ' 강민지 ', ...months(0)],
        ['2', '김도윤', ...months(0)],
        [null, '메모', ...months(null)],
        ['합계', null, ...months(30_000)],
        [3, '', ...months(0)],
      ]),
    )

    expect(rows.map((row) => row.name)).toEqual(['강민지', '김도윤'])
  })

  it('AC-24 여러 해에 나온 같은 이름은 한 회원이다', () => {
    const members = membersOf([
      { year: 2024, rows: [[1, '강민지', ...months(0)]] },
      { year: 2025, rows: [[1, '강민지 ', ...months(0)], [2, '김도윤', ...months(0)]] },
    ])

    expect(members.map((member) => member.name)).toEqual(['강민지', '김도윤'])
  })

  it('AC-24 들어온 달 = 이름이 처음 나온 해에서 "/"가 아닌 첫 달 (기본 그 해 1월)', () => {
    const members = membersOf([
      { year: 2024, rows: [[1, '강민지', ...months(0)], [2, '김도윤', ...months(0, { 1: '/', 2: '/', 3: '/' })]] },
      { year: 2025, rows: [[1, '강민지', ...months(0)], [2, '김도윤', ...months(0)], [3, '이서준', ...months(null)]] },
    ])

    expect(members.map(({ name, joined }) => [name, joined])).toEqual([
      ['강민지', '2024-01'],
      ['김도윤', '2024-04'],
      ['이서준', '2025-01'],
    ])
  })

  it('AC-24 쉬는 달 = 들어온 달과 그만둔 달 사이의 "/" 칸 (여러 해)', () => {
    const [member] = membersOf([
      { year: 2024, rows: [[1, '강민지', ...months(0, { 11: '/', 12: ' / ' })]] },
      { year: 2025, rows: [[1, '강민지', ...months(0, { 1: '/' })]] },
    ])

    expect(member.off).toEqual(['2024-11', '2024-12', '2025-01'])
  })

  it('AC-24 그만둔 달 = 마지막으로 나온 해의 다음 해 1월, 마지막 해에 있으면 그만두지 않음', () => {
    const members = membersOf([
      { year: 2023, rows: [[1, '강민지', ...months(0)], [2, '김도윤', ...months(0)]] },
      { year: 2024, rows: [[1, '강민지', ...months(0, { 12: '/' })]] },
      { year: 2025, rows: [[1, '김도윤', ...months(0)]] },
    ])

    expect(members.map(({ name, left }) => [name, left])).toEqual([
      ['강민지', '2025-01'],
      ['김도윤', undefined],
    ])
    // 그만두기 전 해의 쉬는 달은 그대로 남는다
    expect(members[0].off).toEqual(['2024-12'])
    expect(members[1]).not.toHaveProperty('left')
  })

  it('"-" 칸(앱이 내보낸 엑셀의 회원 아닌 달, 9절): 앞쪽은 들어오기 전, 마지막 해 뒤쪽은 그만둔 뒤로 본다', () => {
    const [member] = membersOf([
      { year: 2024, rows: [[1, '강민지', ...months(0, { 1: '-', 2: '-', 3: '/' })]] },
      { year: 2025, rows: [[1, '강민지', ...months('-', { 1: 0, 2: '/', 3: 0 })]] },
    ])

    expect(member).toEqual({ name: '강민지', joined: '2024-04', left: '2025-04', off: ['2025-02'] })
  })

  it('AC-24 ○(숫자 0)·금액 칸은 읽지 않는다 — 들어온 달·쉬는 달에 영향이 없다', () => {
    const [member] = membersOf([{ year: 2025, rows: [[1, '강민지', ...months('○', { 1: 0, 2: 10_000, 3: '1만' })]] }])

    expect(member).toEqual({ name: '강민지', joined: '2025-01', off: [] })
  })

  it.each([
    ['"27만원"', '27만원', -270_000],
    ['"27만"', '27만', -270_000],
    ['"270,000원"', '270,000원', -270_000],
    ['숫자', 50_000, -50_000],
  ] as const)('AC-24 시작 해 회비내역의 "미수합계"(%s)를 시작할 때 덜 낸 돈으로 읽는다', (_label, unpaid, opening) => {
    const [member] = membersOf([{ year: 2025, rows: [[1, '강민지', ...months(0), unpaid]], unpaidColumn: true }])

    expect(member.opening).toBe(opening)
  })

  it('AC-24 미수합계가 비었거나 0 이거나 금액으로 읽을 수 없으면 시작할 때 남은 돈은 없다(0)', () => {
    const members = membersOf([
      {
        year: 2025,
        rows: [
          [1, '강민지', ...months(0), null],
          [2, '김도윤', ...months(0), 0],
          [3, '이서준', ...months(0), '모름'],
        ],
        unpaidColumn: true,
      },
    ])

    expect(members.map((member) => member.opening)).toEqual([undefined, undefined, undefined])
  })

  it('AC-24 미수합계는 회비 표 시작 해(마지막 해) 시트의 값만 쓴다', () => {
    const [member] = membersOf([
      { year: 2024, rows: [[1, '강민지', ...months(0), '10만원']], unpaidColumn: true },
      { year: 2025, rows: [[1, '강민지', ...months(0)]] },
    ])

    expect(member).not.toHaveProperty('opening')
  })

  it('머리 줄(번호·이름)이 없으면 모양이 다른 시트로 보고 읽지 않는다', () => {
    const sheet: SheetData = { name: '2025년 회비내역', rows: [['이름', '1월'], ['강민지', 0]], merges: [] }

    expect(readDuesSheet(sheet)).toBeUndefined()
  })
})
