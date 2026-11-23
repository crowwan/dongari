import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StoredData } from './domain/types'
import { MemoryRepository } from './storage/MemoryRepository'
import { ledger, storedWith } from './test/ledgerFixtures'

// 엑셀 기능 조각을 받지 못한 상황(오프라인인데 서비스 워커가 아직 못 받음·배포 뒤 옛 조각 주소가 사라짐): 동적 import 가 실패한다.
// 모듈 대체가 다른 테스트에 번지지 않게 이 파일에서만 한다 (excelFile.offline.test.ts 와 같음)
afterEach(() => {
  vi.doUnmock('xlsx')
  vi.doUnmock('./features/excel/ExcelImportScreen')
  vi.resetModules()
})

const TODAY = new Date('2026-11-23T09:00:00.000+09:00')

const ONE_BOOK: StoredData = {
  ...storedWith(ledger([[10, 'income', '회비', 10_000]], { year: 2026 })),
  settings: { lastChangedAt: '2026-11-01T00:00:00.000Z', lastBackupAt: '2026-11-01T00:00:00.000Z', recoveryCode: 'HK7M-29QF-MX4P-8R2D' },
}

// .xlsx 머리(zip)를 가진 멀쩡해 보이는 파일 (SheetJS 를 받지 못해 만들 수 없으니 머리만)
function xlsxLike(): File {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], '지어낸모임.xlsx')
}

async function renderFreshApp(repository: MemoryRepository) {
  const { default: App } = await import('./App')
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY }} />)
}

async function chooseExcel(file: File) {
  await userEvent.click(screen.getByTestId('book-button'))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '엑셀 파일로 새 장부' }))
  await userEvent.upload(screen.getByLabelText('엑셀 파일 고르기'), file)
}

describe('SPEC-010 엑셀로 새 장부 — 엑셀 기능을 받지 못함 (8절 예외, #166)', () => {
  it('엑셀 라이브러리를 받지 못하면 파일 탓이 아니라 인터넷에 연결된 뒤 다시 하라고 알리고 장부는 그대로다', async () => {
    vi.resetModules()
    vi.doMock('xlsx', () => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })
    const repository = new MemoryRepository(ONE_BOOK)
    await renderFreshApp(repository)

    await chooseExcel(xlsxLike())

    expect(await screen.findByRole('heading', { level: 1, name: '엑셀 기능을 받지 못했어요' }, { timeout: 5_000 })).toBeInTheDocument()
    // 실패한 동적 import 는 브라우저가 기억할 수 있어 파일을 다시 골라도 또 실패한다 → 앱을 다시 열게 한다 (#178 리뷰)
    expect(screen.getByText('인터넷에 연결된 뒤 [앱 다시 열기]를 눌러 주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '앱 다시 열기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '파일 다시 고르기' })).not.toBeInTheDocument()
    expect(repository.load().data).toEqual(ONE_BOOK)
  })

  it('확인 화면 조각을 받지 못해도 같은 안내를 보이고 장부는 그대로다', async () => {
    vi.resetModules()
    vi.doMock('./features/excel/ExcelImportScreen', () => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })
    const repository = new MemoryRepository(ONE_BOOK)
    await renderFreshApp(repository)

    await chooseExcel(xlsxLike())

    expect(await screen.findByRole('heading', { level: 1, name: '엑셀 기능을 받지 못했어요' }, { timeout: 5_000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '앱 다시 열기' })).toBeInTheDocument()
    expect(repository.load().data).toEqual(ONE_BOOK)
  })
})
