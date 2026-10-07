import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Ledger, StoredData } from './domain/types'
import type { LedgerRepository, LoadResult } from './storage/LedgerRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { createEmptyData } from './storage/schema'

const TODAY = new Date('2026-10-03T09:00:00.000+09:00')

function storedWith(...ledgers: Ledger[]): StoredData {
  return { ...createEmptyData(), ledgers: Object.fromEntries(ledgers.map((item) => [String(item.year), item])) }
}

const LEDGER_2025: Ledger = {
  year: 2025,
  clubName: '한랑드림',
  carryover: 100_000,
  entries: [
    { id: 'a', month: 3, type: 'income', name: '회비', amount: 140_000, createdAt: '2025-03-01T00:00:00.000Z' },
    { id: 'b', month: 4, type: 'expense', name: '대관료', amount: 40_000, createdAt: '2025-04-01T00:00:00.000Z' },
  ],
}

const LEDGER_2026: Ledger = { ...LEDGER_2025, year: 2026, carryover: 200_000 }

// 진입점(main.tsx)처럼 저장소를 한 번 읽어 넘긴다
function renderApp(repository: LedgerRepository = new MemoryRepository(), loaded: LoadResult = repository.load()) {
  let seq = 0
  render(<App repository={repository} loaded={loaded} options={{ now: () => TODAY, createId: () => `id-${++seq}` }} />)
  return repository
}

describe('SPEC-001 앱 뼈대', () => {
  describe('첫 실행', () => {
    it('장부가 하나도 없으면 동아리 이름과 작년 이월금만 묻는 시작 화면을 보이고 다른 화면으로 가는 버튼은 없다', () => {
      renderApp()

      expect(screen.getByRole('heading', { name: '동아리 회계를 시작해 볼까요?' })).toBeInTheDocument()
      expect(screen.getByLabelText('동아리 이름')).toHaveValue('')
      // 안내 "모르면 0으로 두고…" 와 맞게 이월금 칸은 0 으로 시작한다
      expect(screen.getByLabelText('작년 이월금')).toHaveValue('0')
      expect(screen.queryByRole('button', { name: '설정' })).not.toBeInTheDocument()
    })

    it('동아리 이름이 비어 있으면 [시작하기] 를 누를 수 없다', () => {
      renderApp()

      expect(screen.getByRole('button', { name: '시작하기' })).toBeDisabled()
      expect(screen.getByText('동아리 이름을 적어주세요')).toBeInTheDocument()
    })

    it('이름·이월금을 적고 [시작하기] 를 누르면 올해 장부가 저장되고 이번 달 장부 화면이 열린다', async () => {
      const repository = renderApp()

      await userEvent.type(screen.getByLabelText('동아리 이름'), ' 한랑드림 ')
      await userEvent.type(screen.getByLabelText('작년 이월금'), '370482')
      await userEvent.click(screen.getByRole('button', { name: '시작하기' }))

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('한랑드림')
      expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('370,482원')
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('10월')
      expect(screen.getByText('10월에 적은 내역이 없어요. 아래 [+ 내역 적기] 로 적어 보세요')).toBeInTheDocument()
      expect(repository.load().data.ledgers['2026']).toEqual({
        year: 2026,
        clubName: '한랑드림',
        carryover: 370_482,
        entries: [],
      })
    })

    it('이월금을 0 으로 두고 [시작하기] 를 누르면 이월금 0원 장부로 시작한다', async () => {
      const repository = renderApp()

      await userEvent.type(screen.getByLabelText('동아리 이름'), '한랑드림')
      await userEvent.clear(screen.getByLabelText('작년 이월금'))
      await userEvent.type(screen.getByLabelText('작년 이월금'), '0')
      expect(screen.getByLabelText('작년 이월금')).toHaveValue('0')
      await userEvent.click(screen.getByRole('button', { name: '시작하기' }))

      expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('0원')
      expect(repository.load().data.ledgers['2026']?.carryover).toBe(0)
    })

    it('작년이 적자였으면 "적자였어요"를 골라 음수 이월금으로 시작한다', async () => {
      const repository = renderApp()

      await userEvent.type(screen.getByLabelText('동아리 이름'), '한랑드림')
      await userEvent.type(screen.getByLabelText('작년 이월금'), '50000')
      await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))
      await userEvent.click(screen.getByRole('button', { name: '시작하기' }))

      expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('−50,000원')
      expect(repository.load().data.ledgers['2026']?.carryover).toBe(-50_000)
    })
  })

  describe('새 연도 장부', () => {
    it('AC-8 올해 장부가 없고 지난 장부만 있으면 이름과 전년도 잔액이 채워진 시작 화면을 연다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2025)))

      expect(screen.getByRole('heading', { name: '2026년 장부를 시작할까요?' })).toBeInTheDocument()
      expect(screen.getByLabelText('동아리 이름')).toHaveValue('한랑드림')
      // 100,000 + 140,000 − 40,000
      expect(screen.getByLabelText('작년 이월금')).toHaveValue('200,000')

      await userEvent.click(screen.getByRole('button', { name: '시작하기' }))

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('한랑드림')
      expect(screen.getByTestId('ledger-year')).toHaveTextContent('2026년')
      expect(repository.load().data.ledgers['2026']?.carryover).toBe(200_000)
    })

    it('새 연도 시작 화면에서도 위쪽 [설정] 으로 지난 장부를 골라 볼 수 있다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2025)))

      await userEvent.click(screen.getByRole('button', { name: '설정' }))
      await chooseYear(2025)

      expect(screen.getByTestId('ledger-year')).toHaveTextContent('2025년')
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('12월')
    })
  })

  describe('장부 화면', () => {
    it('AC-3 올해 장부의 첫 화면은 이번 달과 잔액을 보여준다', () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

      expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('300,000원')
      expect(screen.getByTestId('balance-card-note')).toHaveTextContent('작년 이월 200,000원 포함')
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('10월')
    })

    it('AC-9 달을 넘겨 그 달 기록을 본다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

      await stepBack(6)

      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('4월')
      expect(entryRows().map((row) => row.textContent)).toEqual(['대관료 지출 −40,000원'])
    })

    it('AC-9 가운데 "10월 ▾" 를 누르면 달 선택 창(이번 달 테두리)이 열리고, 고르면 창이 닫히고 그 달을 보여준다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

      await userEvent.click(screen.getByRole('button', { name: '10월 달 고르기' }))
      const sheet = screen.getByRole('dialog', { name: '몇 월을 볼까요?' })
      expect(within(sheet).getByRole('button', { name: '10월' })).toHaveAttribute('aria-current', 'date')
      await userEvent.click(within(sheet).getByRole('button', { name: '4월' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('4월')
      expect(entryRows().map((row) => row.textContent)).toEqual(['대관료 지출 −40,000원'])
    })

    it('지난 연도 장부의 달 선택 창에는 이번 달 테두리가 없다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2025, LEDGER_2026)))
      await userEvent.click(screen.getByRole('button', { name: '설정' }))
      await chooseYear(2025)
      await screen.findByTestId('ledger-screen')

      await userEvent.click(screen.getByRole('button', { name: '12월 달 고르기' }))

      expect(within(screen.getByRole('dialog')).queryByRole('button', { current: 'date' })).not.toBeInTheDocument()
    })

    it('달 선택 창은 방문 기록을 한 칸 쌓고, 안드로이드 뒤로 버튼은 창만 닫아 장부에 남는다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      const push = vi.spyOn(window.history, 'pushState')

      await userEvent.click(screen.getByRole('button', { name: '10월 달 고르기' }))
      expect(push).toHaveBeenCalledWith({ screen: 'ledger', sheet: 'ledger-month' }, '')
      push.mockRestore()

      pressBackButton()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('10월')
    })

    it('아래 고정 [+ 내역 적기] 하나만 있고 예전 [돈 들어옴] [돈 나감] 버튼은 없다', () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

      expect(within(screen.getByTestId('bottom-action-bar')).getByRole('button', { name: '내역 적기' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: /돈 들어옴|돈 나감/ })).not.toBeInTheDocument()
    })
  })

  describe('화면 이동 (탭 없음)', () => {
    it('[N월 정리 보기] 는 그 달의 월 정리 화면을 열고 [← 장부로] 로 같은 달 장부로 돌아온다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(7)

      await userEvent.click(screen.getByRole('button', { name: '3월 정리 보기' }))

      expect(screen.getByRole('heading', { level: 1, name: '2026년 3월 정리' })).toBeInTheDocument()
      expect(screen.queryByTestId('ledger-screen')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('3월')
    })

    it('위쪽 [결산] 은 올해 결산 화면을, [설정] 은 설정 화면을 연다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

      await userEvent.click(screen.getByRole('button', { name: '결산' }))
      expect(screen.getByRole('heading', { level: 1, name: '2026년 결산' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      await userEvent.click(screen.getByRole('button', { name: '설정' }))
      expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    })

    it('장부 외 화면을 열면 방문 기록을 하나 쌓고, 안드로이드 뒤로 버튼(popstate)으로 장부로 돌아온다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      const push = vi.spyOn(window.history, 'pushState')

      await userEvent.click(screen.getByRole('button', { name: '설정' }))

      expect(push).toHaveBeenCalledOnce()
      push.mockRestore()
      expect(window.history.state).toEqual({ screen: 'settings' })

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
      })

      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.queryByTestId('settings-screen')).not.toBeInTheDocument()
    })

    it('다른 화면을 열면 맨 위부터 보인다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      const scroll = vi.spyOn(window, 'scrollTo')

      await userEvent.click(screen.getByRole('button', { name: '설정' }))

      expect(scroll).toHaveBeenCalledWith(0, 0)
      scroll.mockRestore()
    })

    it('[← 장부로] 는 쌓은 방문 기록을 되돌린다 (그다음 뒤로 버튼은 앱 기본 동작)', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await userEvent.click(screen.getByRole('button', { name: '결산' }))
      const back = vi.spyOn(window.history, 'back')

      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(back).toHaveBeenCalledOnce()
      back.mockRestore()
    })

    it('화면 어디에도 "보고서" 라는 말이 없다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      expect(document.body).not.toHaveTextContent('보고서')

      await stepBack(7)
      for (const name of ['3월 정리 보기', '결산', '설정']) {
        await userEvent.click(screen.getByRole('button', { name }))
        expect(document.body).not.toHaveTextContent('보고서')
        await userEvent.click(screen.getByRole('button', { name: '장부로' }))
      }
    })
  })

  describe('설정', () => {
    it('동아리 이름·이월금을 각 편집 화면에서 고쳐 저장하면 "바꿨어요" 알림이 뜨고 설정 목록·장부 화면과 저장소에 반영된다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await userEvent.click(screen.getByRole('button', { name: '설정' }))

      await userEvent.click(screen.getByRole('button', { name: /^동아리 이름/ }))
      const name = screen.getByLabelText('동아리 이름')
      await userEvent.clear(name)
      await userEvent.type(name, '꽃동산')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(screen.getByRole('status')).toHaveTextContent('바꿨어요')
      expect(screen.getByRole('button', { name: /^동아리 이름/ })).toHaveTextContent('꽃동산')

      await userEvent.click(screen.getByRole('button', { name: /^작년 이월금/ }))
      await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(repository.load().data.ledgers['2026']).toMatchObject({ clubName: '꽃동산', carryover: -200_000 })
      expect(screen.getByRole('button', { name: /^작년 이월금/ })).toHaveTextContent('적자 200,000원')

      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('꽃동산')
      // −200,000 + 140,000 − 40,000
      expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('−100,000원')
      expect(screen.getByTestId('balance-card-note')).toHaveTextContent('작년 적자 200,000원 포함')
    })

    it('저장에 실패하면 "바꿨어요" 알림 없이 위쪽 안내만 보인다', async () => {
      renderApp(alwaysFailing(storedWith(LEDGER_2026)))

      await renameClub('2')

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요. 백업 파일을 보내 두세요')
    })

    it('편집 화면에서 안드로이드 뒤로 버튼을 누르면 설정 목록으로, 한 번 더 누르면 장부로 돌아온다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await userEvent.click(screen.getByRole('button', { name: '설정' }))
      await userEvent.click(screen.getByRole('button', { name: /^동아리 이름/ }))

      pressBackButton()
      expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()

      pressBackButton()
      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    })

    it('연도는 장부가 있는 연도와 올해 중에서 선택 창으로 고르고, 고르면 선택 창·설정 방문 기록을 한 번에 되돌려 장부 화면에서 그 해 12월을 보여준다', async () => {
      renderApp(new MemoryRepository(storedWith({ ...LEDGER_2025, year: 2024, clubName: '옛이름' }, LEDGER_2026)))

      await userEvent.click(screen.getByRole('button', { name: '설정' }))
      await userEvent.click(screen.getByRole('button', { name: /^장부 연도/ }))
      const years = within(screen.getByRole('dialog', { name: '어느 해 장부를 볼까요?' })).getByRole('group', {
        name: '장부 연도',
      })
      expect(within(years).getAllByRole('button').map((button) => button.textContent)).toEqual(['2026년', '2024년'])
      expect(within(years).getByRole('button', { name: '2026년' })).toHaveAttribute('aria-pressed', 'true')
      const go = vi.spyOn(window.history, 'go')

      await userEvent.click(within(years).getByRole('button', { name: '2024년' }))

      expect(go).toHaveBeenCalledWith(-2)
      go.mockRestore()
      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('옛이름')
      expect(screen.getByTestId('ledger-year')).toHaveTextContent('2024년')
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('12월')
    })

    it('지난 연도에서 올해로 돌아오면 전에 보던 달이 아니라 다시 이번 달을 보여준다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2025, LEDGER_2026)))
      await stepBack(7)

      await userEvent.click(screen.getByRole('button', { name: '설정' }))
      await chooseYear(2025)
      await screen.findByTestId('ledger-screen')
      await userEvent.click(screen.getByRole('button', { name: '설정' }))
      await chooseYear(2026)
      await screen.findByTestId('ledger-screen')

      expect(screen.getByTestId('ledger-year')).toHaveTextContent('2026년')
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('10월')
    })
  })

  describe('내역 적기', () => {
    it('AC-1 [+ 내역 적기] → 날 → 항목 고르기 → 금액 → [저장] → [다 적었어요] 하면 장부가 그 달을 보여 주고 기록이 날짜순으로 추가돼 있다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

      await openEntryForm()
      expect(screen.queryByTestId('ledger-screen')).not.toBeInTheDocument()
      await pickEntryMonth('10월', '4월')
      await pickDay(3)
      await userEvent.click(within(itemList()).getByRole('button', { name: '간식비 지출' }))
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '58280')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))
      await userEvent.click(screen.getByRole('button', { name: '다 적었어요' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('4월')
      // AC-9 날짜순: 날짜 없는 예전 기록(대관료)은 맨 뒤, 줄에 "3일"
      expect(entryRows().map((row) => row.textContent)).toEqual([
        '간식비 3일 · 지출 −58,280원',
        '대관료 지출 −40,000원',
      ])
      // 300,000 − 58,280
      expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('241,720원')
      expect(screen.getByRole('status')).toHaveTextContent('1건을 저장했어요')
      expect(repository.load().data.ledgers['2026']?.entries.at(-1)).toEqual({
        id: 'id-1',
        month: 4,
        day: 3,
        type: 'expense',
        name: '간식비',
        amount: 58_280,
        createdAt: TODAY.toISOString(),
      })
    })

    it('"N건을 저장했어요" 알림은 2초 뒤 사라진다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()
      await fillExpense('간식비', '5000')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))
      vi.useFakeTimers({ shouldAdvanceTime: true })

      try {
        await userEvent.click(screen.getByRole('button', { name: '다 적었어요' }))
        expect(await screen.findByText('1건을 저장했어요')).toBeInTheDocument()

        act(() => {
          vi.advanceTimersByTime(2000)
        })

        expect(screen.getByRole('status')).toBeEmptyDOMElement()
      } finally {
        vi.useRealTimers()
      }
    })

    it('AC-3 내역 적기의 달 줄 기본값은 장부에서 보고 있던 달이다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(7)

      await openEntryForm()

      expect(screen.getAllByTestId('entry-card-value').map((value) => value.textContent)).toEqual(['3월'])
    })

    it('AC-4 한 번 이상 쓴 항목이 목록에 보이고, 누르면 이름과 그 항목의 수입/지출이 "지금 적는 내역" 카드 항목 줄로 접히고 금액 질문으로 넘어간다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()
      await pickDay(3)

      expect(
        within(itemList())
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['대관료 지출', '회비 수입', '간식비 지출', '직접 적기'])

      await userEvent.click(within(itemList()).getByRole('button', { name: '회비 수입' }))

      expect(screen.getAllByTestId('entry-card-value').map((value) => value.textContent)).toEqual(['10월 3일', '회비 · 수입'])
      expect(screen.getByRole('heading', { level: 2, name: '얼마인가요?' })).toBeInTheDocument()
    })

    it('AC-15 지난 연도에 쓴 이름도 예전에 쓴 이름이라 직접 적어도 수입/지출을 묻지 않는다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2025, { ...LEDGER_2026, entries: [] })))
      await openEntryForm()
      await pickDay(3)

      await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))
      await userEvent.type(screen.getByLabelText('직접 적기'), '대관료')
      await userEvent.click(screen.getByRole('button', { name: '다음' }))

      expect(screen.getByRole('heading', { level: 2, name: '얼마인가요?' })).toBeInTheDocument()
      expect(screen.getAllByTestId('entry-card-value').map((value) => value.textContent)).toEqual(['10월 3일', '대관료 · 지출'])
    })

    it('저장에 실패하면 장부로 돌아가 알림 없이 위쪽 실패 안내만 보인다', async () => {
      renderApp(alwaysFailing(storedWith(LEDGER_2026)))
      await openEntryForm()
      await fillExpense('간식비', '5000')

      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요. 백업 파일을 보내 두세요')
    })

    it('AC-12 입력창을 열면 방문 기록을 하나 쌓고, 안드로이드 뒤로 버튼(popstate)으로 입력창만 닫힌다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(7)
      await openEntryForm()
      expect(window.history.state).toEqual({ screen: 'add-entry' })

      pressBackButton()

      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('3월')
      expect(repository.load().data.ledgers['2026']?.entries).toHaveLength(2)
    })

    it('[← 장부로] 로 저장하지 않고 닫는다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()

      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })
  })

  describe('연달아 적기 (v2.1)', () => {
    it('AC-19 AC-24 [저장] 하면 장부에 저장되고, 장부로 돌아가지 않고 "며칠인가요?" 로 돌아가며 달은 방금 저장한 달이 이어진다 (방금 저장한 날에 "방금")', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()
      await pickEntryMonth('10월', '4월')

      await saveItem('간식비 지출', '5000', 12)

      expect(repository.load().data.ledgers['2026']?.entries.at(-1)).toMatchObject({ month: 4, day: 12, name: '간식비', amount: 5_000 })
      expect(screen.queryByTestId('ledger-screen')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: '며칠인가요?' })).toHaveFocus()
      // 날·항목·금액은 비우고 달만 이어 쓴다. 날은 미리 고르지 않고 방금 저장한 날에 "방금" 만 붙인다
      expect(screen.getAllByTestId('entry-card-value').map((value) => value.textContent)).toEqual(['4월'])
      expect(within(screen.getByTestId('day-picker')).getByRole('button', { name: '12일 방금' })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('AC-20 저장할 때마다 "장부에 넣었어요 · N건" 목록에 줄이 쌓이고 방금 저장한 줄에 "방금" 이 붙는다. 최근 2줄만 보인다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()

      await saveItem('대관료 지출', '40000')
      await saveItem('회비 수입', '140000')

      expect(savedRows()).toEqual(['대관료 −40,000원', '회비 방금 +140,000원'])

      await saveItem('간식비 지출', '1000')

      expect(screen.getByRole('region', { name: '장부에 넣었어요 · 3건' })).toBeInTheDocument()
      expect(savedRows()).toEqual(['회비 +140,000원', '간식비 방금 −1,000원'])
    })

    it('AC-21 [다 적었어요] 를 누르면 장부로 돌아가 마지막에 저장한 달을 보여 주고 "N건을 저장했어요" 알림이 뜬다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()
      await saveItem('대관료 지출', '40000')
      await pickEntryMonth('10월', '5월')
      await saveItem('간식비 지출', '5000')

      await userEvent.click(screen.getByRole('button', { name: '다 적었어요' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('5월')
      expect(screen.getByRole('status')).toHaveTextContent('2건을 저장했어요')
      expect(repository.load().data.ledgers['2026']?.entries).toHaveLength(4)
    })

    it('AC-21 뒤로 버튼이나 [← 장부로] 도 [다 적었어요] 와 같이 장부로 돌아가 알린다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()
      await pickEntryMonth('10월', '6월')
      await saveItem('대관료 지출', '40000')

      pressBackButton()

      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('6월')
      expect(screen.getByRole('status')).toHaveTextContent('1건을 저장했어요')

      await openEntryForm()
      await saveItem('대관료 지출', '40000')
      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('1건을 저장했어요')
    })

    it('AC-21 다음 내역을 적던 중이면 버릴지 묻고, [버리기] 면 적던 한 건만 버리고 저장한 내역은 남는다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()
      await saveItem('대관료 지출', '40000')
      await pickDay(4)
      await userEvent.click(within(itemList()).getByRole('button', { name: '간식비 지출' }))
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '5000')

      pressBackButton()
      await userEvent.click(within(screen.getByRole('alertdialog', { name: '적던 내용을 버릴까요?' })).getByRole('button', { name: '버리기' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('1건을 저장했어요')
      expect(repository.load().data.ledgers['2026']?.entries.map((entry) => entry.name)).toEqual(['회비', '대관료', '대관료'])
    })

    it('이어서 적는 중 달만 바꿔도 [다 적었어요] 에서 버릴지 묻는다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()
      await saveItem('대관료 지출', '40000')

      await pickEntryMonth('10월', '3월')
      await userEvent.click(screen.getByRole('button', { name: '다 적었어요' }))

      expect(screen.getByRole('alertdialog', { name: '적던 내용을 버릴까요?' })).toBeInTheDocument()
    })

    it('"장부에 넣었어요" 목록은 이번에 들어와 저장한 것만 보인다 (다시 들어오면 빈 상태로 시작)', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()
      await saveItem('대관료 지출', '40000')
      await userEvent.click(screen.getByRole('button', { name: '다 적었어요' }))
      await screen.findByTestId('ledger-screen')

      await openEntryForm()

      expect(screen.queryByTestId('saved-entries')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '다 적었어요' })).not.toBeInTheDocument()
    })

    it('연달아 적는 중 저장에 실패하면 장부로 돌아가 저장 실패 안내를 보인다', async () => {
      const repository = new MemoryRepository(storedWith(LEDGER_2026))
      let failing = false
      renderApp({
        load: () => repository.load(),
        save: (data) => (failing ? { ok: false, reason: 'quota-exceeded' } : repository.save(data)),
        restore: (data) => repository.restore(data),
      })
      await openEntryForm()
      await saveItem('대관료 지출', '40000')
      await pickEntryMonth('10월', '8월')
      failing = true

      await saveItem('간식비 지출', '5000')

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('8월')
      expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요. 백업 파일을 보내 두세요')
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      // 그 전에 저장한 내역은 그대로다
      expect(repository.load().data.ledgers['2026']?.entries.map((entry) => entry.name)).toEqual(['회비', '대관료', '대관료'])
    })
  })

  describe('내역 고치기·지우기', () => {
    it('AC-6 기록 줄을 누르면 그 기록 값이 채워진 "내역 고치기" 화면이 열린다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(6)

      await userEvent.click(screen.getByRole('button', { name: /^대관료/ }))

      expect(screen.getByRole('heading', { level: 1, name: '내역 고치기' })).toBeInTheDocument()
      // 날짜 없는 예전 기록
      expect(screen.getByRole('button', { name: '4월 · 날짜 없음 바꾸기' })).toBeInTheDocument()
      expect(within(typeGroup()).getByRole('button', { name: '지출' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(itemList()).getByRole('button', { name: '대관료 지출' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText('직접 적기')).toHaveValue('대관료')
      expect(screen.getByLabelText('얼마인가요?')).toHaveValue('40,000')
      expect(window.history.state).toEqual({ screen: 'edit-entry' })
    })

    it('AC-6 고쳐서 저장하면 확인 없이 장부로 돌아가 목록과 합계에 반영되고 "고쳤어요" 알림이 뜬다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(6)
      await openEditForm('대관료')

      const amount = screen.getByLabelText('얼마인가요?')
      await userEvent.clear(amount)
      await userEvent.type(amount, '45000')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('4월')
      expect(entryRows().map((row) => row.textContent)).toEqual(['대관료 지출 −45,000원'])
      // 200,000 + 140,000 − 45,000
      expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('295,000원')
      expect(screen.getByRole('status')).toHaveTextContent('고쳤어요')
      expect(repository.load().data.ledgers['2026']?.entries[1]).toEqual({ ...LEDGER_2026.entries[1], amount: 45_000 })
    })

    it('AC-6 AC-25 날짜를 다른 달로 바꿔 저장하면 장부가 바뀐 달을 날짜순으로 보여 준다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(6)
      await openEditForm('대관료')

      await pickEditDate('4월 · 날짜 없음', '이전 달', 9)
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('3월')
      expect(entryRows().map((row) => row.textContent)).toEqual(['대관료 9일 · 지출 −40,000원', '회비 수입 +140,000원'])
      expect(repository.load().data.ledgers['2026']?.entries[1]).toMatchObject({ month: 3, day: 9 })
    })

    it('AC-25 날짜 없는 예전 내역은 날짜 없이 그대로 고쳐 저장된다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(6)
      await openEditForm('대관료')

      await userEvent.click(screen.getByRole('button', { name: '1만 원 더하기' }))
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(repository.load().data.ledgers['2026']?.entries[1]).toEqual({ ...LEDGER_2026.entries[1], amount: 50_000 })
    })

    it('고친 내용을 저장하지 못하면 "고쳤어요" 알림 없이 위쪽 실패 안내만 보인다', async () => {
      renderApp(alwaysFailing(storedWith(LEDGER_2026)))
      await stepBack(6)
      await openEditForm('대관료')

      await pickEditDate('4월 · 날짜 없음', '이전 달', 9)
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요. 백업 파일을 보내 두세요')
    })

    it('AC-7 [이 내역 지우기] → 확인 창에서 [아니요] 면 지우지 않고 고치기 화면에 남는다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(6)
      await openEditForm('대관료')

      await userEvent.click(screen.getByRole('button', { name: '이 내역 지우기' }))
      await userEvent.click(within(screen.getByRole('alertdialog', { name: '이 내역을 정말 지울까요?' })).getByRole('button', { name: '아니요' }))

      expect(screen.getByRole('heading', { level: 1, name: '내역 고치기' })).toBeInTheDocument()
      expect(repository.load().data.ledgers['2026']?.entries).toHaveLength(2)
    })

    it('AC-7 확인 창에서 [지우기] 를 누르면 지우고 장부로 돌아가 "지웠어요" 알림이 뜬다 (방문 기록은 한 번만 되돌린다)', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(6)
      await openEditForm('대관료')
      const back = vi.spyOn(window.history, 'back')

      await userEvent.click(screen.getByRole('button', { name: '이 내역 지우기' }))
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(back).toHaveBeenCalledOnce()
      back.mockRestore()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('4월')
      expect(within(screen.getByTestId('month-card')).queryByTestId('list-row')).not.toBeInTheDocument()
      // 200,000 + 140,000
      expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('340,000원')
      expect(screen.getByRole('status')).toHaveTextContent('지웠어요')
      expect(repository.load().data.ledgers['2026']?.entries.map((item) => item.id)).toEqual(['a'])
    })

    it('지운 내용을 저장하지 못하면 "지웠어요" 알림 없이 위쪽 실패 안내만 보인다', async () => {
      renderApp(alwaysFailing(storedWith(LEDGER_2026)))
      await stepBack(6)
      await openEditForm('대관료')

      await userEvent.click(screen.getByRole('button', { name: '이 내역 지우기' }))
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요. 백업 파일을 보내 두세요')
    })
  })

  describe('적던 내용을 버릴까요?', () => {
    it('바꾼 것이 없으면 고치기 화면의 [← 장부로] 는 묻지 않고 바로 닫는다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(6)
      await openEditForm('대관료')

      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('적던 내용이 있으면 [← 장부로] 에서 묻고, [아니요] 면 적던 내용 그대로 남고 [버리기] 면 저장 없이 장부로 간다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()
      await fillExpense('간식비', '5000')

      await userEvent.click(screen.getByRole('button', { name: '장부로' }))
      const dialog = screen.getByRole('alertdialog', { name: '적던 내용을 버릴까요?' })
      await userEvent.click(within(dialog).getByRole('button', { name: '아니요' }))

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByLabelText('얼마인가요?')).toHaveValue('5,000')

      await userEvent.click(screen.getByRole('button', { name: '장부로' }))
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '버리기' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(repository.load().data.ledgers['2026']?.entries).toHaveLength(2)
    })

    it('내역 적기에서 처음 상태(달만 있음)면 뒤로 버튼에 묻지 않고 바로 닫는다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()

      pressBackButton()

      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('내역 적기에서 날 하나만 골라도 [← 장부로] 에서 묻는다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()

      await pickDay(3)
      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(screen.getByRole('alertdialog', { name: '적던 내용을 버릴까요?' })).toBeInTheDocument()
    })

    it('AC-12 달 선택 창이 열려 있으면 뒤로 버튼은 창만 닫고, 한 번 더 누르면 그때 버릴까요를 묻는다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openEntryForm()
      await pickDay(3)
      await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))
      await userEvent.click(screen.getByRole('button', { name: '날짜 바꾸기' }))
      await userEvent.click(screen.getByRole('button', { name: '10월 달 바꾸기' }))
      expect(window.history.state).toEqual({ screen: 'add-entry', sheet: 'entry-month' })

      pressBackButton()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: '내역 적기' })).toBeInTheDocument()

      pressBackButton()

      expect(screen.getByRole('alertdialog', { name: '적던 내용을 버릴까요?' })).toBeInTheDocument()
    })

    it('고치기 화면에서 바꾼 것이 있어도 묻는다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(6)
      await openEditForm('대관료')

      await pickEditDate('4월 · 날짜 없음', '다음 달', 1)
      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(screen.getByRole('alertdialog', { name: '적던 내용을 버릴까요?' })).toBeInTheDocument()
    })

    it('AC-12 적던 내용이 있을 때 뒤로 버튼을 누르면 입력창을 닫지 않고 묻는다. [아니요] 뒤에 다시 누르면 또 묻고, [버리기] 면 장부로', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await stepBack(7)
      await openEntryForm()
      await fillExpense('간식비', '5000')

      pressBackButton()

      expect(screen.getByRole('heading', { level: 1, name: '내역 적기' })).toBeInTheDocument()
      await userEvent.click(within(screen.getByRole('alertdialog', { name: '적던 내용을 버릴까요?' })).getByRole('button', { name: '아니요' }))
      expect(screen.getByLabelText('얼마인가요?')).toHaveValue('5,000')

      pressBackButton()

      await userEvent.click(within(screen.getByRole('alertdialog', { name: '적던 내용을 버릴까요?' })).getByRole('button', { name: '버리기' }))
      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('3월')
      expect(repository.load().data.ledgers['2026']?.entries).toHaveLength(2)
    })
  })

  describe('SPEC-002 시작 안내·저장 실패', () => {
    it('깨진 기록을 옮기고 새로 시작했으면 시작 화면 위에 알린다', () => {
      const repository = new MemoryRepository()
      renderApp(repository, { status: 'recovered', data: createEmptyData() })

      expect(screen.getByRole('alert')).toHaveTextContent(
        '저장된 기록을 읽지 못해 새 장부로 시작해요. 예전 기록은 따로 보관해 두었어요',
      )
    })

    it('새 버전 앱의 기록이 있으면 앱을 닫았다가 다시 열라고 알린다', () => {
      renderApp(new MemoryRepository(), { status: 'read-only', reason: 'newer-version', data: createEmptyData() })

      expect(screen.getByRole('alert')).toHaveTextContent('새 버전 앱에서 쓴 기록이 있어요. 앱을 닫았다가 다시 열어 주세요')
    })

    it('원본을 옮기지 못해 저장을 막았으면 지금 적는 내용이 저장되지 않는다고 알린다', () => {
      renderApp(new MemoryRepository(), {
        status: 'read-only',
        reason: 'unreadable-original',
        data: createEmptyData(),
      })

      expect(screen.getByRole('alert')).toHaveTextContent(
        '저장된 기록을 읽지 못했어요. 지금 적는 내용은 저장되지 않아요',
      )
    })

    it('저장에 실패하면 장부 화면 위에도 백업 파일을 보내 두라고 알린다', async () => {
      renderApp(alwaysFailing(storedWith(LEDGER_2026)))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      await renameClub('2')
      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요. 백업 파일을 보내 두세요')
      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    })
  })
})

// 읽기는 되지만 저장은 늘 실패하는 저장소 (용량 초과)
function alwaysFailing(data: StoredData): LedgerRepository {
  const memory = new MemoryRepository(data)
  return {
    load: () => memory.load(),
    save: () => ({ ok: false, reason: 'quota-exceeded' }),
    restore: () => ({ ok: false, reason: 'quota-exceeded' }),
  }
}

// 안드로이드 뒤로 버튼: 브라우저가 방문 기록을 하나 빼고 popstate 를 보낸다
function pressBackButton() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
}

// 장부 기록 줄(이름으로 시작해 금액이 붙은 버튼)을 눌러 고치기 화면을 연다
async function openEditForm(name: string) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
  expect(screen.getByRole('heading', { level: 1, name: '내역 고치기' })).toBeInTheDocument()
}

async function openEntryForm() {
  await userEvent.click(screen.getByRole('button', { name: '내역 적기' }))
  expect(screen.getByRole('heading', { level: 1, name: '내역 적기' })).toBeInTheDocument()
}

const typeGroup = () => screen.getByRole('group', { name: '수입인가요, 지출인가요?' })
const itemList = () => screen.getByRole('group', { name: '자주 쓴 항목' })

// "며칠인가요?" 날 격자에서 날을 누른다 ("방금" 이 붙은 칸도)
async function pickDay(day: number) {
  await userEvent.click(within(screen.getByTestId('day-picker')).getByRole('button', { name: new RegExp(`^${day}일`) }))
}

// 보고 있던 달 그대로, 처음 쓰는 이름의 지출 하나를 하나씩 채운다 (날 → 직접 적기 → 지출 → 금액)
async function fillExpense(name: string, amount: string) {
  await pickDay(3)
  await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))
  await userEvent.type(screen.getByLabelText('직접 적기'), name)
  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await userEvent.click(within(typeGroup()).getByRole('button', { name: '지출' }))
  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await userEvent.type(screen.getByLabelText('얼마인가요?'), amount)
}

// 내역 적기: 날을 누르고 목록에서 항목을 골라 금액을 적고 [저장] 한다 (연달아 적기라 내역 적기 화면에 남는다)
async function saveItem(item: string, amount: string, day = 3) {
  await pickDay(day)
  await userEvent.click(within(itemList()).getByRole('button', { name: item }))
  await userEvent.type(screen.getByLabelText('얼마인가요?'), amount)
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
}

// "장부에 넣었어요" 목록에 보이는 줄
function savedRows() {
  return screen.getAllByTestId('saved-entries-row').map((row) => row.textContent)
}

// 내역 적기 "며칠인가요?": 카드 날짜 줄(지금 달 확인) → 제목 옆 [10월 ▾] → 달 선택 창에서 고른다
async function pickEntryMonth(current: string, next: string) {
  expect(screen.getAllByTestId('entry-card-value')[0]).toHaveTextContent(current)
  await userEvent.click(screen.getByRole('button', { name: `${current} 달 바꾸기` }))
  await userEvent.click(within(screen.getByRole('dialog', { name: '몇 월인가요?' })).getByRole('button', { name: next }))
}

// 내역 고치기: 날짜 줄 [바꾸기] → 날짜 선택 창에서 [‹]/[›] 한 번 넘기고 날을 고른다
async function pickEditDate(current: string, step: '이전 달' | '다음 달', day: number) {
  await userEvent.click(screen.getByRole('button', { name: `${current} 바꾸기` }))
  const sheet = screen.getByRole('dialog', { name: '며칠인가요?' })
  await userEvent.click(within(sheet).getByRole('button', { name: step }))
  await userEvent.click(within(sheet).getByRole('button', { name: `${day}일` }))
}

// 장부 → 설정 → 동아리 이름 편집 화면에서 이름 뒤에 글자를 붙여 저장한다 (설정 목록으로 돌아온다)
async function renameClub(suffix: string) {
  await userEvent.click(screen.getByRole('button', { name: '설정' }))
  await userEvent.click(screen.getByRole('button', { name: /^동아리 이름/ }))
  await userEvent.type(screen.getByLabelText('동아리 이름'), suffix)
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
}

// 보고 있는 달 카드의 기록 줄
function entryRows() {
  return within(screen.getByTestId('month-card')).getAllByTestId('list-row')
}

// 설정 > 장부 연도 줄 → 선택 창에서 연도를 고른다
async function chooseYear(year: number) {
  await userEvent.click(screen.getByRole('button', { name: /^장부 연도/ }))
  await userEvent.click(within(screen.getByRole('group', { name: '장부 연도' })).getByRole('button', { name: `${year}년` }))
}

// [‹] 을 여러 번 눌러 앞 달로 간다
async function stepBack(times: number) {
  for (let step = 0; step < times; step += 1) {
    await userEvent.click(screen.getByRole('button', { name: '이전 달' }))
  }
}
