import * as XLSX from 'xlsx'
import { describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../domain/types'
import { createBackup } from '../../storage/backup'
import { duesSheet, ledgerSheet, months, otherSheet } from '../../test/excelFixtures'
import { ledger, storedWith } from '../../test/ledgerFixtures'
import { EXCEL_FILE_MAX_BYTES, isExcelBytes, readExcelFile, type PickedFile } from './excelFile'
import type { SheetData } from './sheet'
import { writeWorkbook } from './sheetjs'

const deps = { createId: () => crypto.randomUUID(), now: () => new Date('2026-11-23T00:00:00.000Z') }

function picked(name: string, bytes: ArrayBuffer): PickedFile {
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes }
}

function textBytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer
}

async function xlsxFile(name: string, ...sheets: SheetData[]): Promise<PickedFile> {
  const blob = await writeWorkbook(sheets.map((sheet) => ({ ...sheet, columnWidths: [] })))
  return picked(name, await blob.arrayBuffer())
}

describe('SPEC-010 엑셀 파일 고르기 판별 (8절 예외, AC-29 의 판별 — 안내 문구는 #166)', () => {
  it('AC-29 5MB 넘는 파일은 읽기 전에 너무 큰 파일로 알린다', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0))

    const result = await readExcelFile({ name: '큰 장부.xlsx', size: EXCEL_FILE_MAX_BYTES + 1, arrayBuffer }, deps)

    expect(result).toEqual({ ok: false, problem: 'too-large' })
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(EXCEL_FILE_MAX_BYTES).toBe(5 * 1024 * 1024)
  })

  it('AC-29 .txt 파일은 앱 기록 파일로 알린다', async () => {
    expect(await readExcelFile(picked('우리장부-기록-2026-11-23.TXT', textBytes('아무 글')), deps)).toEqual({ ok: false, problem: 'backup-file' })
  })

  it('AC-29 이름이 달라도 내용이 기록 파일(새 버전 기록 파일 포함)이면 기록 파일로 알린다', async () => {
    const backup = createBackup(storedWith(ledger([[3, 'income', '회비', 10_000]])), new Date('2026-11-23T00:00:00.000Z'))
    const newer = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, books: [], settings: {} })

    expect(await readExcelFile(picked('장부', textBytes(backup.text)), deps)).toEqual({ ok: false, problem: 'backup-file' })
    expect(await readExcelFile(picked('장부.xlsx', textBytes(newer)), deps)).toEqual({ ok: false, problem: 'backup-file' })
  })

  it.each([
    ['글 파일', textBytes('월,일,입금\n3,5,10000')],
    ['JSON 이지만 기록 파일이 아님', textBytes('{"hello":1}')],
    ['사진', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]).buffer],
    ['깨진 엑셀(zip 머리 + 깨진 내용)', textBytes('PK\u0003\u0004 깨진 파일')],
  ])('AC-29 엑셀이 아니거나 깨진 파일(%s)은 엑셀이 아니라고 알린다', async (_label, bytes) => {
    expect(await readExcelFile(picked('장부.xlsx', bytes), deps)).toEqual({ ok: false, problem: 'not-excel' })
  })

  it('AC-29 읽을 수 있는 입출금내역 시트(2013 이후)가 없으면 읽을 시트 없음으로 알린다', async () => {
    const file = await xlsxFile('장부.xlsx', otherSheet('연락처'), ledgerSheet(2012, 0, []))

    expect(await readExcelFile(file, deps)).toEqual({ ok: false, problem: 'no-sheets' })
  })

  it('엑셀 파일(.xlsx)을 읽어 가져올 장부와 확인 화면 요약을 돌려준다', async () => {
    const file = await xlsxFile(
      '지어낸모임.xlsx',
      ledgerSheet(2025, 50_000, [[3, 5, 20_000, '강민지,김도윤', null]]),
      duesSheet(2025, [[1, '강민지', ...months(0)], [2, '김도윤', ...months(0)]]),
    )

    const result = await readExcelFile(file, deps)

    if (!result.ok) throw new Error(result.problem)
    expect(result.book.ledgers['2025']).toMatchObject({ carryover: 50_000, monthlyFee: 10_000 })
    expect(result.book.ledgers['2025'].entries[0].payers).toHaveLength(2)
    expect(result.summary.readSheets).toEqual(['2025년 입출금내역', '2025년 회비내역'])
  })

  it('옛 형식 엑셀(.xls)도 읽는다', async () => {
    const book = XLSX.utils.book_new()
    const sheet = ledgerSheet(2025, 0, [[3, 5, 1_000, '이자', null]])
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name)
    const bytes: unknown = XLSX.write(book, { bookType: 'xls', type: 'array' })
    if (!(bytes instanceof ArrayBuffer)) throw new Error('xls 를 만들지 못했다')

    const result = await readExcelFile(picked('옛 장부.xls', bytes), deps)

    expect(result.ok && result.book.ledgers['2025'].entries[0]).toMatchObject({ name: '이자', amount: 1_000 })
  })
})

describe('SPEC-010 엑셀 파일 머리 판별 (기록 파일 불러오기에서 엑셀을 고른 경우에도 쓴다, AC-29)', () => {
  it('.xlsx(zip) 와 .xls(옛 형식) 머리를 엑셀로 본다', async () => {
    const xlsx = await xlsxFile('a.xlsx', otherSheet('연락처'))

    expect(isExcelBytes(await xlsx.arrayBuffer())).toBe(true)
    expect(isExcelBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]).buffer)).toBe(true)
  })

  it('기록 파일·빈 파일·짧은 파일은 엑셀이 아니다', () => {
    expect(isExcelBytes(textBytes('{"schemaVersion":4}'))).toBe(false)
    expect(isExcelBytes(new ArrayBuffer(0))).toBe(false)
    expect(isExcelBytes(textBytes('PK'))).toBe(false)
  })
})
