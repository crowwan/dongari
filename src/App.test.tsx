import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
    it('장부가 하나도 없으면 동아리 이름과 이월금만 묻는 시작 화면을 보이고 아래 탭은 숨긴다', () => {
      renderApp()

      expect(screen.getByRole('heading', { name: '동아리 회계를 시작해 볼까요?' })).toBeInTheDocument()
      expect(screen.getByLabelText('동아리 이름')).toHaveValue('')
      expect(screen.getByLabelText('작년에서 넘어온 돈 (이월금)')).toHaveValue('')
      expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument()
    })

    it('동아리 이름이 비어 있으면 [시작하기] 를 누를 수 없다', () => {
      renderApp()

      expect(screen.getByRole('button', { name: '시작하기' })).toBeDisabled()
      expect(screen.getByText('동아리 이름을 적어주세요')).toBeInTheDocument()
    })

    it('이름·이월금을 적고 [시작하기] 를 누르면 올해 장부가 저장되고 빈 장부 화면이 열린다', async () => {
      const repository = renderApp()

      await userEvent.type(screen.getByLabelText('동아리 이름'), ' 한랑드림 ')
      await userEvent.type(screen.getByLabelText('작년에서 넘어온 돈 (이월금)'), '370482')
      await userEvent.click(screen.getByRole('button', { name: '시작하기' }))

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026년 한랑드림')
      expect(screen.getByTestId('ledger-balance')).toHaveTextContent('370,482원')
      expect(screen.getByText(/아직 적은 내용이 없어요/)).toBeInTheDocument()
      expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
      expect(repository.load().data.ledgers['2026']).toEqual({
        year: 2026,
        clubName: '한랑드림',
        carryover: 370_482,
        entries: [],
      })
    })

    it('작년이 적자였으면 "적자였어요"를 골라 음수 이월금으로 시작한다', async () => {
      const repository = renderApp()

      await userEvent.type(screen.getByLabelText('동아리 이름'), '한랑드림')
      await userEvent.type(screen.getByLabelText('작년에서 넘어온 돈 (이월금)'), '50000')
      await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))
      await userEvent.click(screen.getByRole('button', { name: '시작하기' }))

      expect(screen.getByTestId('ledger-balance')).toHaveTextContent('−50,000원')
      expect(repository.load().data.ledgers['2026']?.carryover).toBe(-50_000)
    })
  })

  describe('새 연도 장부', () => {
    it('AC-8 올해 장부가 없고 지난 장부만 있으면 이름과 전년도 잔액이 채워진 시작 화면을 연다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2025)))

      expect(screen.getByRole('heading', { name: '2026년 장부를 시작할까요?' })).toBeInTheDocument()
      expect(screen.getByLabelText('동아리 이름')).toHaveValue('한랑드림')
      // 100,000 + 140,000 − 40,000
      expect(screen.getByLabelText('작년에서 넘어온 돈 (이월금)')).toHaveValue('200,000')
      expect(screen.getByTestId('tab-bar')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: '시작하기' }))

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026년 한랑드림')
      expect(repository.load().data.ledgers['2026']?.carryover).toBe(200_000)
    })
  })

  describe('장부 화면', () => {
    it('기록이 있으면 잔액과 월별 목록을 보여준다', () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

      expect(screen.getByTestId('ledger-balance')).toHaveTextContent('300,000원')
      expect(screen.getAllByTestId('month-group').map((group) => group.dataset.month)).toEqual(['4', '3'])
    })

    it('[돈 들어옴] [돈 나감] 큰 버튼이 보인다', () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

      expect(screen.getByRole('button', { name: /돈 들어옴/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /돈 나감/ })).toBeInTheDocument()
    })
  })

  describe('설정', () => {
    it('동아리 이름·이월금을 고쳐 저장하면 장부 화면과 저장소에 반영된다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

      await userEvent.click(screen.getByTestId('tab-settings'))
      const name = screen.getByLabelText('동아리 이름')
      await userEvent.clear(name)
      await userEvent.type(name, '꽃동산')
      await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))
      await userEvent.click(screen.getByRole('button', { name: '바꾼 내용 저장' }))

      expect(screen.getByRole('status')).toHaveTextContent('바꿨어요')
      expect(repository.load().data.ledgers['2026']).toMatchObject({ clubName: '꽃동산', carryover: -200_000 })

      await userEvent.click(screen.getByTestId('tab-ledger'))

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026년 꽃동산')
      // −200,000 + 140,000 − 40,000
      expect(screen.getByTestId('ledger-balance')).toHaveTextContent('−100,000원')
    })

    it('바꾼 내용이 없거나 이름이 비면 [바꾼 내용 저장] 을 누를 수 없다', async () => {
      renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

      await userEvent.click(screen.getByTestId('tab-settings'))
      expect(screen.getByRole('button', { name: '바꾼 내용 저장' })).toBeDisabled()

      await userEvent.clear(screen.getByLabelText('동아리 이름'))

      expect(screen.getByRole('button', { name: '바꾼 내용 저장' })).toBeDisabled()
      expect(screen.getByText('동아리 이름을 적어주세요')).toBeInTheDocument()
    })

    it('연도는 장부가 있는 연도와 올해 중에서 고르고, 고르면 그 해 장부를 연다', async () => {
      renderApp(new MemoryRepository(storedWith({ ...LEDGER_2025, year: 2024, clubName: '옛이름' }, LEDGER_2026)))

      await userEvent.click(screen.getByTestId('tab-settings'))
      const years = screen.getByRole('group', { name: '장부 연도' })
      expect(within(years).getAllByRole('button').map((button) => button.textContent)).toEqual(['2026년', '2024년'])
      expect(within(years).getByRole('button', { name: '2026년' })).toHaveAttribute('aria-pressed', 'true')

      await userEvent.click(within(years).getByRole('button', { name: '2024년' }))
      expect(screen.getByLabelText('동아리 이름')).toHaveValue('옛이름')
      await userEvent.click(screen.getByTestId('tab-ledger'))

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2024년 옛이름')
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

    it('새 버전 앱의 기록이 있으면 새로고침하라고 알린다', () => {
      renderApp(new MemoryRepository(), { status: 'read-only', reason: 'newer-version', data: createEmptyData() })

      expect(screen.getByRole('alert')).toHaveTextContent('새 버전 앱에서 쓴 기록이 있어요. 앱을 새로고침해 주세요')
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

    it('저장에 실패하면 장부 화면 위에 백업 파일을 보내 두라고 알린다', async () => {
      const memory = new MemoryRepository(storedWith(LEDGER_2026))
      const full: LedgerRepository = { load: () => memory.load(), save: () => ({ ok: false, reason: 'quota-exceeded' }) }
      renderApp(full)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      await userEvent.click(screen.getByTestId('tab-settings'))
      await userEvent.type(screen.getByLabelText('동아리 이름'), '2')
      await userEvent.click(screen.getByRole('button', { name: '바꾼 내용 저장' }))
      await userEvent.click(screen.getByTestId('tab-ledger'))

      expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요. 백업 파일을 보내 두세요')
      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    })
  })

  it('아래 탭으로 장부·보고서·설정 화면을 오간다', async () => {
    renderApp(new MemoryRepository(storedWith(LEDGER_2026)))

    expect(screen.getByTestId('tab-ledger')).toHaveAttribute('aria-current', 'page')

    await userEvent.click(screen.getByTestId('tab-report'))
    expect(screen.getByRole('heading', { level: 1, name: '보고서' })).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('tab-settings'))
    expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    expect(screen.getByTestId('tab-settings')).toHaveAttribute('aria-current', 'page')
  })
})
