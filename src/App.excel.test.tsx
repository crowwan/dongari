import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { StoredData } from './domain/types'
import { EXCEL_FILE_MAX_BYTES } from './features/excel/excelFile'
import { isNearKeepLimit } from './features/excel/importFacts'
import type { SheetData } from './features/excel/sheet'
import { writeWorkbook, XLSX_MIME } from './features/excel/sheetjs'
import type { LedgerRepository } from './storage/LedgerRepository'
import { LocalStorageRepository, STORAGE_KEY } from './storage/LocalStorageRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { isStoredData } from './storage/schema'
import { duesSheet, ledgerSheet, months, otherSheet, type LedgerRow } from './test/excelFixtures'
import { book, ledger, storedWith } from './test/ledgerFixtures'

// 크기 경고 셈을 몇 번 하는지 세려고 진짜 함수를 감싼다 (#178 리뷰: 글자를 칠 때마다 전체 데이터를 직렬화하지 않게)
vi.mock('./features/excel/importFacts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./features/excel/importFacts')>()
  return { ...actual, isNearKeepLimit: vi.fn(actual.isNearKeepLimit) }
})

const TODAY = new Date('2026-11-23T09:00:00.000+09:00')

function renderApp(repository: LedgerRepository) {
  let seq = 0
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY, createId: () => `id-${++seq}` }} />)
  return repository
}

// 지어낸 엑셀 (실제 이모 엑셀은 레포에 넣지 않는다). 2024·2025년 입출금내역 + 회비내역 + 읽지 않는 연락처.
// 2024년: 낸 분 둘(한 분 1만), 2월 31일(날짜를 바꾼 줄), 대관료 지출, 강민지 1만5천(월 회비 배수 아님 → 못 나눈 회비),
// 이자, "이만원"(읽지 못한 줄). 2025년 이월금 = 2024년 끝 잔액 112,000원
const ROWS_2024: LedgerRow[] = [
  [1, 5, 20_000, '강민지,김도윤', null],
  [2, 31, 20_000, '강민지,김도윤', null],
  [3, 5, null, '대관료', 50_000],
  [4, 5, 15_000, '강민지', null],
  [5, 5, 7_000, '이자', null],
  [6, 5, '이만원', '이서준', null],
]

function clubSheets(carryover2025 = 112_000): SheetData[] {
  return [
    otherSheet('연락처'),
    ledgerSheet(2024, 100_000, ROWS_2024),
    duesSheet(2024, [[1, '강민지', ...months(0)], [2, '김도윤', ...months(0)]]),
    ledgerSheet(2025, carryover2025, [[1, 5, 30_000, '강민지,김도윤,이서준', null]]),
    duesSheet(2025, [[1, '강민지', ...months(0)], [2, '김도윤', ...months(0)], [3, '이서준', ...months(0)]]),
  ]
}

async function xlsxFile(name: string, sheets: readonly SheetData[]): Promise<File> {
  const blob = await writeWorkbook(sheets.map((sheet) => ({ ...sheet, columnWidths: [] })))
  return new File([await blob.arrayBuffer()], name, { type: XLSX_MIME })
}

// 이미 장부가 하나 있는 폰 (마지막 변경까지 기록 파일을 보내 둔 상태 — 30일 안내 띠가 끼지 않게)
const ONE_BOOK: StoredData = {
  ...storedWith(ledger([[10, 'income', '회비', 10_000]], { year: 2026 })),
  settings: { lastChangedAt: '2026-11-01T00:00:00.000Z', lastBackupAt: '2026-11-01T00:00:00.000Z', recoveryCode: 'HK7M-29QF-MX4P-8R2D' },
}

async function openBookSheet() {
  await userEvent.click(screen.getByTestId('book-button'))
  return within(screen.getByRole('dialog', { name: '어느 장부를 볼까요?' }))
}

// 장부 고르기 창 [엑셀 파일로 새 장부] → 파일 고르기 칸에 파일을 넣는다 (폰 파일 고르기 대신)
async function chooseExcel(file: File, user = userEvent.setup()) {
  await user.click((await openBookSheet()).getByRole('button', { name: '엑셀 파일로 새 장부' }))
  await user.upload(screen.getByLabelText('엑셀 파일 고르기'), file)
}

async function readExcelScreen() {
  return screen.findByRole('heading', { level: 1, name: '엑셀 파일을 읽었어요' }, { timeout: 5_000 })
}

// 사실 카드 한 줄 (이름 dt + 값 dd)
function fact(label: string): HTMLElement | null {
  return screen.getByText(label, { selector: 'dt' }).parentElement
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('SPEC-010 엑셀로 새 장부 — 여는 곳 (8절 "여는 곳", #166)', () => {
  it('AC-30 엑셀 불러오기 입구가 장부 고르기 창·설정·첫 실행 화면에 있고, 누르면 엑셀 파일 고르기가 열린다', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const opened = () => click.mock.contexts.at(-1)

    // 첫 실행: 위쪽 오른쪽 [기록 파일 불러오기] 옆
    renderApp(new MemoryRepository())
    await userEvent.click(screen.getByRole('button', { name: '엑셀 파일 불러오기' }))
    expect(opened()).toBe(screen.getByLabelText('엑셀 파일 고르기'))
    expect(screen.getByLabelText('엑셀 파일 고르기')).toHaveAttribute('accept', expect.stringContaining('.xlsx,.xls'))
    cleanup()
    click.mockClear()

    // 장부 고르기 창: [+ 새 장부 만들기] 바로 아래
    renderApp(new MemoryRepository(ONE_BOOK))
    const sheet = await openBookSheet()
    const buttons = sheet.getAllByRole('button').map((button) => button.textContent)
    expect(buttons.slice(-2)).toEqual(['새 장부 만들기', '엑셀 파일로 새 장부'])
    await userEvent.click(sheet.getByRole('button', { name: '엑셀 파일로 새 장부' }))
    expect(opened()).toBe(screen.getByLabelText('엑셀 파일 고르기'))
    cleanup()
    click.mockClear()

    // 설정: "엑셀" 묶음은 장부 정보 앞
    renderApp(new MemoryRepository(ONE_BOOK))
    await userEvent.click(screen.getByRole('button', { name: '설정' }))
    const groups = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(groups.indexOf('엑셀')).toBe(groups.indexOf('장부 정보') - 1)
    const excelGroup = within(screen.getByRole('region', { name: '엑셀' }))
    const row = excelGroup.getByRole('button', { name: /^엑셀 파일 불러오기/ })
    expect(row).toHaveTextContent('엑셀 장부로 새 장부 만들기')
    await userEvent.click(row)
    expect(opened()).toBe(screen.getByLabelText('엑셀 파일 고르기'))
  })

  it('장부 고르기 창이 떠 있어 뒤 화면이 잠겨(inert) 있어도 엑셀 파일 고르기 칸은 잠긴 곳 밖에 있다 (#178 리뷰)', async () => {
    renderApp(new MemoryRepository(ONE_BOOK))

    await openBookSheet()

    // 창이 뒤 화면(앱 뿌리)을 잠갔다
    expect(screen.getByTestId('ledger-screen').closest('[inert]')).not.toBeNull()
    // 숨은 파일 칸은 잠기지 않아 [엑셀 파일로 새 장부] 의 click() 이 파일 고르기를 연다
    expect(screen.getByLabelText('엑셀 파일 고르기').closest('[inert]')).toBeNull()
  })
})

describe('SPEC-010 엑셀로 새 장부 — 읽은 내용 확인 (8절 "읽은 내용 확인", #166)', () => {
  it('AC-28 확인 화면에 파일·시트 수, 장부 이름, 해·기록·회원·월 회비·시작 달, 검산, 못 나눈 회비, 날짜를 바꾼 줄·읽지 못한 줄, 읽지 않은 시트가 보이고 아직 저장하지 않는다', async () => {
    const repository = new MemoryRepository(ONE_BOOK)
    const save = vi.spyOn(repository, 'save')
    renderApp(repository)

    await chooseExcel(await xlsxFile('지어낸모임.xlsx', clubSheets()))

    expect(await readExcelScreen()).toBeInTheDocument()
    expect(screen.getByText('지어낸모임.xlsx · 시트 5개 중 4개를 읽었어요')).toBeInTheDocument()
    expect(screen.getByLabelText('장부 이름')).toHaveValue('지어낸모임')
    expect(fact('해')).toHaveTextContent('해2024 ~ 2025년2개 해')
    expect(fact('기록')).toHaveTextContent('기록6건수입 5 · 지출 1')
    expect(fact('회원')).toHaveTextContent('회원3명2025년 회원 3명')
    expect(fact('월 회비')).toHaveTextContent('월 회비2024~2025년 10,000원')
    expect(fact('회비 표')).toHaveTextContent('회비 표2025년 1월부터')
    expect(screen.getByRole('button', { name: '월 회비 고치기' })).toBeInTheDocument()
    expect(screen.getByText('해마다 잔액이 맞아요')).toBeInTheDocument()
    expect(screen.getByText('낸 분을 다 못 나눈 회비 1건')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^날짜를 바꾼 줄 1건/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^읽지 못한 줄 1건/ })).toBeInTheDocument()
    expect(screen.getByText('읽지 않은 것: 연락처')).toBeInTheDocument()
    expect(screen.queryByText('기록이 많아 자동으로 지키기를 못 할 수 있어요')).not.toBeInTheDocument()
    // 다른 장부에 넣기(F4)는 #169
    expect(screen.queryByRole('button', { name: '다른 장부에 넣기' })).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
    expect(repository.load().data).toEqual(ONE_BOOK)
  })

  it('AC-28 날짜를 바꾼 줄·읽지 못한 줄 [보기] 는 해·달과 엑셀 원래 글 목록을 연다', async () => {
    renderApp(new MemoryRepository(ONE_BOOK))
    await chooseExcel(await xlsxFile('지어낸모임.xlsx', clubSheets()))
    await readExcelScreen()

    await userEvent.click(screen.getByRole('button', { name: /^날짜를 바꾼 줄 1건/ }))

    const changed = within(screen.getByRole('dialog', { name: '날짜를 바꾼 줄 1건' }))
    const item = changed.getByRole('listitem')
    expect(item).toHaveTextContent('2024년 2월')
    expect(item).toHaveTextContent('2 31 20000 강민지,김도윤')
    await userEvent.click(changed.getByRole('button', { name: '닫기' }))

    await userEvent.click(screen.getByRole('button', { name: /^읽지 못한 줄 1건/ }))
    const unread = within(screen.getByRole('dialog', { name: '읽지 못한 줄 1건' }))
    expect(unread.getByRole('listitem')).toHaveTextContent('2024년 6월')
    expect(unread.getByRole('listitem')).toHaveTextContent('이만원 이서준')
  })

  it('AC-28 검산이 다르면 몇 곳이 다른지와 해·차이를 보이고, 이월금은 엑셀 값을 쓴다고 알린다', async () => {
    renderApp(new MemoryRepository(ONE_BOOK))
    await chooseExcel(await xlsxFile('지어낸모임.xlsx', clubSheets(110_000)))
    await readExcelScreen()

    expect(screen.getByText('잔액을 맞춰 보니 1곳이 달라요')).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('2025년 이월금 2,000원 차이')
    expect(screen.getByText(/이월금은 엑셀에 적힌 값을 그대로 써요/)).toBeInTheDocument()
    expect(screen.queryByText('해마다 잔액이 맞아요')).not.toBeInTheDocument()
  })

  it('AC-28 같은 이름 장부가 있으면 장부 이름 뒤에 " (엑셀)"이 붙고, 이름을 비우면 [새 장부 만들기]를 누를 수 없다', async () => {
    const data: StoredData = { ...ONE_BOOK, books: [book([ledger([], { year: 2026 })], { name: '지어낸모임' })] }
    renderApp(new MemoryRepository(data))
    await chooseExcel(await xlsxFile('지어낸모임.xlsx', clubSheets()))
    await readExcelScreen()

    const nameField = screen.getByLabelText('장부 이름')
    expect(nameField).toHaveValue('지어낸모임 (엑셀)')

    await userEvent.clear(nameField)
    expect(screen.getByRole('button', { name: /^새 장부 만들기/ })).toBeDisabled()
    expect(screen.getByText('장부 이름을 적어 주세요')).toBeInTheDocument()
  })

  it('AC-28 [새 장부 만들기]를 누르면 동아리 장부가 생겨 지금 장부가 되고 장부 연도는 엑셀 마지막 해이며, 저장한 데이터는 v4 검사를 통과한다', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ONE_BOOK))
    renderApp(new LocalStorageRepository())
    await chooseExcel(await xlsxFile('지어낸모임.xlsx', clubSheets()))
    await readExcelScreen()

    await userEvent.click(screen.getByRole('button', { name: /^새 장부 만들기/ }))

    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('지어낸모임')
    expect(screen.getByTestId('book-button')).toHaveTextContent('2025년')
    expect(screen.getByText('엑셀 장부를 만들었어요 · 기록 6건')).toBeInTheDocument()

    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')
    expect(isStoredData(saved)).toBe(true)
    const loaded = new LocalStorageRepository().load()
    expect(loaded.status).toBe('ok')
    const created = loaded.data.books.at(-1)
    expect(created).toMatchObject({ name: '지어낸모임', kind: 'club', dues: { startMonth: '2025-01' } })
    expect(created?.members?.map((member) => member.name)).toEqual(['강민지', '김도윤', '이서준'])
    expect(Object.keys(created?.ledgers ?? {})).toEqual(['2024', '2025'])
    expect(loaded.data.settings.lastBookId).toBe(created?.id)
    expect(loaded.data.books[0]).toEqual(ONE_BOOK.books[0])
  })

  it('AC-28 첫 실행(장부 없음)에서도 엑셀로 첫 장부를 만들 수 있다', async () => {
    const repository = renderApp(new MemoryRepository())
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '엑셀 파일 불러오기' }))
    await user.upload(screen.getByLabelText('엑셀 파일 고르기'), await xlsxFile('지어낸모임.xlsx', clubSheets()))
    await readExcelScreen()

    await user.click(screen.getByRole('button', { name: /^새 장부 만들기/ }))

    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    expect(repository.load().data.books.map((item) => item.name)).toEqual(['지어낸모임'])
    expect(repository.load().data.settings.recoveryCode).toBeDefined()
  })

  it('AC-28 [새 장부 만들기]를 저장하지 못하면(저장 공간 부족 등) 장부를 만들지 않고 확인 화면에 남아 알리며, 다시 누를 수 있다 (#178 리뷰)', async () => {
    const repository = new MemoryRepository(ONE_BOOK)
    const save = vi.spyOn(repository, 'save').mockReturnValueOnce({ ok: false, reason: 'quota-exceeded' })
    renderApp(repository)
    await chooseExcel(await xlsxFile('지어낸모임.xlsx', clubSheets()))
    await readExcelScreen()

    await userEvent.click(screen.getByRole('button', { name: /^새 장부 만들기/ }))

    expect(screen.getByRole('heading', { level: 1, name: '엑셀 파일을 읽었어요' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('장부를 만들지 못했어요. 이 폰에 저장하지 못해 지금 기록은 그대로예요')
    expect(repository.load().data).toEqual(ONE_BOOK)

    // 화면 데이터에도 새 장부가 들어가지 않았다: 다시 누르면 장부가 하나만 생긴다
    await userEvent.click(screen.getByRole('button', { name: /^새 장부 만들기/ }))

    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    expect(save).toHaveBeenCalledTimes(2)
    expect(repository.load().data.books.map((item) => item.name)).toEqual(['한랑드림', '지어낸모임'])
    expect(screen.getByText('엑셀 장부를 만들었어요 · 기록 6건')).toBeInTheDocument()
  })

  it('[새 장부 만들기]를 저장하지 못하고 장부로 돌아가면 지금 장부 그대로이고 다음 저장도 지금 데이터만 쓴다 (#178 리뷰)', async () => {
    const repository = new MemoryRepository(ONE_BOOK)
    const save = vi.spyOn(repository, 'save').mockReturnValueOnce({ ok: false, reason: 'quota-exceeded' })
    renderApp(repository)
    await chooseExcel(await xlsxFile('지어낸모임.xlsx', clubSheets()))
    await readExcelScreen()
    await userEvent.click(screen.getByRole('button', { name: /^새 장부 만들기/ }))

    await userEvent.click(screen.getByRole('button', { name: '장부로' }))

    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('한랑드림')
    const sheet = await openBookSheet()
    expect(sheet.queryByRole('button', { name: /^지어낸모임/ })).not.toBeInTheDocument()
    await userEvent.click(sheet.getByRole('button', { name: /^한랑드림/ }))
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ books: [expect.objectContaining({ name: '한랑드림' })] }))
  })

  it('월 회비를 고치면 그 금액으로 낸 분을 다시 나눠 확인 화면이 바뀐다 (스펙 8절 "구현에서 정한 것")', async () => {
    renderApp(new MemoryRepository(ONE_BOOK))
    await chooseExcel(await xlsxFile('지어낸모임.xlsx', clubSheets()))
    await readExcelScreen()

    await userEvent.click(screen.getByRole('button', { name: '월 회비 고치기' }))
    expect(screen.getByRole('heading', { level: 1, name: '월 회비 고치기' })).toBeInTheDocument()
    const fee2024 = screen.getByLabelText('2024년 월 회비')
    expect(fee2024).toHaveValue('10,000')
    await userEvent.clear(fee2024)
    await userEvent.type(fee2024, '5000')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    // 한 분 1만 5천 원 줄도 5천 원의 배수라 낸 분이 생겨 못 나눈 회비가 없어진다
    expect(await readExcelScreen()).toBeInTheDocument()
    expect(fact('월 회비')).toHaveTextContent('월 회비2024년 5,000원2025년 10,000원')
    expect(screen.queryByText(/낸 분을 다 못 나눈 회비/)).not.toBeInTheDocument()
  })

  it('월 회비 고치기는 바꾼 해만 고정하고, 다 나눈 줄이 없어 앞 해 값을 이어 쓰던 다음 해는 고친 값을 이어 쓴다 (#178 리뷰)', async () => {
    // 2025년은 회비 줄이 없어(이자만) 2024년 월 회비를 이어 쓴다
    const sheets = [
      ledgerSheet(2024, 0, [[1, 5, 20_000, '강민지,김도윤', null]]),
      duesSheet(2024, [[1, '강민지', ...months(0)], [2, '김도윤', ...months(0)]]),
      ledgerSheet(2025, 20_000, [[1, 5, 1_000, '이자', null]]),
    ]
    renderApp(new MemoryRepository(ONE_BOOK))
    await chooseExcel(await xlsxFile('지어낸모임.xlsx', sheets))
    await readExcelScreen()
    expect(fact('월 회비')).toHaveTextContent('월 회비2024~2025년 10,000원')

    await userEvent.click(screen.getByRole('button', { name: '월 회비 고치기' }))
    await userEvent.clear(screen.getByLabelText('2024년 월 회비'))
    await userEvent.type(screen.getByLabelText('2024년 월 회비'), '5000')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(await readExcelScreen()).toBeInTheDocument()
    expect(fact('월 회비')).toHaveTextContent('월 회비2024~2025년 5,000원')

    // 한 번 더 고쳐도 앞에서 고친 해는 그대로 남는다
    await userEvent.click(screen.getByRole('button', { name: '월 회비 고치기' }))
    expect(screen.getByLabelText('2024년 월 회비')).toHaveValue('5,000')
    await userEvent.clear(screen.getByLabelText('2025년 월 회비'))
    await userEvent.type(screen.getByLabelText('2025년 월 회비'), '8000')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(await readExcelScreen()).toBeInTheDocument()
    expect(fact('월 회비')).toHaveTextContent('월 회비2024년 5,000원2025년 8,000원')
  })

  it('자동으로 지키기 크기 경고는 읽은 뒤 한 번만 센다 (장부 이름을 칠 때마다 전체 데이터를 직렬화하지 않음, #178 리뷰)', async () => {
    renderApp(new MemoryRepository(ONE_BOOK))
    await chooseExcel(await xlsxFile('지어낸모임.xlsx', clubSheets()))
    await readExcelScreen()
    vi.mocked(isNearKeepLimit).mockClear()

    await userEvent.type(screen.getByLabelText('장부 이름'), ' 2026')

    expect(screen.getByLabelText('장부 이름')).toHaveValue('지어낸모임 2026')
    expect(isNearKeepLimit).not.toHaveBeenCalled()
  })

  it('월 회비 고치기에서 읽은 값이 있던 해를 비우면 저장할 수 없다', async () => {
    renderApp(new MemoryRepository(ONE_BOOK))
    await chooseExcel(await xlsxFile('지어낸모임.xlsx', clubSheets()))
    await readExcelScreen()
    await userEvent.click(screen.getByRole('button', { name: '월 회비 고치기' }))

    await userEvent.clear(screen.getByLabelText('2025년 월 회비'))

    expect(screen.getByText('금액을 적어 주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  it('읽는 중에 화면을 떠나면 읽기를 버리고 아무것도 저장하지 않는다', async () => {
    const repository = new MemoryRepository(ONE_BOOK)
    const save = vi.spyOn(repository, 'save')
    renderApp(repository)
    const bytes = await (await xlsxFile('지어낸모임.xlsx', clubSheets())).arrayBuffer()
    let release: ((value: ArrayBuffer) => void) | undefined
    const file = new File(['읽는 중'], '지어낸모임.xlsx', { type: XLSX_MIME })
    const arrayBuffer = vi.fn(() => new Promise<ArrayBuffer>((resolve) => (release = resolve)))
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer })

    await chooseExcel(file)
    expect(screen.getByRole('heading', { level: 1, name: '엑셀 파일을 읽는 중이에요' })).toBeInTheDocument()
    await vi.waitFor(() => expect(arrayBuffer).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: '장부로' }))
    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()

    release?.(bytes)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.queryByRole('heading', { name: '엑셀 파일을 읽었어요' })).not.toBeInTheDocument()
    expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })
})

describe('SPEC-010 엑셀로 새 장부 — 파일 안내 (8절 예외, #166)', () => {
  it.each([
    ['5MB 넘는 파일', () => new File([new Uint8Array(EXCEL_FILE_MAX_BYTES + 1)], '큰 장부.xlsx'), '파일이 너무 커요', '5MB 까지 읽을 수 있어요'],
    [
      // 서버 주소 없는 빌드: 설정 맨 위 카드에 [기록 파일 불러오기] 가 바로 있다 ("다른 방법으로 옮기기" 접기 없음, #178 리뷰)
      '기록 파일',
      () => new File([JSON.stringify(ONE_BOOK)], '우리장부-기록-2026-11-23.txt', { type: 'text/plain' }),
      '이 파일은 기록 파일이에요',
      '설정 › 기록 파일 불러오기에서 열어 주세요',
    ],
    ['깨진 엑셀', () => new File(['PK\u0003\u0004 깨진 파일'], '깨진.xlsx'), '엑셀 파일을 읽지 못했어요', '엑셀에서 다시 저장해 보세요'],
  ])('AC-29 %s을 고르면 각자의 안내가 나오고 장부는 그대로다', async (_label, makeFile, title, description) => {
    const repository = new MemoryRepository(ONE_BOOK)
    const save = vi.spyOn(repository, 'save')
    renderApp(repository)

    // 폰 파일 고르기는 다른 형식 파일도 고를 수 있다 (accept 를 따르지 않는 흉내)
    await chooseExcel(makeFile(), userEvent.setup({ applyAccept: false }))

    expect(await screen.findByRole('heading', { level: 1, name: title }, { timeout: 5_000 })).toBeInTheDocument()
    expect(screen.getByText(description)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '파일 다시 고르기' })).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
    expect(repository.load().data).toEqual(ONE_BOOK)
  })

  it('AC-29 읽을 입출금내역 시트가 없는 엑셀을 고르면 시트 이름을 알려 주고 장부는 그대로다', async () => {
    const repository = new MemoryRepository(ONE_BOOK)
    renderApp(repository)

    await chooseExcel(await xlsxFile('연락처.xlsx', [otherSheet('연락처'), ledgerSheet(2012, 0, [])]))

    expect(await screen.findByRole('heading', { level: 1, name: '읽을 수 있는 입출금내역 시트가 없어요' }, { timeout: 5_000 })).toBeInTheDocument()
    expect(screen.getByText("2013년 이후 '2026년 입출금내역'처럼 이름 붙은 시트를 읽어요")).toBeInTheDocument()
    expect(repository.load().data).toEqual(ONE_BOOK)
  })

  it('AC-29 [파일 다시 고르기]로 다른 파일을 고르면 그 파일을 처음부터 다시 읽는다', async () => {
    renderApp(new MemoryRepository(ONE_BOOK))
    const user = userEvent.setup({ applyAccept: false })
    await chooseExcel(new File(['PK\u0003\u0004 깨진 파일'], '깨진.xlsx'), user)
    await screen.findByRole('heading', { level: 1, name: '엑셀 파일을 읽지 못했어요' }, { timeout: 5_000 })
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')

    await user.click(screen.getByRole('button', { name: '파일 다시 고르기' }))
    expect(click.mock.contexts.at(-1)).toBe(screen.getByLabelText('엑셀 파일 고르기'))
    await user.upload(screen.getByLabelText('엑셀 파일 고르기'), await xlsxFile('지어낸모임.xlsx', clubSheets()))

    expect(await readExcelScreen()).toBeInTheDocument()
  })

  it('AC-29 기록 파일 불러오기에서 엑셀 파일을 고르면 엑셀 불러오기로 안내하고 장부는 그대로다', async () => {
    const repository = new MemoryRepository(ONE_BOOK)
    renderApp(repository)
    const user = userEvent.setup({ applyAccept: false })
    await user.click(screen.getByRole('button', { name: '설정' }))
    // 서버 주소 없는 빌드라 설정 맨 위 카드에 기록 파일 두 줄 (기록 파일 형식만 받는 칸이지만 폰은 다른 파일도 고를 수 있다)
    await user.click(screen.getByRole('button', { name: /^기록 파일 불러오기/ }))

    await user.upload(screen.getByLabelText('기록 파일 고르기'), await xlsxFile('지어낸모임.xlsx', clubSheets()))

    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText('이 파일은 엑셀 파일이에요')).toBeInTheDocument()
    expect(dialog.getByText('[엑셀 파일 불러오기]에서 열어 주세요')).toBeInTheDocument()
    expect(repository.load().data).toEqual(ONE_BOOK)
  })

  it('AC-29 첫 실행에서 엑셀 대신 기록 파일을 고르면 위쪽 [기록 파일 불러오기]로 안내한다 (#178 리뷰)', async () => {
    renderApp(new MemoryRepository())
    const user = userEvent.setup({ applyAccept: false })
    await user.click(screen.getByRole('button', { name: '엑셀 파일 불러오기' }))

    await user.upload(screen.getByLabelText('엑셀 파일 고르기'), new File(['{}'], '우리장부-기록-2026-11-23.txt', { type: 'text/plain' }))

    expect(await screen.findByRole('heading', { level: 1, name: '이 파일은 기록 파일이에요' })).toBeInTheDocument()
    expect(screen.getByText('위쪽 [기록 파일 불러오기]에서 열어 주세요')).toBeInTheDocument()
  })

  it('기록 파일 불러오기에서 엑셀이 아닌 zip 파일(.zip·.docx 등, 머리가 같음)을 고르면 엑셀이라고 하지 않는다 (#178 리뷰)', async () => {
    renderApp(new MemoryRepository(ONE_BOOK))
    const user = userEvent.setup({ applyAccept: false })
    await user.click(screen.getByRole('button', { name: '설정' }))
    await user.click(screen.getByRole('button', { name: /^기록 파일 불러오기/ }))
    const zipBytes = await (await xlsxFile('같은 머리.xlsx', clubSheets())).arrayBuffer()

    await user.upload(screen.getByLabelText('기록 파일 고르기'), new File([zipBytes], '사진 모음.zip'))

    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText('이 파일은 열 수 없어요')).toBeInTheDocument()
    expect(dialog.queryByText('이 파일은 엑셀 파일이에요')).not.toBeInTheDocument()
  })
})
