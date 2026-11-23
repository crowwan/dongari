import { describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Book, Entry, Ledger, Member, StoredData } from './domain/types'
import type { LedgerRepository } from './storage/LedgerRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { isStoredData } from './storage/schema'
import { book, savedLedger, storedWith } from './test/ledgerFixtures'

// 오늘은 2026년 11월 24일
const TODAY = new Date('2026-11-24T09:00:00.000+09:00')

// 지어낸 회원 셋 (2025년부터 회원, 2025년 월 회비 20,000원을 2026년에도 이어 씀)
const MEMBERS: Member[] = [
  { id: 'm1', name: '김도윤', joined: '2025-01', off: [] },
  { id: 'm2', name: '강민지', joined: '2025-01', off: [] },
  { id: 'm3', name: '박서연', joined: '2025-01', off: [] },
]

function income(id: string, month: number, day: number | undefined, name: string, amount: number, extra: Partial<Entry> = {}): Entry {
  return {
    id,
    month,
    ...(day === undefined ? {} : { day }),
    type: 'income',
    name,
    amount,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
}

// 회비 표 시작 달 2025년 7월. 낸 분을 붙일 대상은 셋(오래된 것부터 2025년 9월 → 2026년 2월 3일 → 2026년 5월 7일):
// 시작 달 전 회비·낸 분이 있는 회비·지출 "회비"·회비가 아닌 수입은 대상이 아니다
const LEDGER_2025: Ledger = {
  year: 2025,
  carryover: 0,
  monthlyFee: 20_000,
  entries: [
    income('before', 3, 5, '회비', 40_000),
    income('u1', 9, undefined, '회비', 60_000, { sourceText: '9월 -3명: 김도윤,강민지,박서연(가을)' }),
    income('paid', 10, 1, '회비', 20_000, { payers: [{ memberId: 'm1', amount: 20_000 }] }),
  ],
}
const LEDGER_2026: Ledger = {
  year: 2026,
  carryover: 0,
  entries: [
    income('u3', 5, 7, '회비', 40_000),
    income('u2', 2, 3, '회비(14인)', 50_000),
    { id: 'exp', month: 5, day: 8, type: 'expense', name: '회비', amount: 30_000, createdAt: '2026-05-08T00:00:00.000Z' },
    income('gift', 6, 1, '찬조금', 100_000),
  ],
}

function clubData(overrides: Partial<Omit<Book, 'ledgers'>> = {}): StoredData {
  return {
    ...storedWith(),
    books: [book([LEDGER_2025, LEDGER_2026], { members: MEMBERS, dues: { startMonth: '2025-07' }, ...overrides })],
  }
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

async function openAssign() {
  await openDues()
  await userEvent.click(screen.getByRole('button', { name: '낸 분 붙이기' }))
}

const card = () => screen.queryByRole('region', { name: /^낸 분을 안 적은 회비/ })
const thisRecord = () => screen.getByRole('region', { name: '이 기록' })
const bar = () => screen.getByTestId('bottom-action-bar')
const nextButton = () => within(bar()).getByRole('button', { name: /^(다음|끝)$/ })

function savedEntry(repository: LedgerRepository, year: number, id: string): Entry | undefined {
  return savedLedger(repository, year)?.entries.find((entry) => entry.id === id)
}

function pressBackButton() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
}

describe('SPEC-010 낸 분 붙이기 (7절, #164)', () => {
  describe('AC-22 회비 표 카드', () => {
    it('AC-22 낸 분 없는 회비 기록(시작 달 이후)이 있으면 회비 표 요약 아래 카드가 뜬다 — 시작 달 전·낸 분 있는 회비·지출 회비는 세지 않는다', async () => {
      renderApp(clubData())
      await openDues()

      const shown = screen.getByRole('region', { name: '낸 분을 안 적은 회비 3건 · 150,000원' })
      expect(within(shown).getByText('낸 분을 붙이면 회비 표에 들어가요. 안 붙여도 잔액과 결산은 맞아요.')).toBeInTheDocument()
      expect(within(shown).getByRole('button', { name: '낸 분 붙이기' })).toBeInTheDocument()
      expect(within(shown).getByRole('button', { name: '이 카드 숨기기' })).toBeInTheDocument()
      // 요약 아래, 사람별 줄 위
      const summary = screen.getByRole('region', { name: '2026년 회비 요약' })
      expect(summary.compareDocumentPosition(shown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(shown.compareDocumentPosition(screen.getByRole('list', { name: '2026년 회원' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('AC-22 낸 분을 안 적은 회비가 없으면 카드가 없다', async () => {
      renderApp(clubData({ dues: { startMonth: '2026-06' } }))
      await openDues()

      expect(screen.getByRole('region', { name: '2026년 회비 요약' })).toBeInTheDocument()
      expect(card()).not.toBeInTheDocument()
    })

    it('AC-22 [이 카드 숨기기] 를 누르면 카드가 사라지고 장부에 저장되며, 회원 명단에서 붙일 수 있다고 알린다', async () => {
      const repository = renderApp(clubData())
      await openDues()

      await userEvent.click(screen.getByRole('button', { name: '이 카드 숨기기' }))

      expect(card()).not.toBeInTheDocument()
      // 누른 버튼이 사라져도 포커스가 화면 밖으로 떨어지지 않게 바로 위 요약 카드로 옮긴다 (#181 리뷰)
      expect(screen.getByRole('region', { name: '2026년 회비 요약' })).toHaveFocus()
      expect(screen.getByRole('status')).toHaveTextContent('카드를 숨겼어요. 회원 명단에서 붙일 수 있어요')
      const saved = repository.load().data
      expect(saved.books[0]?.dues).toEqual({ startMonth: '2025-07', hideUnassigned: true })
      expect(isStoredData(saved)).toBe(true)
    })

    it('AC-22 숨긴 뒤에는 새로 적은 낸 분 없는 회비가 있어도 카드가 뜨지 않는다', async () => {
      const repository = renderApp(clubData({ dues: { startMonth: '2025-07', hideUnassigned: true } }))
      await userEvent.click(screen.getByRole('button', { name: '내역 적기' }))
      await userEvent.click(screen.getByRole('button', { name: '오늘 24일' }))
      // 이 장부에서 "회비" 를 마지막에 쓴 것은 지출이라, 수입 회비 기록은 "회비(14인)" 으로 적는다
      await userEvent.click(within(screen.getByRole('group', { name: '자주 쓴 항목' })).getByRole('button', { name: /^회비\(14인\) 수입/ }))
      await userEvent.click(screen.getByRole('button', { name: '이름 없이 적기' }))
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '20000')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))
      await userEvent.click(screen.getByRole('button', { name: '다 적었어요' }))
      const added = savedLedger(repository, 2026)?.entries.at(-1)
      expect(added).toMatchObject({ month: 11, day: 24, name: '회비(14인)', amount: 20_000 })
      expect(added).not.toHaveProperty('payers')

      await openDues()

      expect(await screen.findByRole('heading', { level: 1, name: '2026년 회비' })).toBeInTheDocument()
      expect(card()).not.toBeInTheDocument()
    })
  })

  describe('AC-22 붙이기 화면', () => {
    it('AC-22 오래된 기록부터 "1 / 3": 이 기록 카드(날짜·항목·금액)와 엑셀 글 상자, "누가 냈어요?" 목록이 보인다', async () => {
      renderApp(clubData())
      await openAssign()

      expect(screen.getByRole('heading', { level: 1, name: '낸 분 붙이기' })).toBeInTheDocument()
      expect(screen.getByText('1 / 3')).toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: '진행' })).toHaveAttribute('aria-valuetext', '3건 중 1번째')
      const record = thisRecord()
      expect(within(record).getByText('2025년 9월')).toBeInTheDocument()
      expect(within(record).getByText('회비')).toBeInTheDocument()
      expect(within(record).getByText('60,000원')).toBeInTheDocument()
      expect(screen.getByRole('note', { name: '엑셀에 적혀 있던 글' })).toHaveTextContent('9월 -3명: 김도윤,강민지,박서연(가을)')
      expect(screen.getByRole('heading', { level: 2, name: '누가 냈어요?' })).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: '김도윤' })).not.toBeChecked()
      expect(nextButton()).toHaveTextContent('다음')
      expect(nextButton()).toBeDisabled()
      expect(within(bar()).getByText('누가 냈는지 골라 주세요')).toBeInTheDocument()
      expect(within(bar()).getByRole('button', { name: '건너뛰기' })).toBeEnabled()
    })

    it('AC-22 고르면 사람 수로 똑같이 나눈 몫을 보여 주고, [다음] 마다 저장하고 다음 기록으로 넘어간다 (엑셀 글이 없으면 상자 없음)', async () => {
      const repository = renderApp(clubData())
      await openAssign()

      await userEvent.click(screen.getByRole('button', { name: '모두 3명' }))
      expect(within(bar()).getByText('3명 · 한 분 20,000원')).toBeInTheDocument()
      await userEvent.click(nextButton())

      expect(savedEntry(repository, 2025, 'u1')?.payers).toEqual([
        { memberId: 'm2', amount: 20_000 },
        { memberId: 'm1', amount: 20_000 },
        { memberId: 'm3', amount: 20_000 },
      ])
      expect(savedEntry(repository, 2025, 'u1')?.sourceText).toBe('9월 -3명: 김도윤,강민지,박서연(가을)')
      expect(isStoredData(repository.load().data)).toBe(true)
      expect(screen.getByText('2 / 3')).toBeInTheDocument()
      // 고른 분이 비어 [다음] 이 비활성이 되므로 포커스를 새 기록 카드 머리로 옮긴다 (#181 리뷰)
      expect(within(thisRecord()).getByText('이 기록')).toHaveFocus()
      expect(within(thisRecord()).getByText('2월 3일')).toBeInTheDocument()
      expect(within(thisRecord()).getByText('회비(14인)')).toBeInTheDocument()
      expect(screen.queryByRole('note', { name: '엑셀에 적혀 있던 글' })).not.toBeInTheDocument()
      // 고른 분은 다음 기록으로 넘어가지 않는다
      expect(screen.getByRole('checkbox', { name: '김도윤' })).not.toBeChecked()
    })

    it('AC-22 [건너뛰기] 는 저장하지 않고 다음으로, 마지막 기록은 [끝] — 누르면 저장하고 회비 표로 돌아와 알리고 카드가 줄어든다', async () => {
      const repository = renderApp(clubData())
      await openAssign()

      await userEvent.click(within(bar()).getByRole('button', { name: '건너뛰기' }))
      expect(screen.getByText('2 / 3')).toBeInTheDocument()
      expect(within(thisRecord()).getByText('이 기록')).toHaveFocus()
      await userEvent.click(within(bar()).getByRole('button', { name: '건너뛰기' }))
      expect(screen.getByText('3 / 3')).toBeInTheDocument()
      expect(within(thisRecord()).getByText('5월 7일')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('checkbox', { name: '김도윤' }))
      await userEvent.click(screen.getByRole('checkbox', { name: '박서연' }))
      expect(nextButton()).toHaveTextContent('끝')
      await userEvent.click(nextButton())

      expect(await screen.findByRole('heading', { level: 1, name: '2026년 회비' })).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('낸 분을 붙였어요 · 1건')
      expect(savedEntry(repository, 2025, 'u1')).not.toHaveProperty('payers')
      expect(savedEntry(repository, 2026, 'u2')).not.toHaveProperty('payers')
      expect(savedEntry(repository, 2026, 'u3')?.payers).toEqual([
        { memberId: 'm1', amount: 20_000 },
        { memberId: 'm3', amount: 20_000 },
      ])
      expect(screen.getByRole('region', { name: '낸 분을 안 적은 회비 2건 · 110,000원' })).toBeInTheDocument()
    })

    it('AC-22 마지막 기록에서 [건너뛰기] 도 끝내고, 붙인 것이 없으면 알리지 않는다', async () => {
      renderApp(clubData({ dues: { startMonth: '2026-03' } }))
      await openAssign()
      expect(screen.getByText('1 / 1')).toBeInTheDocument()

      await userEvent.click(within(bar()).getByRole('button', { name: '건너뛰기' }))

      expect(await screen.findByRole('heading', { level: 1, name: '2026년 회비' })).toBeInTheDocument()
      expect(screen.getByRole('status')).not.toHaveTextContent('낸 분을 붙였어요')
      expect(screen.getByRole('region', { name: '낸 분을 안 적은 회비 1건 · 40,000원' })).toBeInTheDocument()
    })

    it('AC-22 중간에 [‹ 회비 표] 로 나가도 [다음] 으로 붙인 기록은 남는다', async () => {
      const repository = renderApp(clubData())
      await openAssign()
      await userEvent.click(screen.getByRole('checkbox', { name: '강민지' }))
      await userEvent.click(screen.getByRole('checkbox', { name: '박서연' }))
      await userEvent.click(nextButton())

      await userEvent.click(screen.getByRole('button', { name: '회비 표' }))

      expect(await screen.findByRole('heading', { level: 1, name: '2026년 회비' })).toBeInTheDocument()
      expect(savedEntry(repository, 2025, 'u1')?.payers).toEqual([
        { memberId: 'm2', amount: 30_000 },
        { memberId: 'm3', amount: 30_000 },
      ])
      expect(screen.getByRole('region', { name: '낸 분을 안 적은 회비 2건 · 90,000원' })).toBeInTheDocument()
    })

    it('똑같이 나눠지지 않으면 [다음] 이 "한 분씩 금액" 으로 간다 — 합계가 이 기록 금액일 때만 [이대로 할게요], 돌아와 [다음] 으로 저장', async () => {
      const repository = renderApp(clubData())
      await openAssign()
      await userEvent.click(within(bar()).getByRole('button', { name: '건너뛰기' }))
      await userEvent.click(screen.getByRole('button', { name: '모두 3명' }))
      expect(within(bar()).getByText('3명 · 똑같이 나눠지지 않아요')).toBeInTheDocument()

      await userEvent.click(nextButton())

      expect(screen.getByRole('heading', { level: 1, name: '한 분씩 금액' })).toBeInTheDocument()
      expect(screen.getByText('합계가 이 기록의 금액 50,000원이 되게 적어 주세요.')).toBeInTheDocument()
      expect(savedEntry(repository, 2026, 'u2')).not.toHaveProperty('payers')
      const done = screen.getByRole('button', { name: '이대로 할게요' })
      expect(screen.getByText('합계 60,000원 (3명)')).toBeInTheDocument()
      expect(done).toBeDisabled()
      expect(screen.getByText('합계가 50,000원이어야 해요')).toBeInTheDocument()
      const park = screen.getByLabelText('박서연')
      await userEvent.clear(park)
      await userEvent.type(park, '10000')
      expect(done).toBeEnabled()
      await userEvent.click(done)

      expect(await screen.findByRole('heading', { level: 1, name: '낸 분 붙이기' })).toBeInTheDocument()
      expect(screen.getByText('2 / 3')).toBeInTheDocument()
      expect(within(bar()).getByText('3명 · 한 분씩 정한 금액')).toBeInTheDocument()
      await userEvent.click(nextButton())

      expect(savedEntry(repository, 2026, 'u2')?.payers).toEqual([
        { memberId: 'm2', amount: 20_000 },
        { memberId: 'm1', amount: 20_000 },
        { memberId: 'm3', amount: 10_000 },
      ])
      expect(screen.getByText('3 / 3')).toBeInTheDocument()
    })

    it('한 분씩 정한 뒤 고른 분을 바꾸면 정한 몫은 버리고 다시 사람 수로 나눈다', async () => {
      renderApp(clubData())
      await openAssign()
      await userEvent.click(screen.getByRole('checkbox', { name: '김도윤' }))
      await userEvent.click(screen.getByRole('button', { name: '한 분만 금액이 달라요' }))
      await userEvent.click(screen.getByRole('button', { name: '이대로 할게요' }))
      expect(await screen.findByText('1명 · 한 분씩 정한 금액')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('checkbox', { name: '강민지' }))

      expect(within(bar()).getByText('2명 · 한 분 30,000원')).toBeInTheDocument()
    })

    it('[한 분만 금액이 달라요] 로도 "한 분씩 금액" 을 열고, 뒤로 버튼은 그 화면만 닫아 고른 분이 그대로다', async () => {
      renderApp(clubData())
      await openAssign()
      await userEvent.click(screen.getByRole('checkbox', { name: '김도윤' }))

      await userEvent.click(screen.getByRole('button', { name: '한 분만 금액이 달라요' }))
      expect(screen.getByRole('heading', { level: 1, name: '한 분씩 금액' })).toBeInTheDocument()
      pressBackButton()

      expect(await screen.findByRole('heading', { level: 1, name: '낸 분 붙이기' })).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: '김도윤' })).toBeChecked()
      pressBackButton()
      expect(await screen.findByRole('heading', { level: 1, name: '2026년 회비' })).toBeInTheDocument()
    })

    it('[+ 회원 넣기] 로 넣은 분은 그 기록의 달에 들어온 분으로 명단에 저장되고 체크된다', async () => {
      const repository = renderApp(clubData())
      await openAssign()

      await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
      const sheet = screen.getByRole('dialog', { name: '회원 넣기' })
      expect(within(sheet).getByText('2025년 9월에 들어온 분으로 넣고, 회원 명단에도 저장해요')).toBeInTheDocument()
      await userEvent.type(within(sheet).getByLabelText('이름'), '문가람')
      await userEvent.click(within(sheet).getByRole('button', { name: '넣기' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: '문가람' })).toBeChecked()
      expect(repository.load().data.books[0]?.members?.at(-1)).toEqual({ id: 'id-1', name: '문가람', joined: '2025-09', off: [] })
    })
  })

  describe('AC-22 회원 명단에서 들어가기', () => {
    async function openRoster() {
      await userEvent.click(screen.getByRole('button', { name: /^설정/ }))
      await userEvent.click(screen.getByRole('button', { name: /^회원 명단/ }))
    }

    it('AC-22 카드를 숨겨도 회원 명단 맨 아래 [낸 분 붙이기] 로 들어가고 [‹ 회원 명단] 으로 돌아온다', async () => {
      const repository = renderApp(clubData({ dues: { startMonth: '2025-07', hideUnassigned: true } }))
      await openRoster()

      expect(screen.getByText('낸 분을 안 적은 회비가 3건 있어요')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '낸 분 붙이기' }))
      expect(screen.getByRole('heading', { level: 1, name: '낸 분 붙이기' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '모두 3명' }))
      await userEvent.click(nextButton())
      expect(savedEntry(repository, 2025, 'u1')?.payers).toHaveLength(3)

      await userEvent.click(screen.getByRole('button', { name: '회원 명단' }))

      expect(await screen.findByRole('heading', { level: 1, name: '회원 명단' })).toBeInTheDocument()
      expect(screen.getByText('낸 분을 안 적은 회비가 2건 있어요')).toBeInTheDocument()
    })

    it('붙일 기록이 없으면 회원 명단에 [낸 분 붙이기] 가 없다', async () => {
      renderApp(clubData({ dues: { startMonth: '2026-06' } }))
      await openRoster()

      expect(screen.getByRole('heading', { level: 1, name: '회원 명단' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '낸 분 붙이기' })).not.toBeInTheDocument()
    })
  })
})
