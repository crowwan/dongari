import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

// 동아리 장부(v1 예시) + 가계부 장부. 가계부를 마지막에 봤다
const TWO_BOOKS: StoredData = {
  ...storedWith(),
  books: [
    book([EXAMPLE_2026], { id: 'club', name: '한랑드림' }),
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
      new File([JSON.stringify(TWO_BOOKS)], '동아리회계-백업-2026-10-03.txt', { type: 'text/plain' }),
    )
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '불러오기' }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('우리집 가계부')
    expect(repository.load().data).toEqual(TWO_BOOKS)
  })
})
