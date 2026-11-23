import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Book, StoredData } from './domain/types'
import { CURRENT_SCHEMA_VERSION } from './domain/types'
import { readWorkbook, XLSX_MIME } from './features/excel/sheetjs'
import type { LedgerRepository } from './storage/LedgerRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { book } from './test/ledgerFixtures'

// 엑셀 내보내기 (SPEC-010 9절 "넘기기", #167). 장부·이름은 지어낸 것
const TODAY = new Date('2026-11-23T09:00:00.000+09:00')

const CLUB: Book = book(
  [
    {
      year: 2025,
      carryover: 100_000,
      monthlyFee: 10_000,
      entries: [
        { id: 'e1', month: 3, day: 5, type: 'income', name: '회비', amount: 20_000, createdAt: '2025-03-05T00:00:00.000Z', payers: [{ memberId: 'm1', amount: 10_000 }, { memberId: 'm2', amount: 10_000 }] },
      ],
    },
    {
      year: 2026,
      carryover: 120_000,
      entries: [{ id: 'e2', month: 1, day: 9, type: 'expense', name: '대관료', amount: 50_000, createdAt: '2026-01-09T00:00:00.000Z' }],
    },
  ],
  {
    name: '다솜회',
    members: [
      { id: 'm1', name: '강민지', joined: '2025-01', off: [] },
      { id: 'm2', name: '김도윤', joined: '2025-01', off: [] },
    ],
    dues: { startMonth: '2026-01' },
  },
)

function stored(target: Book): StoredData {
  // 기록 파일을 보내 둔 상태 (30일 안내 띠가 끼지 않게)
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    books: [target],
    settings: { lastChangedAt: '2026-11-01T00:00:00.000Z', lastBackupAt: '2026-11-01T00:00:00.000Z' },
  }
}

function renderApp(repository: LedgerRepository) {
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY }} />)
}

// 폰의 공유 기능 흉내. 공유한 파일을 모아 둔다
function stubShare(share: () => Promise<void> = () => Promise.resolve()) {
  const sharedFiles: File[] = []
  const shareMock = vi.fn((data: ShareData) => {
    sharedFiles.push(...(data.files ?? []))
    return share()
  })
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
  Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true })
  return { shareMock, sharedFiles }
}

// 파일 공유를 못 하는 브라우저(갤럭시 크롬·삼성 인터넷은 .xlsx 를 보내기 창에 넣지 않음): 내려받기 흉내
function stubDownload() {
  const files: File[] = []
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn((file: File) => {
      files.push(file)
      return 'blob:excel'
    }),
    configurable: true,
  })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  return { files, click }
}

async function exportFromSettings() {
  await userEvent.click(screen.getByRole('button', { name: '설정' }))
  await userEvent.click(within(screen.getByRole('region', { name: '엑셀' })).getByRole('button', { name: /^엑셀 파일로 내보내기/ }))
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
  vi.restoreAllMocks()
})

describe('SPEC-010 엑셀 내보내기 — 설정 "엑셀" 묶음 (9절, #167)', () => {
  it('"엑셀" 묶음 맨 위에 [엑셀 파일로 내보내기](컴퓨터에서 보고 고칠 수 있는 표), 그 아래 [엑셀 파일 불러오기]', async () => {
    renderApp(new MemoryRepository(stored(CLUB)))
    await userEvent.click(screen.getByRole('button', { name: '설정' }))

    const rows = within(screen.getByRole('region', { name: '엑셀' })).getAllByRole('button')
    expect(rows.map((row) => row.textContent)).toEqual([
      '엑셀 파일로 내보내기 컴퓨터에서 보고 고칠 수 있는 표',
      '엑셀 파일 불러오기 엑셀 장부로 새 장부 만들기',
    ])
  })

  it('개인 가계부에도 [엑셀 파일로 내보내기]가 있다', async () => {
    renderApp(new MemoryRepository(stored({ ...CLUB, kind: 'household' })))
    await userEvent.click(screen.getByRole('button', { name: '설정' }))

    expect(within(screen.getByRole('region', { name: '엑셀' })).getByRole('button', { name: /^엑셀 파일로 내보내기/ })).toBeInTheDocument()
  })
})

describe('SPEC-010 엑셀 내보내기 — 넘기기 (9절, AC-34)', () => {
  it('AC-34 파일 공유가 되면 만드는 동안 "엑셀 파일을 만드는 중이에요" 창을 띄우고 보내기 창으로 xlsx 를 보낸다', async () => {
    let finishShare = () => {}
    const { shareMock, sharedFiles } = stubShare(() => new Promise<void>((resolve) => (finishShare = resolve)))
    renderApp(new MemoryRepository(stored(CLUB)))

    await exportFromSettings()

    expect(screen.getByRole('dialog', { name: '엑셀 파일을 만드는 중이에요' })).toHaveTextContent('처음 한 번은 엑셀 기능을 받느라 조금 더 걸려요')
    await vi.waitFor(() => expect(shareMock).toHaveBeenCalledOnce())
    const [file] = sharedFiles
    expect(file.name).toBe('다솜회 장부 2026-11-23.xlsx')
    expect(file.type).toBe(XLSX_MIME)
    const workbook = await readWorkbook(await file.arrayBuffer())
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['2026년 회비내역', '2026년 입출금내역', '2025년 회비내역', '2025년 입출금내역'])

    finishShare()

    expect(await screen.findByText('엑셀 파일을 보냈어요')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('AC-34 파일 공유가 안 되면 다운로드 폴더로 내려받고 "엑셀 파일을 저장했어요" 창에 어디에·파일·담긴 것과 카톡으로 보내는 길을 알린다', async () => {
    const { files, click } = stubDownload()
    renderApp(new MemoryRepository(stored(CLUB)))

    await exportFromSettings()

    const dialog = await screen.findByRole('dialog', { name: '엑셀 파일을 저장했어요' })
    expect(click).toHaveBeenCalledOnce()
    expect(files.map((file) => file.name)).toEqual(['다솜회 장부 2026-11-23.xlsx'])
    // 사실 줄: 이름(dt) 다음 칸이 값(dd)
    const facts = within(dialog)
    expect(facts.getByText('어디에').nextElementSibling).toHaveTextContent('다운로드 폴더내 파일 › 다운로드')
    expect(facts.getByText('파일').nextElementSibling).toHaveTextContent('다솜회 장부 2026-11-23.xlsx')
    expect(facts.getByText('담긴 것').nextElementSibling).toHaveTextContent('2025~2026년해마다 입출금내역 · 회비내역')
    expect(within(dialog).getByText('카톡으로 보내려면')).toBeInTheDocument()
    expect(within(dialog).getByText('채팅방 [+] › 파일 › 다운로드에서 이 파일을 고르세요')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
  })

  it('AC-34 누른 순간이 지나 보내기 창이 열리지 않으면(엑셀 기능을 처음 받느라 늦음) 내려받기로 대신하고 저장 안내를 띄운다', async () => {
    stubShare(() => Promise.reject(new DOMException('늦음', 'NotAllowedError')))
    const { files } = stubDownload()
    renderApp(new MemoryRepository(stored(CLUB)))

    await exportFromSettings()

    expect(await screen.findByRole('dialog', { name: '엑셀 파일을 저장했어요' })).toBeInTheDocument()
    expect(files).toHaveLength(1)
  })

  it('보내기 창을 그냥 닫으면 이 창도 아무 알림 없이 닫힌다', async () => {
    const { shareMock } = stubShare(() => Promise.reject(new DOMException('취소', 'AbortError')))
    const { click } = stubDownload()
    renderApp(new MemoryRepository(stored(CLUB)))

    await exportFromSettings()

    await vi.waitFor(() => expect(shareMock).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(click).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('개인 가계부는 입출금내역만 담는다', async () => {
    stubDownload()
    renderApp(new MemoryRepository(stored({ ...CLUB, kind: 'household' })))

    await exportFromSettings()

    const dialog = await screen.findByRole('dialog', { name: '엑셀 파일을 저장했어요' })
    expect(within(dialog).getByText('담긴 것').nextElementSibling).toHaveTextContent('2025~2026년해마다 입출금내역')
  })

  it('내보내기는 장부를 바꾸지 않는다', async () => {
    stubDownload()
    const repository = new MemoryRepository(stored(CLUB))
    renderApp(repository)

    await exportFromSettings()
    await screen.findByRole('dialog', { name: '엑셀 파일을 저장했어요' })

    expect(repository.load().data).toEqual(stored(CLUB))
  })
})
