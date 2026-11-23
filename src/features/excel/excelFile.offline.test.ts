import { afterEach, describe, expect, it, vi } from 'vitest'

// SheetJS 조각을 받지 못한 상황(오프라인·서비스 워커가 아직 못 받음·배포 뒤 옛 조각): 동적 import 가 실패한다.
// 모듈 대체가 다른 테스트에 번지지 않게 이 파일에서만 한다
afterEach(() => {
  vi.doUnmock('xlsx')
  vi.resetModules()
})

const deps = { createId: () => 'id', now: () => new Date('2026-11-23T00:00:00.000Z') }

// .xlsx 머리(zip)를 가진 멀쩡해 보이는 파일
const xlsxLike = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer

describe('SPEC-010 엑셀 라이브러리를 받지 못함 (8절 예외)', () => {
  it('엑셀 라이브러리를 받지 못하면 "엑셀이 아니에요" 가 아니라 받지 못함(load-failed)으로 알린다', async () => {
    vi.resetModules()
    vi.doMock('xlsx', () => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })
    const { readExcelFile } = await import('./excelFile')

    const result = await readExcelFile({ name: '장부.xlsx', size: xlsxLike.byteLength, arrayBuffer: async () => xlsxLike }, deps)

    expect(result).toEqual({ ok: false, problem: 'load-failed' })
  })

  it('AC-36 연습용 엑셀(시트 배열)은 SheetJS 를 받지 못해도 읽힌다 — 연습에서는 SheetJS 를 부르지 않는다 (SPEC-010 10절)', async () => {
    vi.resetModules()
    vi.doMock('xlsx', () => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })
    const { readExcelSource } = await import('./excelFile')

    const club = await readExcelSource({ practice: 'club' }, deps)
    const household = await readExcelSource({ practice: 'household' }, deps)

    expect(club.ok && club.summary.memberCount).toBe(3)
    expect(household.ok && household.summary.years).toEqual([2025, 2026])
  })

  it('엑셀 파일을 만들 때도 받지 못함을 따로 된 오류로 알린다 (#167 내보내기)', async () => {
    vi.resetModules()
    vi.doMock('xlsx', () => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })
    const { writeWorkbook, SheetJsLoadError } = await import('./sheetjs')

    await expect(writeWorkbook([])).rejects.toBeInstanceOf(SheetJsLoadError)
  })
})
