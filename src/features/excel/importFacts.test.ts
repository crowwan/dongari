import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type StoredData } from '../../domain/types'
import { ledger, storedWith } from '../../test/ledgerFixtures'
import {
  balanceCheckText,
  feeLines,
  importedBookName,
  isNearKeepLimit,
  KEEP_WARNING_BYTES,
  lineNoteLabel,
  unreadSheetsText,
  yearsText,
} from './importFacts'
import type { BalanceCheck } from './readExcelBook'

describe('SPEC-010 읽은 내용 확인 화면에 보이는 글 (8절 "읽은 내용 확인", #166)', () => {
  it('AC-28 장부 이름은 파일 이름에서 확장자를 뺀 것이고, 같은 이름 장부가 있으면 뒤에 " (엑셀)"을 붙인다', () => {
    expect(importedBookName('지어낸모임.xlsx', [])).toBe('지어낸모임')
    expect(importedBookName(' 옛 장부 2026.XLS ', ['우리집 가계부'])).toBe('옛 장부 2026')
    expect(importedBookName('지어낸모임.xlsx', ['우리집 가계부', ' 지어낸모임 '])).toBe('지어낸모임 (엑셀)')
    expect(importedBookName('확장자없음', [])).toBe('확장자없음')
  })

  it('해는 처음 ~ 마지막 해와 해 수, 한 해면 그 해만', () => {
    expect(yearsText([2013, 2014, 2026])).toEqual({ main: '2013 ~ 2026년', sub: '3개 해' })
    expect(yearsText([2026])).toEqual({ main: '2026년', sub: '1개 해' })
  })

  it('월 회비는 이어진 해의 같은 금액을 한 줄로 묶고, 없는 해는 "정하지 않음"', () => {
    expect(
      feeLines([
        { year: 2013 },
        { year: 2014, fee: 10_000 },
        { year: 2015, fee: 10_000 },
        { year: 2016, fee: 20_000 },
        { year: 2018, fee: 20_000 },
      ]),
    ).toEqual(['2013년 정하지 않음', '2014~2015년 10,000원', '2016~2018년 20,000원'])
  })

  it('AC-28 검산: 맞춰 볼 곳이 모두 맞으면 맞음, 다르면 곳 수와 해·차이, 맞춰 볼 엑셀 잔액이 없으면 없음', () => {
    const matched: BalanceCheck[] = [
      { year: 2024, computed: 30_000, excelBalance: 30_000, nextCarryover: 30_000 },
      { year: 2025, computed: 50_000, excelBalance: 50_000 },
    ]
    expect(balanceCheckText(matched)).toEqual({ kind: 'ok' })

    const differ: BalanceCheck[] = [
      { year: 2024, computed: 30_000, excelBalance: 30_004, nextCarryover: 18_000 },
      { year: 2025, computed: 50_000, excelBalance: 50_000 },
    ]
    expect(balanceCheckText(differ)).toEqual({
      kind: 'differ',
      title: '잔액을 맞춰 보니 2곳이 달라요',
      items: ['2024년 마지막 잔액 4원 차이', '2025년 이월금 12,000원 차이'],
    })

    expect(balanceCheckText([{ year: 2025, computed: 50_000 }])).toEqual({ kind: 'none' })
  })

  it('읽지 않은 시트는 이름을 늘어놓고, 모양이 달라 읽지 않은 시트에는 이유를 붙인다', () => {
    expect(unreadSheetsText([])).toBeUndefined()
    expect(
      unreadSheetsText([
        { name: '연락처', reason: 'other' },
        { name: '2012년 입출금내역', reason: 'year' },
        { name: '2016년 입출금내역', reason: 'shape' },
      ]),
    ).toBe('읽지 않은 것: 연락처, 2012년 입출금내역, 2016년 입출금내역(모양이 달라요)')
  })

  it('날짜를 바꾼 줄·읽지 못한 줄 목록의 자리는 해·달(달을 모르면 해만)', () => {
    expect(lineNoteLabel({ year: 2024, month: 2, text: '2 31 20000' })).toBe('2024년 2월')
    expect(lineNoteLabel({ year: 2024, text: '2023년 이월금 모름' })).toBe('2024년')
  })

  it('AC-28 지금 장부에 불러올 장부를 더한 저장 데이터가 900KB 를 넘으면 자동으로 지키기 경고를 한다', () => {
    const data: StoredData = storedWith(ledger([[3, 'income', '회비', 10_000]]))
    const small = { ledgers: { '2025': ledger([[1, 'income', '회비', 10_000]], { year: 2025 }) }, members: [], dues: { startMonth: '2025-01' } }
    // 한글 한 글자는 UTF-8 로 3바이트: 이 이름 하나로 900KB
    const big = { ...small, ledgers: { '2025': ledger([[1, 'income', '가'.repeat(KEEP_WARNING_BYTES / 3), 10_000]], { year: 2025 }) } }

    expect(KEEP_WARNING_BYTES).toBe(900_000)
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(isNearKeepLimit(data, small)).toBe(false)
    expect(isNearKeepLimit(data, big)).toBe(true)
  })
})
