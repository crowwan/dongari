import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Ledger, StoredData } from './domain/types'
import type { LedgerRepository } from './storage/LedgerRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { isStoredData } from './storage/schema'
import { book, savedLedger, storedWith } from './test/ledgerFixtures'

const TODAY = new Date('2026-10-03T09:00:00.000+09:00')

const LEDGER_2026: Ledger = { year: 2026, carryover: 200_000, entries: [] }

// 진입점(main.tsx)처럼 저장소를 한 번 읽어 넘긴다
function renderApp(repository: LedgerRepository) {
  let seq = 0
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY, createId: () => `id-${++seq}` }} />)
  return repository
}

async function openSettings() {
  await userEvent.click(screen.getByRole('button', { name: '설정' }))
}

describe('SPEC-010 앱 설정 회원 명단·월 회비 (6절)', () => {
  it('설정 › 회원 명단에서 회원을 넣으면 지금 장부에 저장되고(시작 달 장부 연도 1월) "회원을 넣었어요"를 알린다', async () => {
    const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
    await openSettings()

    await userEvent.click(screen.getByRole('button', { name: /^회원 명단/ }))
    await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
    await userEvent.type(screen.getByLabelText('이름'), '김도윤')
    await userEvent.click(screen.getByRole('button', { name: '넣기' }))

    expect(screen.getByRole('status')).toHaveTextContent('회원을 넣었어요')
    expect(screen.getByRole('button', { name: '김도윤 10월에 들어왔어요' })).toBeInTheDocument()
    const saved = repository.load().data
    expect(saved.books[0]?.members).toEqual([{ id: 'id-1', name: '김도윤', joined: '2026-10', off: [] }])
    expect(saved.books[0]?.dues).toEqual({ startMonth: '2026-01' })
    expect(isStoredData(saved)).toBe(true)
  })

  it('AC-20 개인 가계부 장부의 설정에는 회원 명단·월 회비 줄이 없다', async () => {
    const household: StoredData = { ...storedWith(), books: [book([LEDGER_2026], { kind: 'household' })] }
    renderApp(new MemoryRepository(household))
    await openSettings()

    expect(screen.getByRole('button', { name: /^종류/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^회원 명단/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^월 회비/ })).not.toBeInTheDocument()
  })

  it('AC-20 새 연도 장부를 시작하면 작년 월 회비를 가져와 설정에 보이고 저장된다', async () => {
    const repository = renderApp(new MemoryRepository(storedWith({ ...LEDGER_2026, year: 2025, monthlyFee: 20_000 })))

    await userEvent.click(screen.getByRole('button', { name: '시작하기' }))
    await openSettings()

    expect(screen.getByRole('button', { name: '월 회비 2026년 20,000원' })).toBeInTheDocument()
    expect(savedLedger(repository, 2026)?.monthlyFee).toBe(20_000)
  })

  it('월 회비를 바꾸면 그 해 장부에 저장되고 "바꿨어요"를 알린다', async () => {
    const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
    await openSettings()

    await userEvent.click(screen.getByRole('button', { name: '월 회비 2026년 정하지 않음' }))
    await userEvent.type(screen.getByLabelText('2026년 월 회비'), '20000')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(screen.getByRole('status')).toHaveTextContent('바꿨어요')
    expect(savedLedger(repository, 2026)?.monthlyFee).toBe(20_000)
  })
})
