import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Book, Entry, Ledger, Member, StoredData } from './domain/types'
import type { LedgerRepository } from './storage/LedgerRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { isStoredData } from './storage/schema'
import { book, savedLedger, storedWith } from './test/ledgerFixtures'

// 기준 달(지난달)은 10월
const TODAY = new Date('2026-11-23T09:00:00.000+09:00')

function dues(id: string, month: number, day: number, payers: [string, number][], year = 2026): Entry {
  return {
    id,
    month,
    day,
    type: 'income',
    name: '회비',
    amount: payers.reduce((sum, [, amount]) => sum + amount, 0),
    createdAt: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    payers: payers.map(([memberId, amount]) => ({ memberId, amount })),
  }
}

// 지어낸 회원 셋 (월 회비 2만 원, 회비 표 2025년 1월부터)
// 2025년: 김도윤·강민지 한 해 치를 1월에 냄. 2026년: 김도윤 9월까지(10월 덜 냄), 강민지 11월까지, 박서연 7월에 들어와 11월까지
const MEMBERS: Member[] = [
  { id: 'm1', name: '김도윤', joined: '2025-01', off: [] },
  { id: 'm2', name: '강민지', joined: '2025-01', off: [] },
  { id: 'm3', name: '박서연', joined: '2026-07', off: [] },
]
const LEDGER_2025: Ledger = {
  year: 2025,
  carryover: 0,
  monthlyFee: 20_000,
  entries: [dues('d25', 1, 10, [['m1', 240_000], ['m2', 240_000]], 2025)],
}
const LEDGER_2026: Ledger = {
  year: 2026,
  carryover: 0,
  entries: [
    dues('d1', 1, 19, [['m1', 180_000], ['m2', 220_000]]),
    dues('d2', 7, 1, [['m3', 100_000]]),
    { id: 'x1', month: 11, day: 3, type: 'expense', name: '간식비', amount: 30_000, createdAt: '2026-11-03T00:00:00.000Z' },
  ],
}

function clubData(overrides: Partial<Omit<Book, 'ledgers'>> = { members: MEMBERS, dues: { startMonth: '2025-01' } }): StoredData {
  return { ...storedWith(), books: [book([LEDGER_2025, LEDGER_2026], overrides)] }
}

// 진입점(main.tsx)처럼 저장소를 한 번 읽어 넘긴다
function renderApp(data: StoredData): LedgerRepository {
  const repository = new MemoryRepository(data)
  let seq = 0
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY, createId: () => `id-${++seq}` }} />)
  return repository
}

async function openDues() {
  await userEvent.click(screen.getByRole('button', { name: /^회비 표/ }))
}

// 사람별 줄 이름(줄 버튼 이름의 첫 낱말) 순서
function rowNames(): string[] {
  const list = screen.getByRole('list', { name: /년 회원$/ })
  return within(list)
    .getAllByRole('button')
    .map((row) => row.textContent?.split(' ')[0] ?? '')
}

describe('SPEC-010 회비 표·한 분 보기 (4·5절, #163)', () => {
  describe('AC-16 장부 [회비 표] 버튼', () => {
    it('AC-16 동아리 장부 화면에 [회비 표]가 [N월 정리 보기] 바로 아래 있고 지난달까지 덜 낸 분 수가 보인다', () => {
      renderApp(clubData())

      const button = screen.getByRole('button', { name: '회비 표 · 지난달까지 덜 낸 분 1명' })
      const monthSummary = screen.getByRole('button', { name: '11월 정리 보기' })
      expect(monthSummary.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(button.compareDocumentPosition(screen.getByTestId('month-card')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('AC-16 명단이 없거나 덜 낸 분이 없으면 숫자 없이 "회비 표"만, 그 달 기록이 없어도 버튼은 있다', () => {
      renderApp(clubData({}))

      expect(screen.getByRole('button', { name: '회비 표' })).toBeInTheDocument()
    })

    it('AC-16 개인 가계부에는 [회비 표]가 없다', () => {
      renderApp({ ...storedWith(), books: [book([LEDGER_2026], { kind: 'household', members: MEMBERS, dues: { startMonth: '2025-01' } })] })

      expect(screen.queryByRole('button', { name: /^회비 표/ })).not.toBeInTheDocument()
    })
  })

  describe('AC-17 회비 표', () => {
    it('AC-17 올해 표를 열고, 덜 낸 분을 먼저 그다음 가나다로 보여 주며 줄마다 낸 돈·상태 한 줄이 있다', async () => {
      renderApp(clubData())
      await openDues()

      expect(screen.getByRole('heading', { level: 1, name: '2026년 회비' })).toBeInTheDocument()
      expect(rowNames()).toEqual(['김도윤', '강민지', '박서연'])
      expect(screen.getByRole('button', { name: '김도윤 180,000원 9월까지 · 2만 원 덜 냄' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '강민지 220,000원 11월까지 냈어요' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '박서연 100,000원 7월에 들어왔어요' })).toBeInTheDocument()
      expect(screen.getByText('20,000원')).toBeInTheDocument()
    })

    it('AC-17 알약을 누르면 그 묶음만, 다시 누르면 모두 보인다', async () => {
      renderApp(clubData())
      await openDues()

      const behind = screen.getByRole('button', { name: '덜 낸 분 1명' })
      await userEvent.click(behind)
      expect(behind).toHaveAttribute('aria-pressed', 'true')
      expect(rowNames()).toEqual(['김도윤'])

      await userEvent.click(screen.getByRole('button', { name: '다 낸 분 2명' }))
      expect(rowNames()).toEqual(['강민지', '박서연'])

      await userEvent.click(screen.getByRole('button', { name: '다 낸 분 2명' }))
      expect(rowNames()).toEqual(['김도윤', '강민지', '박서연'])
    })

    it('AC-17 해 넘기기로 지난 해(12월 기준)를 보고, 장부 연도는 바뀌지 않는다', async () => {
      renderApp(clubData())
      await openDues()

      await userEvent.click(screen.getByRole('button', { name: '이전 해' }))

      expect(screen.getByRole('heading', { level: 1, name: '2025년 회비' })).toBeInTheDocument()
      expect(rowNames()).toEqual(['강민지', '김도윤'])
      expect(screen.getByRole('button', { name: '김도윤 240,000원 2026년 9월까지 냈어요' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '이전 해' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '다음 해' })).toBeEnabled()

      await userEvent.click(screen.getByRole('button', { name: '장부로' }))
      expect(await screen.findByTestId('ledger-year')).toHaveTextContent('2026년')
    })

    it('결산 › 단톡방용 요약 "수입 항목별"의 회비 줄을 누르면 그 해 회비 표로 오고, [‹ 장부로] 는 장부로 간다', async () => {
      renderApp(clubData())
      await userEvent.click(screen.getByRole('button', { name: '결산' }))

      const income = screen.getByRole('region', { name: '수입 항목별' })
      await userEvent.click(within(income).getByRole('button', { name: '회비 2건 500,000원 회비 표 보기' }))

      expect(screen.getByRole('heading', { level: 1, name: '2026년 회비' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '장부로' }))
      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    })

    it('월 회비 [바꾸기]는 보고 있는 해의 월 회비를 고치고 [‹ 회비 표]로 돌아온다', async () => {
      const repository = renderApp(clubData())
      await openDues()
      await userEvent.click(screen.getByRole('button', { name: '이전 해' }))

      await userEvent.click(screen.getByRole('button', { name: '월 회비 바꾸기' }))
      const field = screen.getByLabelText('2025년 월 회비')
      await userEvent.clear(field)
      await userEvent.type(field, '25000')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(await screen.findByRole('heading', { level: 1, name: '2025년 회비' })).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('바꿨어요')
      expect(savedLedger(repository, 2025)?.monthlyFee).toBe(25_000)
      expect(savedLedger(repository, 2026)?.monthlyFee).toBeUndefined()
    })

    it('월 회비를 정하지 않은 해는 "YYYY년 월 회비를 정해 주세요" + [정하기]', async () => {
      renderApp({
        ...storedWith(),
        books: [book([{ ...LEDGER_2026 }], { members: MEMBERS, dues: { startMonth: '2026-01' } })],
      })
      await openDues()

      expect(screen.getByText('2026년 월 회비를 정해 주세요')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '월 회비 정하기' }))
      expect(screen.getByRole('heading', { level: 1, name: '월 회비 정하기' })).toBeInTheDocument()
    })
  })

  describe('AC-18 명단이 없을 때', () => {
    it('AC-18 명단이 없으면 안내와 [회원 넣기]만 보이고, [회원 넣기]는 회원 명단을 연다 ([‹ 회비 표]로 돌아옴)', async () => {
      renderApp(clubData({}))
      await openDues()

      expect(screen.getByText('회원 명단을 넣으면 누가 냈는지 보여요')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: /회비 요약$/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('list', { name: /년 회원$/ })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
      expect(screen.getByRole('heading', { level: 1, name: '회원 명단' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '회비 표' }))
      expect(await screen.findByRole('heading', { level: 1, name: '2026년 회비' })).toBeInTheDocument()
    })
  })

  describe('AC-19 한 분 보기와 쉬는 기간', () => {
    async function openKim() {
      await openDues()
      await userEvent.click(screen.getByRole('button', { name: /^김도윤/ }))
    }

    it('줄을 누르면 한 분 보기: 요약·12칸 달력(채운 입금 날짜)·낸 기록이 보인다', async () => {
      renderApp(clubData())
      await openKim()

      expect(screen.getByRole('heading', { level: 1, name: '김도윤 회원 정보 바꾸기' })).toBeInTheDocument()
      const summary = screen.getByRole('region', { name: '요약' })
      expect(within(summary).getByText('2026년에 낸 돈').nextSibling).toHaveTextContent('180,000원')
      expect(within(summary).getByText('채운 달').nextSibling).toHaveTextContent('9월까지')
      expect(within(summary).getByText('덜 낸 돈 (10월까지)').nextSibling).toHaveTextContent('20,000원')
      const calendar = screen.getByRole('group', { name: '2026년 달마다' })
      expect(within(calendar).getByRole('button', { name: '1월 1/19 냄' })).toBeInTheDocument()
      expect(within(calendar).getByRole('button', { name: '10월 아직' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '낸 기록' })).toBeInTheDocument()
      expect(screen.getByText('1~9월 칸 · 같이 낸 분 1명')).toBeInTheDocument()
    })

    it('AC-19 달 칸 → [10월부터 쉬어요] → 끝 달을 고르면 그 달들이 쉬는 달로 저장되고 표가 다시 계산된다', async () => {
      const repository = renderApp(clubData())
      await openKim()

      await userEvent.click(screen.getByRole('button', { name: '10월 아직' }))
      const sheet = screen.getByRole('dialog', { name: '김도윤 · 10월' })
      expect(within(sheet).getByText('아직 채워지지 않았어요. 이 달에 회비를 안 내는 거면 쉬는 달로 표시해 주세요')).toBeInTheDocument()
      await userEvent.click(within(sheet).getByRole('button', { name: '10월부터 쉬어요' }))
      const until = screen.getByRole('dialog', { name: '언제까지 쉬나요?' })
      expect(within(until).getByRole('button', { name: '9월' })).toBeDisabled()
      await userEvent.click(within(until).getByRole('button', { name: '12월' }))

      expect(screen.getByRole('status')).toHaveTextContent('바꿨어요')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      for (const month of ['10월', '11월', '12월']) expect(screen.getByRole('button', { name: `${month} 쉼` })).toBeInTheDocument()
      const saved = repository.load().data
      expect(saved.books[0]?.members?.[0]?.off).toEqual(['2026-10', '2026-11', '2026-12'])
      expect(isStoredData(saved)).toBe(true)

      await userEvent.click(screen.getByRole('button', { name: '회비 표' }))
      expect(await screen.findByRole('button', { name: '김도윤 180,000원 10월부터 쉬어요' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '쉬는 분 1명' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^덜 낸 분/ })).not.toBeInTheDocument()
    })

    it('[아직 몰라요]는 다음 해 12월까지 쉬는 달로, 쉬는 달 칸의 [N월부터 다시 내요]는 그 달부터 이어진 쉬는 달을 지운다', async () => {
      const repository = renderApp(clubData())
      await openKim()

      await userEvent.click(screen.getByRole('button', { name: '11월 아직' }))
      await userEvent.click(screen.getByRole('button', { name: '11월부터 쉬어요' }))
      await userEvent.click(screen.getByRole('button', { name: '아직 몰라요' }))
      const off = repository.load().data.books[0]?.members?.[0]?.off
      expect(off?.[0]).toBe('2026-11')
      expect(off?.at(-1)).toBe('2027-12')
      expect(off).toHaveLength(14)

      await userEvent.click(screen.getByRole('button', { name: '11월 쉼' }))
      await userEvent.click(within(screen.getByRole('dialog', { name: '김도윤 · 11월' })).getByRole('button', { name: '11월부터 다시 내요' }))

      expect(repository.load().data.books[0]?.members?.[0]?.off).toEqual([])
      expect(screen.getByRole('button', { name: '11월 아직' })).toBeInTheDocument()
    })

    it('[닫기]는 아무것도 바꾸지 않고 창만 닫는다', async () => {
      const repository = renderApp(clubData())
      await openKim()

      await userEvent.click(screen.getByRole('button', { name: '10월 아직' }))
      await userEvent.click(screen.getByRole('button', { name: '닫기' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(repository.load().data.books[0]?.members?.[0]?.off).toEqual([])
    })

    it('이름 [›] 은 회원 정보 바꾸기를 열고, [‹ 김도윤] 으로 한 분 보기에 돌아온다', async () => {
      renderApp(clubData())
      await openKim()

      await userEvent.click(screen.getByRole('button', { name: '김도윤 회원 정보 바꾸기' }))
      expect(screen.getByRole('heading', { level: 1, name: '회원 정보 바꾸기' })).toBeInTheDocument()
      expect(screen.getByLabelText('이름')).toHaveValue('김도윤')

      await userEvent.click(screen.getByRole('button', { name: '김도윤' }))
      expect(await screen.findByRole('heading', { level: 1, name: '김도윤 회원 정보 바꾸기' })).toBeInTheDocument()
    })
  })
})
