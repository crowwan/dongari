import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { StoredData } from './domain/types'
import type { LedgerRepository } from './storage/LedgerRepository'
import { LocalStorageRepository, OLD_VERSION_KEY_PREFIX, STORAGE_KEY } from './storage/LocalStorageRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { book, ledger, storedWith, V1_EXAMPLE_YEAR } from './test/ledgerFixtures'

const TODAY = new Date('2026-10-03T09:00:00.000+09:00')

// 진입점(main.tsx)처럼 저장소를 한 번 읽어 넘긴다
function renderApp(repository: LedgerRepository) {
  let seq = 0
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY, createId: () => `id-${++seq}` }} />)
  return repository
}

// v1 예시 1년치를 2026년 장부로 (잔액 152,905원)
const EXAMPLE_2026 = ledger(V1_EXAMPLE_YEAR, { year: 2026 })

// 동아리 장부(v1 예시, 잔액 152,905원)
const CLUB_BOOK = book([EXAMPLE_2026], { id: 'club', name: '한랑드림' })

// 동아리 장부 + 가계부 장부. 가계부를 마지막에 봤다
const TWO_BOOKS: StoredData = {
  ...storedWith(),
  books: [
    CLUB_BOOK,
    book([ledger([[10, 'income', '연금', 500_000]], { year: 2026, carryover: 1_000_000 })], {
      id: 'home',
      name: '우리집 가계부',
      kind: 'household',
    }),
  ],
  settings: { lastBookId: 'home', lastChangedAt: '2026-10-01T00:00:00.000Z', lastBackupAt: '2026-10-01T00:00:00.000Z' },
}

describe('SPEC-005 여러 장부 저장 형식 (화면)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('AC-1 지금(v2) 기록으로 새 버전을 열면 같은 이름·잔액·결산의 장부 하나로 보이고, 바꾸면 v3 로 저장되며 옛 기록은 보관된다', async () => {
    const v2Raw = JSON.stringify({ schemaVersion: 2, ledgers: { '2026': { ...EXAMPLE_2026, clubName: '한랑드림' } }, settings: {} })
    localStorage.setItem(STORAGE_KEY, v2Raw)

    renderApp(new LocalStorageRepository())

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('한랑드림')
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('152,905원')
    await userEvent.click(screen.getByRole('button', { name: '결산' }))
    expect(screen.getByRole('heading', { name: '<2026년 한랑드림 수입 지출 내역>' })).toBeInTheDocument()
    expect(within(screen.getByTestId('year-month-table')).getByText('1,777,203')).toBeInTheDocument()
    expect(within(screen.getByTestId('year-month-table')).getByText('1,994,780')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '장부로' }))
    await userEvent.click(screen.getByRole('button', { name: '설정' }))
    await userEvent.click(screen.getByRole('button', { name: /^작년 이월금/ }))
    await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')).toMatchObject({ schemaVersion: 3, books: [{ name: '한랑드림', kind: 'club' }] })
    expect(localStorage.getItem(`${OLD_VERSION_KEY_PREFIX}2`)).toBe(v2Raw)
  })

  it('AC-2 앱을 열면 마지막에 본 장부가 열린다', () => {
    renderApp(new MemoryRepository(TWO_BOOKS))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('우리집 가계부')
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('1,500,000원')
  })

  it('AC-6 장부 화면·설정은 지금 장부의 기록·이월금·연도만 보여 준다', async () => {
    renderApp(new MemoryRepository({ ...TWO_BOOKS, settings: { ...TWO_BOOKS.settings, lastBookId: 'club' } }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('한랑드림')
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('152,905원')
    expect(screen.queryByText('연금')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(screen.getByRole('button', { name: /^작년 이월금/ })).toHaveTextContent('370,482원')
  })

  it('AC-8 장부 여러 개가 든 백업 파일을 불러오면 모든 장부가 그대로 돌아오고 파일의 마지막에 본 장부가 열린다', async () => {
    const repository = renderApp(new MemoryRepository())
    await userEvent.click(screen.getByRole('button', { name: '백업 불러오기' }))
    await userEvent.upload(
      screen.getByLabelText('백업 파일 고르기'),
      new File([JSON.stringify(TWO_BOOKS)], '우리장부-백업-2026-10-03.txt', { type: 'text/plain' }),
    )
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '불러오기' }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('우리집 가계부')
    expect(repository.load().data).toEqual(TWO_BOOKS)
  })
})

// 안드로이드 뒤로 버튼: 브라우저가 방문 기록을 하나 빼고 popstate 를 보낸다
function pressBackButton() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
}

// 위쪽 이름 ▾ 버튼 → "어느 장부를 볼까요?" 창
async function openBookSheet() {
  await userEvent.click(screen.getByTestId('book-button'))
  return within(screen.getByRole('dialog', { name: '어느 장부를 볼까요?' }))
}

async function createBook(kind: '동아리·모임' | '개인 가계부', name: string) {
  await userEvent.click(screen.getByRole('button', { name: kind }))
  await userEvent.type(screen.getByLabelText('장부 이름'), name)
  await userEvent.click(screen.getByRole('button', { name: '만들기' }))
}

describe('SPEC-005 장부 바꾸기·새 장부·지우기 (화면)', () => {
  it('AC-3 이름 버튼 → 창에서 다른 장부를 누르면 그 장부의 이번 달 장부 화면이 열리고 마지막에 본 장부로 저장된다', async () => {
    const repository = renderApp(new MemoryRepository(TWO_BOOKS))
    await userEvent.click(screen.getByRole('button', { name: '이전 달' }))

    const sheet = await openBookSheet()
    expect(sheet.getByRole('button', { name: /^한랑드림/ })).toHaveTextContent('동아리 · 잔액 152,905원')
    expect(sheet.getByRole('button', { name: /^우리집 가계부/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(sheet.getByRole('button', { name: /^한랑드림/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('한랑드림')
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('152,905원')
    expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('10월')
    expect(repository.load().data.settings.lastBookId).toBe('club')
  })

  it('장부 고르기 창에서 뒤로 버튼은 창만 닫는다', async () => {
    renderApp(new MemoryRepository(TWO_BOOKS))
    await openBookSheet()

    pressBackButton()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('우리집 가계부')
  })

  it('AC-4 창의 [+ 새 장부 만들기] → 새 장부 만들기 화면, 뒤로 버튼 한 번에 장부로 돌아온다', async () => {
    renderApp(new MemoryRepository(TWO_BOOKS))
    const sheet = await openBookSheet()

    await userEvent.click(sheet.getByRole('button', { name: '새 장부 만들기' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '새 장부 만들기' })).toBeInTheDocument()
    pressBackButton()
    expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('우리집 가계부')
  })

  it('AC-4 새 장부를 만들면 그 장부의 올해 장부 화면으로 가고 "새 장부를 만들었어요" 알림이 뜬다', async () => {
    const repository = renderApp(new MemoryRepository(TWO_BOOKS))
    await userEvent.click((await openBookSheet()).getByRole('button', { name: '새 장부 만들기' }))

    await createBook('동아리·모임', '꽃동산')

    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('꽃동산')
    expect(screen.getByTestId('ledger-year')).toHaveTextContent('2026년')
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('0원')
    expect(screen.getByRole('status')).toHaveTextContent('새 장부를 만들었어요')
    expect(repository.load().data.books.map((item) => item.name)).toEqual(['한랑드림', '우리집 가계부', '꽃동산'])
    expect(repository.load().data.settings.lastBookId).toBe('id-1')
  })

  it('AC-5·AC-11 가계부를 만들어 가계부 기본 항목으로 한 건 적은 뒤 동아리 장부로 돌아올 수 있다', async () => {
    const repository = renderApp(new MemoryRepository({ ...TWO_BOOKS, books: [CLUB_BOOK], settings: {} }))
    await userEvent.click((await openBookSheet()).getByRole('button', { name: '새 장부 만들기' }))
    await userEvent.click(screen.getByRole('button', { name: '개인 가계부' }))
    await userEvent.type(screen.getByLabelText('장부 이름'), '우리집')
    await userEvent.clear(screen.getByLabelText('지금 남은 돈'))
    await userEvent.type(screen.getByLabelText('지금 남은 돈'), '100000')
    await userEvent.click(screen.getByRole('button', { name: '만들기' }))
    await screen.findByTestId('ledger-screen')
    expect(screen.getByTestId('balance-card-note')).toHaveTextContent('처음 남은 돈 100,000원 포함')

    await userEvent.click(screen.getByRole('button', { name: '내역 적기' }))
    await userEvent.type(screen.getByLabelText('며칠인가요?'), '5')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    const items = within(screen.getByRole('group', { name: '자주 쓴 항목' })).getAllByRole('button')
    expect(items.map((item) => item.textContent)).toEqual(['장보기 지출', '관리비 지출', '병원비 지출', '연금 수입', '용돈 수입', '직접 적기'])
    expect(items[0]?.querySelector('[data-icon="cart"]')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '장보기 지출' }))
    await userEvent.type(screen.getByLabelText('얼마인가요?'), '30000')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await userEvent.click(screen.getByRole('button', { name: '다 적었어요' }))
    expect(await screen.findByTestId('balance-card-amount')).toHaveTextContent('70,000원')

    await userEvent.click((await openBookSheet()).getByRole('button', { name: /^한랑드림/ }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('한랑드림')
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('152,905원')
    expect(repository.load().data.books[1]?.ledgers['2026']?.entries).toMatchObject([{ name: '장보기', amount: 30_000 }])
  })

  it('AC-7 설정 [이 장부 지우기] → 확인 [지우기] 하면 그 장부만 지우고 남은 첫 장부의 장부 화면으로 간다', async () => {
    const repository = renderApp(new MemoryRepository({ ...TWO_BOOKS, settings: { ...TWO_BOOKS.settings, lastBookId: 'club' } }))
    await userEvent.click(screen.getByRole('button', { name: '설정' }))

    await userEvent.click(screen.getByRole('button', { name: '이 장부 지우기' }))
    const dialog = screen.getByRole('alertdialog', { name: '‘한랑드림’ 장부와 기록을 모두 지울까요?' })
    await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('우리집 가계부')
    expect(screen.getByRole('status')).toHaveTextContent('장부를 지웠어요')
    expect(repository.load().data.books.map((item) => item.id)).toEqual(['home'])
    expect(repository.load().data.settings.lastBookId).toBe('home')

    // 장부가 하나만 남으면 지우기 버튼이 없다
    await userEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(screen.queryByRole('button', { name: '이 장부 지우기' })).not.toBeInTheDocument()
  })

  it('AC-7 지우는 중 저장에 실패하면 아무것도 지우지 않고 설정에 남아 저장 실패를 알린다', async () => {
    const memory = new MemoryRepository(TWO_BOOKS)
    renderApp({ load: () => memory.load(), save: () => ({ ok: false, reason: 'quota-exceeded' }), restore: (data) => memory.restore(data) })
    await userEvent.click(screen.getByRole('button', { name: '설정' }))

    await userEvent.click(screen.getByRole('button', { name: '이 장부 지우기' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))

    expect(screen.getByTestId('settings-screen')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요')
    expect(screen.getByRole('button', { name: '이 장부 지우기' })).toBeInTheDocument()
    expect(memory.load().data.books).toHaveLength(2)
  })

  it('가계부 장부의 설정은 "장부 정보" 에 종류 "개인 가계부" 와 이월금 이름 "지금 남은 돈" 을 보인다', async () => {
    renderApp(new MemoryRepository(TWO_BOOKS))
    await userEvent.click(screen.getByRole('button', { name: '설정' }))

    const info = within(screen.getByRole('region', { name: '장부 정보' }))
    expect(info.getByRole('button', { name: /^종류/ })).toHaveTextContent('개인 가계부')
    expect(info.getByRole('button', { name: /^지금 남은 돈/ })).toHaveTextContent('1,000,000원')
  })
})
