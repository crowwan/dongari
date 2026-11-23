import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Book, Entry, Ledger, Member, StoredData } from './domain/types'
import type { LedgerRepository } from './storage/LedgerRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { isStoredData } from './storage/schema'
import { book, savedLedger, storedWith } from './test/ledgerFixtures'

// 오늘은 2026년 10월 17일
const TODAY = new Date('2026-10-17T09:00:00.000+09:00')

// 지어낸 회원 (2026년 월 회비 20,000원)
const MEMBERS: Member[] = [
  { id: 'm-kim', name: '김도윤', joined: '2026-01', off: [] },
  { id: 'm-kang', name: '강민지', joined: '2026-01', off: [] },
  { id: 'm-lee', name: '이준호', joined: '2026-01', off: [] },
]

// 9월 3일에 김도윤·강민지가 2만 원씩 낸 회비
const PAID: Entry = {
  id: 'paid',
  month: 9,
  day: 3,
  type: 'income',
  name: '회비',
  amount: 40_000,
  createdAt: '2026-09-03T00:00:00.000Z',
  payers: [
    { memberId: 'm-kim', amount: 20_000 },
    { memberId: 'm-kang', amount: 20_000 },
  ],
}

const LEDGER_2026: Ledger = { year: 2026, carryover: 0, monthlyFee: 20_000, entries: [PAID] }

function stored(overrides: Partial<Omit<Book, 'ledgers'>> = {}): StoredData {
  return { ...storedWith(), books: [book([LEDGER_2026], { members: MEMBERS, dues: { startMonth: '2026-01' }, ...overrides })] }
}

function renderApp(repository: LedgerRepository) {
  let seq = 0
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY, createId: () => `id-${++seq}` }} />)
  return repository
}

const actionButton = () => within(screen.getByTestId('bottom-action-bar')).getByRole('button')

// [+ 내역 적기] → 오늘 17일 → 항목
async function pickItem(name: RegExp) {
  await userEvent.click(screen.getByRole('button', { name: '내역 적기' }))
  await userEvent.click(screen.getByRole('button', { name: '오늘 17일' }))
  await userEvent.click(within(screen.getByRole('group', { name: '자주 쓴 항목' })).getByRole('button', { name }))
}

describe('SPEC-010 회비 적기·고치기 (3절)', () => {
  it('AC-10 명단이 있는 동아리 장부에서 수입 "회비"를 고르면 "누가 냈어요?" 가 나온다', async () => {
    renderApp(new MemoryRepository(stored()))

    await pickItem(/^회비 수입/)

    expect(screen.getByRole('heading', { level: 2, name: '누가 냈어요?' })).toBeInTheDocument()
  })

  it.each<[string, StoredData]>([
    ['명단이 빈 동아리 장부', stored({ members: [] })],
    ['개인 가계부 (명단은 숨김)', stored({ kind: 'household' })],
  ])('AC-10 %s 에서는 "누가 냈어요?" 없이 지금처럼 금액으로 간다', async (_label, data) => {
    renderApp(new MemoryRepository(data))

    await pickItem(/^회비 수입/)

    expect(screen.getByRole('heading', { level: 2, name: '얼마인가요?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: '누가 냈어요?' })).not.toBeInTheDocument()
  })

  it('AC-11·AC-13 [지난번 낸 분] 으로 적은 회비는 낸 분과 함께 저장되고 장부 줄에 "17일 · 수입 · 2명", 연달아 적는 다음 내역에는 낸 분이 넘어가지 않는다', async () => {
    const repository = renderApp(new MemoryRepository(stored()))

    await pickItem(/^회비 수입/)
    await userEvent.click(screen.getByRole('button', { name: '지난번 낸 분 2명' }))
    await userEvent.click(actionButton())
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    const saved = savedLedger(repository, 2026)?.entries.at(-1)
    expect(saved).toMatchObject({ month: 10, day: 17, name: '회비', amount: 40_000, payers: PAID.payers })
    expect(isStoredData(repository.load().data)).toBe(true)

    // 연달아 적기: 다음 회비는 아무도 체크되지 않은 채 묻는다
    await userEvent.click(screen.getByRole('button', { name: '방금 17일' }))
    await userEvent.click(within(screen.getByRole('group', { name: '자주 쓴 항목' })).getByRole('button', { name: /^회비 수입/ }))
    expect(screen.getAllByRole('checkbox').filter((box) => box.getAttribute('aria-checked') === 'true')).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: '장부로' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '버리기' }))
    expect(screen.getByRole('button', { name: '회비 17일 · 수입 · 2명 +40,000원' })).toBeInTheDocument()
  })

  it('AC-14 [+ 회원 넣기] 로 넣은 분은 명단에 저장되고(들어온 달 = 이 기록의 달) 그분이 낸 회비로 저장된다', async () => {
    const repository = renderApp(new MemoryRepository(stored()))

    await pickItem(/^회비 수입/)
    await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
    await userEvent.type(within(screen.getByRole('dialog', { name: '회원 넣기' })).getByLabelText('이름'), '한지우')
    await userEvent.click(within(screen.getByRole('dialog', { name: '회원 넣기' })).getByRole('button', { name: '넣기' }))

    expect(screen.getByRole('status')).toHaveTextContent('회원을 넣었어요')
    expect(screen.getByRole('checkbox', { name: '한지우' })).toBeChecked()
    await userEvent.click(actionButton())
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    const data = repository.load().data
    expect(data.books[0]?.members?.at(-1)).toEqual({ id: 'id-1', name: '한지우', joined: '2026-10', off: [] })
    expect(savedLedger(repository, 2026)?.entries.at(-1)?.payers).toEqual([{ memberId: 'id-1', amount: 20_000 }])
    expect(isStoredData(data)).toBe(true)
  })

  it('AC-15 고치기에서 회비를 회비가 아닌 항목으로 바꾸면 확인 창 [바꾸기] 뒤 낸 분이 지워지고 저장 형식 검사를 통과한다', async () => {
    const repository = renderApp(new MemoryRepository(stored()))
    await userEvent.click(screen.getByRole('button', { name: '이전 달' }))

    await userEvent.click(screen.getByRole('button', { name: '회비 3일 · 수입 · 2명 +40,000원' }))
    expect(screen.getByRole('checkbox', { name: '김도윤' })).toBeChecked()
    await userEvent.click(within(screen.getByRole('group', { name: '자주 쓴 항목' })).getByRole('button', { name: /^대관료/ }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: '낸 분 기록이 지워져요' })).getByRole('button', { name: '바꾸기' }))

    expect(screen.getByRole('status')).toHaveTextContent('고쳤어요')
    const edited = savedLedger(repository, 2026)?.entries.find((entry) => entry.id === 'paid')
    expect(edited).toMatchObject({ name: '대관료', type: 'expense' })
    expect(edited).not.toHaveProperty('payers')
    expect(isStoredData(repository.load().data)).toBe(true)
  })

  it('AC-15 고치기에서 낸 분을 하나 더 고르고 금액을 바꾸면 똑같이 나눠 저장한다', async () => {
    const repository = renderApp(new MemoryRepository(stored()))
    await userEvent.click(screen.getByRole('button', { name: '이전 달' }))

    await userEvent.click(screen.getByRole('button', { name: '회비 3일 · 수입 · 2명 +40,000원' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '이준호' }))
    await userEvent.clear(screen.getByLabelText('얼마인가요?'))
    await userEvent.type(screen.getByLabelText('얼마인가요?'), '60000')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(savedLedger(repository, 2026)?.entries.find((entry) => entry.id === 'paid')?.payers).toEqual([
      { memberId: 'm-kim', amount: 20_000 },
      { memberId: 'm-kang', amount: 20_000 },
      { memberId: 'm-lee', amount: 20_000 },
    ])
    expect(screen.getByRole('button', { name: '회비 3일 · 수입 · 3명 +60,000원' })).toBeInTheDocument()
  })
})
