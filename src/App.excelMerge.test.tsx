import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Book, Entry, StoredData } from './domain/types'
import type { SheetData } from './features/excel/sheet'
import { writeWorkbook, XLSX_MIME } from './features/excel/sheetjs'
import type { LedgerRepository } from './storage/LedgerRepository'
import { LocalStorageRepository, STORAGE_KEY } from './storage/LocalStorageRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { isStoredData } from './storage/schema'
import { duesSheet, ledgerSheet, months } from './test/excelFixtures'
import { book } from './test/ledgerFixtures'

const TODAY = new Date('2026-11-23T09:00:00.000+09:00')

function renderApp(repository: LedgerRepository) {
  let seq = 0
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY, createId: () => `id-${++seq}` }} />)
  return repository
}

function income(id: string, month: number, amount: number, payers?: [string, number][]): Entry {
  const made: Entry = { id, month, day: 5, type: 'income', name: '회비', amount, createdAt: `2025-0${month}-05T00:00:00.000Z` }
  if (payers) made.payers = payers.map(([memberId, share]) => ({ memberId, amount: share }))
  return made
}

// 앱에 있는 동아리 장부 "한랑드림": 2025년 기록 둘(김도윤 회비·간식비), 2026년 기록 하나. 회원 김도윤, 회비 표 2025년 1월부터
function clubBook(overrides: Partial<Book> = {}): Book {
  return book(
    [
      {
        year: 2025,
        carryover: 0,
        monthlyFee: 10_000,
        entries: [income('a1', 1, 10_000, [['m1', 10_000]]), { ...income('a2', 2, 5_000), type: 'expense', name: '간식비' }],
      },
      { year: 2026, carryover: 5_000, entries: [income('a3', 3, 10_000, [['m1', 10_000]])] },
    ],
    { members: [{ id: 'm1', name: '김도윤', joined: '2025-01', off: [] }], dues: { startMonth: '2025-01' }, ...overrides },
  )
}

const HOUSEHOLD = book([{ year: 2026, carryover: 0, entries: [] }], { id: 'home', name: '우리집', kind: 'household' })

// 마지막 변경까지 기록 파일을 보내 둔 폰 (30일 안내 띠가 끼지 않게)
function phoneWith(...books: Book[]): StoredData {
  return {
    schemaVersion: 4,
    books,
    settings: { lastChangedAt: '2026-11-01T00:00:00.000Z', lastBackupAt: '2026-11-01T00:00:00.000Z', lastBookId: books[0]?.id },
  }
}

// 지어낸 엑셀: 2024년(강민지·김도윤 회비, 대관료) + 2025년(강민지·김도윤·이서준 회비). 이서준은 2025년에 들어왔다
function clubSheets(): SheetData[] {
  return [
    ledgerSheet(2024, 0, [
      [1, 5, 20_000, '강민지,김도윤', null],
      [3, 5, null, '대관료', 5_000],
    ]),
    duesSheet(2024, [[1, '강민지', ...months(0)], [2, '김도윤', ...months(0)]]),
    ledgerSheet(2025, 15_000, [[1, 5, 30_000, '강민지,김도윤,이서준', null]]),
    duesSheet(2025, [[1, '강민지', ...months(0)], [2, '김도윤', ...months(0)], [3, '이서준', ...months(0)]]),
  ]
}

async function xlsxFile(name: string, sheets: readonly SheetData[]): Promise<File> {
  const blob = await writeWorkbook(sheets.map((sheet) => ({ ...sheet, columnWidths: [] })))
  return new File([await blob.arrayBuffer()], name, { type: XLSX_MIME })
}

// 설정 [엑셀 파일 불러오기] → 파일을 넣어 읽은 내용 확인 화면까지
async function readExcel(user = userEvent.setup()) {
  await user.click(screen.getByRole('button', { name: '설정' }))
  await user.upload(screen.getByLabelText('엑셀 파일 고르기'), await xlsxFile('지어낸모임.xlsx', clubSheets()))
  await screen.findByRole('heading', { level: 1, name: '엑셀 파일을 읽었어요' }, { timeout: 5_000 })
}

async function openMerge() {
  await readExcel()
  await userEvent.click(screen.getByRole('button', { name: '다른 장부에 넣기' }))
  expect(screen.getByRole('heading', { level: 1, name: '어느 해를 넣을까요?' })).toBeInTheDocument()
}

const yearBox = (name: RegExp) => screen.getByRole('checkbox', { name })
const placeButton = () => screen.getByRole('button', { name: '고른 해 넣기' })

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(navigator, 'share')
})

describe('SPEC-010 엑셀로 기존 장부에 넣기 — 해 고르기 (8절 "다른 장부에 넣기", #169)', () => {
  it('확인 화면 아래 보조 버튼 [다른 장부에 넣기]는 동아리·모임 장부가 있을 때만 있다', async () => {
    renderApp(new MemoryRepository(phoneWith(HOUSEHOLD)))
    await readExcel()

    expect(screen.getByRole('button', { name: /^새 장부 만들기/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다른 장부에 넣기' })).not.toBeInTheDocument()
  })

  it('AC-31 [다른 장부에 넣기] → "어느 해를 넣을까요?": 동아리 장부가 하나면 고른 채 시작하고, 앱 기록이 없는 해는 체크된 채 "새로 넣어요", 있는 해는 체크 없이 앱 기록 수와 "고르면 바꿔요"', async () => {
    const repository = new MemoryRepository(phoneWith(HOUSEHOLD, clubBook()))
    const save = vi.spyOn(repository, 'save')
    renderApp(repository)

    await openMerge()

    // 넣을 장부: 동아리·모임 장부만, 하나라 고른 상태
    const books = within(screen.getByRole('group', { name: '넣을 장부' }))
    expect(books.getAllByRole('button').map((button) => button.textContent)).toEqual(['한랑드림'])
    expect(books.getByRole('button', { name: '한랑드림' })).toHaveAttribute('aria-pressed', 'true')

    const years = within(screen.getByRole('group', { name: '넣을 해' }))
    expect(years.getAllByRole('checkbox').map((box) => box.textContent)).toEqual([
      '2024년 엑셀 2건 · 새로 넣어요',
      '2025년 엑셀 1건 · 지금 앱 기록 2건 · 고르면 바꿔요',
    ])
    expect(yearBox(/^2024년/)).toBeChecked()
    expect(yearBox(/^2025년/)).not.toBeChecked()
    expect(screen.getByText('고른 해의 앱 기록은 지워지고 엑셀 기록으로 바뀌어요')).toBeInTheDocument()
    expect(screen.getByText('되돌릴 수 없으니 먼저 기록 파일을 보내 두세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '기록 파일 먼저 보내기' })).toBeInTheDocument()
    expect(placeButton()).toBeEnabled()
    expect(save).not.toHaveBeenCalled()
  })

  it('동아리 장부가 둘 이상이면 고르기 전에는 해 목록이 없고 [고른 해 넣기]를 누를 수 없으며, 고르면 그 장부 기준으로 체크가 정해진다', async () => {
    const other = clubBook({ id: 'book-2', name: '다솜회', ledgers: {} })
    renderApp(new MemoryRepository(phoneWith(clubBook(), other)))
    await openMerge()

    expect(screen.queryByRole('group', { name: '넣을 해' })).not.toBeInTheDocument()
    expect(placeButton()).toBeDisabled()
    expect(screen.getByText('넣을 장부를 골라 주세요')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '다솜회' }))
    // 다솜회에는 앱 기록이 없어 두 해 모두 새로 넣는 해 → 지울 기록이 없어 경고도 없다
    expect(yearBox(/^2024년/)).toBeChecked()
    expect(yearBox(/^2025년 엑셀 1건 · 새로 넣어요$/)).toBeChecked()
    expect(screen.queryByRole('button', { name: '기록 파일 먼저 보내기' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '한랑드림' }))
    expect(yearBox(/^2025년/)).not.toBeChecked()

    await userEvent.click(yearBox(/^2024년/))
    expect(placeButton()).toBeDisabled()
    expect(screen.getByText('넣을 해를 골라 주세요')).toBeInTheDocument()
  })

  it('[기록 파일 먼저 보내기]는 지금 기록을 기록 파일로 보낸다 (넣기 전에 되돌릴 길을 만들어 두게)', async () => {
    const shared: File[] = []
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: vi.fn((data: ShareData) => {
        shared.push(...(data.files ?? []))
        return Promise.resolve()
      }),
      configurable: true,
    })
    renderApp(new MemoryRepository(phoneWith(clubBook())))
    await openMerge()

    await userEvent.click(screen.getByRole('button', { name: '기록 파일 먼저 보내기' }))

    expect(await screen.findByText('기록 파일을 보냈어요')).toBeInTheDocument()
    expect(shared.map((file) => file.name)).toEqual(['우리장부-기록-2026-11-23.txt'])
    // 해 고르기 화면에 그대로 있다
    expect(screen.getByRole('heading', { level: 1, name: '어느 해를 넣을까요?' })).toBeInTheDocument()
  })

  it('[‹ 읽은 내용]·뒤로 버튼은 해 고르기만 닫고 읽은 내용 확인 화면으로 돌아온다', async () => {
    renderApp(new MemoryRepository(phoneWith(clubBook())))
    await openMerge()

    await userEvent.click(screen.getByRole('button', { name: '읽은 내용' }))
    expect(await screen.findByRole('heading', { level: 1, name: '엑셀 파일을 읽었어요' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '다른 장부에 넣기' }))
    window.history.back()
    expect(await screen.findByRole('heading', { level: 1, name: '엑셀 파일을 읽었어요' })).toBeInTheDocument()
  })
})

describe('SPEC-010 엑셀로 기존 장부에 넣기 — 확인 창과 넣기 (8절 "다른 장부에 넣기", #169)', () => {
  it('AC-31 [고른 해 넣기] → 확인 창 "N개 해를 넣을까요?"에 합칠 회원·새 회원이 보이고, 바꾸는 해가 없으면 [넣기], [아니요]면 아무것도 바꾸지 않는다', async () => {
    const repository = new MemoryRepository(phoneWith(clubBook()))
    renderApp(repository)
    await openMerge()

    await userEvent.click(placeButton())

    const dialog = within(screen.getByRole('alertdialog', { name: '1개 해를 넣을까요?' }))
    expect(dialog.getByText('한랑드림 장부에 엑셀 기록 2건을 넣어요')).toBeInTheDocument()
    // 2024년에 회원이던 분만: 김도윤은 이름이 같아 합치고, 강민지는 새로. 2025년에 들어온 이서준은 넣지 않는다
    expect(dialog.getByText('합칠 회원').parentElement).toHaveTextContent('합칠 회원김도윤1명 · 앱 명단과 이름이 같아요')
    expect(dialog.getByText('새 회원').parentElement).toHaveTextContent('새 회원강민지1명')
    expect(dialog.getByRole('button', { name: '넣기' })).toBeInTheDocument()
    expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('data-variant', 'default')

    await userEvent.click(dialog.getByRole('button', { name: '아니요' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(repository.load().data).toEqual(phoneWith(clubBook()))
  })

  it('AC-31 [넣기]를 누르면 고른 해만 엑셀 것으로 넣고 회원은 이름으로 합쳐 저장하며(v4 검사 통과), 그 장부의 넣은 해가 열린다', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(phoneWith(HOUSEHOLD, clubBook())))
    renderApp(new LocalStorageRepository())
    await openMerge()
    await userEvent.click(placeButton())

    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '넣기' }))

    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    expect(screen.getByTestId('book-button')).toHaveTextContent('한랑드림 2024년')
    expect(screen.getByText('엑셀 기록을 넣었어요 · 1개 해')).toBeInTheDocument()

    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')
    expect(isStoredData(saved)).toBe(true)
    const loaded = new LocalStorageRepository().load()
    expect(loaded.status).toBe('ok')
    expect(loaded.data.settings.lastBookId).toBe('book-1')
    const merged = loaded.data.books[1]
    expect(merged?.members?.map((member) => member.name)).toEqual(['김도윤', '강민지'])
    const kang = merged?.members?.find((member) => member.name === '강민지')?.id
    expect(merged?.ledgers['2024']?.entries.map((entry) => [entry.name, entry.amount, entry.payers])).toEqual([
      [
        '회비',
        20_000,
        [
          { memberId: kang, amount: 10_000 },
          { memberId: 'm1', amount: 10_000 },
        ],
      ],
      ['대관료', 5_000, undefined],
    ])
    // 고르지 않은 2025년 앱 기록과 2026년, 회비 표 시작 달은 그대로
    expect(merged?.ledgers['2025']).toEqual(clubBook().ledgers['2025'])
    expect(merged?.ledgers['2026']).toEqual(clubBook().ledgers['2026'])
    expect(merged?.dues).toEqual({ startMonth: '2025-01' })
    expect(loaded.data.books[0]).toEqual(HOUSEHOLD)
  })

  it('AC-31 앱 기록이 있는 해를 고르면 확인 창이 지워질 앱 기록을 알리고 위험 [바꾸기]로 그 해를 엑셀 기록으로 바꾼다', async () => {
    const repository = new MemoryRepository(phoneWith(clubBook()))
    renderApp(repository)
    await openMerge()
    await userEvent.click(yearBox(/^2025년/))
    await userEvent.click(placeButton())

    const dialog = within(screen.getByRole('alertdialog', { name: '2개 해를 넣을까요?' }))
    expect(dialog.getByText('한랑드림 장부의 2025년 앱 기록 2건은 지워지고 엑셀 기록으로 바뀌어요. 되돌릴 수 없어요')).toBeInTheDocument()
    expect(dialog.getByText('새 회원').parentElement).toHaveTextContent('새 회원강민지, 이서준2명')
    expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('data-variant', 'danger')

    await userEvent.click(dialog.getByRole('button', { name: '바꾸기' }))

    expect(await screen.findByText('엑셀 기록을 넣었어요 · 2개 해')).toBeInTheDocument()
    expect(screen.getByTestId('book-button')).toHaveTextContent('한랑드림 2025년')
    const merged = repository.load().data.books[0]
    expect(merged?.ledgers['2025']?.entries.map((entry) => [entry.name, entry.amount])).toEqual([['회비', 30_000]])
    expect(merged?.ledgers['2025']?.carryover).toBe(15_000)
    expect(merged?.members?.map((member) => member.name)).toEqual(['김도윤', '강민지', '이서준'])
    expect(merged?.ledgers['2026']).toEqual(clubBook().ledgers['2026'])
  })

  it.each([
    ['저장 공간 부족', 'quota-exceeded', '엑셀 기록을 넣지 못했어요. 이 폰에 저장하지 못해 지금 기록은 그대로예요'],
    ['저장 전 가드에 막힘 (#172)', 'invalid-data', '앱에 문제가 있어 엑셀 기록을 넣지 못했어요. 지금 기록은 그대로예요'],
  ] as const)('넣기를 저장하지 못하면(%s) 아무것도 바꾸지 않고 해 고르기 화면 맨 위에 알리며, 다시 넣을 수 있다', async (_label, reason, message) => {
    const repository = new MemoryRepository(phoneWith(clubBook()))
    const save = vi.spyOn(repository, 'save').mockReturnValueOnce({ ok: false, reason })
    renderApp(repository)
    await openMerge()
    await userEvent.click(placeButton())

    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '넣기' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '어느 해를 넣을까요?' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(repository.load().data).toEqual(phoneWith(clubBook()))

    await userEvent.click(placeButton())
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '넣기' }))

    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    expect(save).toHaveBeenCalledTimes(2)
    expect(Object.keys(repository.load().data.books[0]?.ledgers ?? {}).sort()).toEqual(['2024', '2025', '2026'])
  })
})
