import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ExcelFileMade } from './features/excel/excelExport'
import type { StoredData } from './domain/types'
import { MemoryRepository } from './storage/MemoryRepository'
import { ledger, storedWith } from './test/ledgerFixtures'

// 엑셀 내보내기에서 엑셀 기능 조각을 받지 못하거나(오프라인인데 서비스 워커가 아직 못 받음·배포 뒤 옛 조각 주소가 사라짐)
// 파일 만들기를 붙잡아 두는 경우. 모듈 대체가 다른 테스트에 번지지 않게 이 파일에서만 한다 (App.excel.offline.test.tsx 와 같음)
afterEach(() => {
  vi.doUnmock('xlsx')
  vi.doUnmock('./features/excel/excelExport')
  vi.doUnmock('./features/excel/sheetjs')
  vi.resetModules()
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(navigator, 'share')
  vi.restoreAllMocks()
})

const TODAY = new Date('2026-11-23T09:00:00.000+09:00')

const ONE_BOOK: StoredData = {
  ...storedWith(ledger([[10, 'income', '회비', 10_000]], { year: 2026 })),
  settings: { lastChangedAt: '2026-11-01T00:00:00.000Z', lastBackupAt: '2026-11-01T00:00:00.000Z' },
}

async function renderFreshApp(repository: MemoryRepository) {
  const { default: App } = await import('./App')
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY }} />)
}

async function exportFromSettings() {
  await userEvent.click(screen.getByRole('button', { name: '설정' }))
  await userEvent.click(within(screen.getByRole('region', { name: '엑셀' })).getByRole('button', { name: /^엑셀 파일로 내보내기/ }))
}

// 안드로이드 뒤로 버튼: 브라우저가 방문 기록을 하나 빼고 popstate 를 보낸다
function pressBackButton() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
}

function stubShare() {
  const share = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  return share
}

describe('SPEC-010 엑셀 내보내기 — 엑셀 기능을 받지 못함 (9절·예외, AC-35)', () => {
  it.each([
    ['엑셀 라이브러리(SheetJS)를', 'xlsx'],
    ['내보내기 조각을', './features/excel/excelExport'],
  ])('AC-35 %s 받지 못하면 불러오기와 같은 안내와 [앱 다시 열기]를 보이고 장부는 그대로다', async (_, module) => {
    vi.resetModules()
    vi.doMock(module, () => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })
    const repository = new MemoryRepository(ONE_BOOK)
    await renderFreshApp(repository)

    await exportFromSettings()

    const dialog = await screen.findByRole('dialog', { name: '엑셀 기능을 받지 못했어요' }, { timeout: 5_000 })
    expect(within(dialog).getByText('인터넷에 연결된 뒤 [앱 다시 열기]를 눌러 주세요')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '앱 다시 열기' })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(repository.load().data).toEqual(ONE_BOOK)
  })

  it('그 밖에 파일을 만들지 못하면 "엑셀 파일을 만들지 못했어요"와 다시 누르라는 안내', async () => {
    vi.resetModules()
    vi.doMock('./features/excel/sheetjs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('./features/excel/sheetjs')>()),
      writeWorkbook: () => Promise.reject(new Error('엑셀 파일을 만들지 못했어요')),
    }))
    await renderFreshApp(new MemoryRepository(ONE_BOOK))

    await exportFromSettings()

    const dialog = await screen.findByRole('dialog', { name: '엑셀 파일을 만들지 못했어요' }, { timeout: 5_000 })
    expect(within(dialog).getByText('닫고 [엑셀 파일로 내보내기]를 다시 눌러 주세요')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '앱 다시 열기' })).not.toBeInTheDocument()
  })
})

describe('SPEC-010 엑셀 내보내기 — 만드는 중에 닫기 (9절)', () => {
  // 파일 만들기를 붙잡아 두고, 만드는 중 창을 닫은 뒤에 풀어 준다
  async function holdMaking() {
    let finish: (made: ExcelFileMade) => void = () => {}
    vi.resetModules()
    vi.doMock('./features/excel/excelExport', () => ({
      makeExcelFile: () => new Promise<ExcelFileMade>((resolve) => (finish = resolve)),
    }))
    await renderFreshApp(new MemoryRepository(ONE_BOOK))
    await exportFromSettings()
    expect(await screen.findByRole('dialog', { name: '엑셀 파일을 만드는 중이에요' })).toHaveAttribute('aria-modal', 'true')
    return (made: ExcelFileMade) => act(() => finish(made))
  }

  const MADE: ExcelFileMade = {
    ok: true,
    file: new File(['xlsx'], '한랑드림 장부 2026-11-23.xlsx'),
    contents: { years: '2026년', sheets: '입출금내역' },
  }

  it.each([
    ['바깥 누르기·Esc 로', () => userEvent.keyboard('{Escape}')],
    ['뒤로 버튼으로', async () => pressBackButton()],
  ])('만드는 중에 %s 창을 닫으면 그만두고, 늦게 다 만들어져도 보내기 창·내려받기를 하지 않는다', async (_, closeSheet) => {
    const share = stubShare()
    const finish = await holdMaking()

    await closeSheet()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await finish(MADE)

    expect(share).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
  })
})
