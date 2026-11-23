/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { merge } from '../../test/excelFixtures'
import { readWorkbook, writeWorkbook, XLSX_MIME } from './sheetjs'
import type { WriteSheet } from './sheet'

// 테스트 안에서 SheetJS 로 지어낸 워크북을 만들어 파일 바이트로 (실제 엑셀 파일은 레포에 넣지 않는다)
function xlsxBytes(sheets: Record<string, XLSX.WorkSheet>): ArrayBuffer {
  const book = XLSX.utils.book_new()
  for (const [name, sheet] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, sheet, name)
  const out: unknown = XLSX.write(book, { bookType: 'xlsx', type: 'array' })
  if (!(out instanceof ArrayBuffer)) throw new Error('테스트 워크북을 만들지 못했다')
  return out
}

// jsdom Blob 은 Node Response 로 읽으면 "[object Blob]" 글자가 되어 Blob 자체로 읽는다
async function bytesOf(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer()
}

describe('ADR 009 SheetJS 어댑터 — 읽기 (시트 이름 + 2차원 칸 + 병합)', () => {
  it('시트 이름·칸 값(글자·숫자·빈칸)·병합을 순서대로 읽는다', async () => {
    const ledger = XLSX.utils.aoa_to_sheet([
      ['2025년 지어낸모임 입출금 내역'],
      ['월', '일', '입금', null, '출금', '잔액'],
      ['2024년 이월금', null, null, null, null, 100_000],
      [3, '5일', 10_000, '강민지,김도윤', null, 110_000],
    ])
    ledger['!merges'] = [merge(0, 0, 0, 5), merge(2, 0, 2, 4)]
    const other = XLSX.utils.aoa_to_sheet([['이름'], ['강민지']])

    const workbook = await readWorkbook(xlsxBytes({ '2025년 입출금내역': ledger, 연락처: other }))

    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['2025년 입출금내역', '연락처'])
    expect(workbook.sheets[0].rows).toEqual([
      ['2025년 지어낸모임 입출금 내역'],
      ['월', '일', '입금', null, '출금', '잔액'],
      ['2024년 이월금', null, null, null, null, 100_000],
      [3, '5일', 10_000, '강민지,김도윤', null, 110_000],
    ])
    expect(workbook.sheets[0].merges).toEqual([merge(0, 0, 0, 5), merge(2, 0, 2, 4)])
  })

  it('수식 칸은 계산된 값, 오류 칸(#REF!)은 글자, 참·거짓은 글자로 읽는다', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([[{ t: 'n', v: 110_000, f: 'F3+C4-E4' }, { t: 'e', v: 0x17, w: '#REF!' }, true]])

    const workbook = await readWorkbook(xlsxBytes({ 시트: sheet }))

    expect(workbook.sheets[0].rows).toEqual([[110_000, '#REF!', 'TRUE']])
  })

  it('A1 에서 떨어진 칸도 병합과 같은 좌표(0부터 센 줄·열)에 놓는다', async () => {
    const sheet = XLSX.utils.sheet_add_aoa({}, [['월']], { origin: 'C3' })

    const workbook = await readWorkbook(xlsxBytes({ 시트: sheet }))

    expect(workbook.sheets[0].rows[2]?.[2]).toBe('월')
    expect(workbook.sheets[0].rows[0] ?? []).toEqual([])
  })

  it('엑셀 파일이 아니면 오류를 낸다', async () => {
    await expect(readWorkbook(new TextEncoder().encode('PK\u0003\u0004 깨진 파일').buffer)).rejects.toThrow()
  })
})

describe('ADR 009 SheetJS 어댑터 — 쓰기 (수식+값·병합·열 너비, #167 내보내기)', () => {
  const sheet: WriteSheet = {
    name: '2025년 입출금내역',
    rows: [
      ['2025년 지어낸모임 입출금 내역'],
      ['월', '일', '입금', null, '출금', '잔액'],
      ['2024년 이월금', null, null, null, null, 100_000],
      [3, 5, 10_000, '강민지,김도윤', null, { formula: 'F3+C4-E4', value: 110_000 }],
    ],
    merges: [merge(0, 0, 0, 5), merge(2, 0, 2, 4)],
    columnWidths: [5, 5, 10, 30, 10, 12],
  }

  it('xlsx 파일(Blob)을 만들고, 다시 읽으면 같은 시트·값·병합이 나온다', async () => {
    const blob = await writeWorkbook([sheet, { name: '2025년 회비내역', rows: [['번호', '이름']], merges: [], columnWidths: [] }])

    expect(blob.type).toBe(XLSX_MIME)
    const workbook = await readWorkbook(await bytesOf(blob))
    expect(workbook.sheets.map((item) => item.name)).toEqual(['2025년 입출금내역', '2025년 회비내역'])
    expect(workbook.sheets[0].rows[3]).toEqual([3, 5, 10_000, '강민지,김도윤', null, 110_000])
    expect(workbook.sheets[0].merges).toEqual(sheet.merges)
  })

  it('잔액 칸에 수식과 계산한 값을 같이 쓰고, 열 너비를 쓴다 (미리보기는 수식을 계산하지 않는다)', async () => {
    const blob = await writeWorkbook([sheet])
    // 열 너비는 cellStyles 를 켜야 읽힌다
    const written = XLSX.read(new Uint8Array(await bytesOf(blob)), { type: 'array', cellFormula: true, cellStyles: true }).Sheets['2025년 입출금내역']

    expect(written?.F4).toMatchObject({ f: 'F3+C4-E4', v: 110_000 })
    expect(written?.['!cols']?.map((col) => col.wch)).toEqual([5, 5, 10, 30, 10, 12])
  })
})

describe('ADR 009 SheetJS 는 어댑터 한 곳에서, 누를 때만 부른다 (SPEC-010 AC-35 첫 화면 번들)', () => {
  // 레포 루트 기준 (vitest 는 루트에서 돈다)
  const sourceFiles = readdirSync('src', { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => ({ file: file.replaceAll('\\', '/'), text: readFileSync(`src/${file}`, 'utf8') }))
  const importsXlsx = /from\s+['"]xlsx['"]|import\(\s*['"]xlsx['"]\s*\)/

  it('앱 코드에서 SheetJS(xlsx)를 부르는 곳은 어댑터 features/excel/sheetjs.ts 하나다', () => {
    expect(sourceFiles.filter(({ text }) => importsXlsx.test(text)).map(({ file }) => file)).toEqual(['features/excel/sheetjs.ts'])
  })

  it('어댑터는 SheetJS 를 동적 import 로만 불러 첫 화면 번들에 넣지 않는다 (타입만 정적으로)', () => {
    const adapter = sourceFiles.find(({ file }) => file === 'features/excel/sheetjs.ts')?.text ?? ''

    expect(adapter).toMatch(/import\(\s*'xlsx'\s*\)/)
    expect(adapter.match(/^import\s+(?!type\b).*from\s+['"]xlsx['"]/m)).toBeNull()
  })
})
