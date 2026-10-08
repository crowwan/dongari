import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Ledger, Settings, StoredData } from './domain/types'
import type { LedgerRepository } from './storage/LedgerRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { storedWith as storedWithLedgers } from './test/ledgerFixtures'

// 오늘: 2026-10-06. 마지막 백업 2026-09-01 → 35일 지남
const TODAY = new Date('2026-10-06T09:00:00.000+09:00')
const REMINDER = '한 달 넘게 백업하지 않았어요'

const LEDGER: Ledger = {
  year: 2026,
  carryover: 0,
  entries: [{ id: 'a', month: 8, type: 'income', name: '회비', amount: 50_000, createdAt: '2026-08-01T00:00:00.000Z' }],
}

function storedWith(settings: Settings): StoredData {
  return { ...storedWithLedgers(LEDGER), settings }
}

// 백업 뒤 기록이 바뀌었고 35일 지났다
const OVERDUE: Settings = { lastBackupAt: '2026-09-01T00:00:00.000Z', lastChangedAt: '2026-09-15T00:00:00.000Z' }

function renderApp(repository: LedgerRepository) {
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY, createId: () => 'id' }} />)
  return repository
}

function stubShare(share: () => Promise<void> = () => Promise.resolve()) {
  const shareMock = vi.fn(share)
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
  Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true })
  return shareMock
}

describe('SPEC-002 30일 백업 안내', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'canShare')
    Reflect.deleteProperty(navigator, 'share')
    vi.restoreAllMocks()
  })

  it('AC-5 마지막 백업 30일 경과 + 변경 있음이면 장부 위 안내 띠와 [설정] 점 표시가 보인다', () => {
    renderApp(new MemoryRepository(storedWith(OVERDUE)))

    expect(screen.getByText(REMINDER)).toBeInTheDocument()
    const settings = screen.getByRole('button', { name: '설정 백업 필요' })
    expect(settings).toHaveAttribute('data-dot', 'true')
  })

  it('AC-5 백업한 뒤 바뀐 기록이 없으면 30일이 지나도 안내도 점도 없다', () => {
    renderApp(new MemoryRepository(storedWith({ lastBackupAt: '2026-09-01T00:00:00.000Z', lastChangedAt: '2026-08-20T00:00:00.000Z' })))

    expect(screen.queryByText(REMINDER)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('data-dot', 'false')
  })

  it('AC-5 마지막 백업이 30일 안이면 기록이 바뀌었어도 안내하지 않는다', () => {
    renderApp(new MemoryRepository(storedWith({ lastBackupAt: '2026-09-10T00:00:00.000Z', lastChangedAt: '2026-10-01T00:00:00.000Z' })))

    expect(screen.queryByText(REMINDER)).not.toBeInTheDocument()
  })

  it('AC-5 백업한 적이 없으면 처음 기록한 날(8월 1일)부터 30일이 지나 안내한다', () => {
    renderApp(new MemoryRepository(storedWith({ lastChangedAt: '2026-08-01T00:00:00.000Z' })))

    expect(screen.getByText(REMINDER)).toBeInTheDocument()
  })

  it('띠의 [백업 파일 보내기] 는 설정의 보내기와 같이 공유 화면을 열고, 보내면 안내 띠와 점이 사라진다', async () => {
    const shareMock = stubShare()
    const repository = renderApp(new MemoryRepository(storedWith(OVERDUE)))

    await userEvent.click(within(screen.getByTestId('notice-bar')).getByRole('button', { name: '백업 파일 보내기' }))

    expect(shareMock).toHaveBeenCalledOnce()
    expect(await screen.findByText('백업 파일을 보냈어요')).toBeInTheDocument()
    expect(screen.queryByText(REMINDER)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('data-dot', 'false')
    expect(repository.load().data.settings.lastBackupAt).toBe(TODAY.toISOString())
  })

  it('공유 화면을 그냥 닫으면 안내 띠가 그대로 남는다', async () => {
    const shareMock = stubShare(() => Promise.reject(new DOMException('취소', 'AbortError')))
    renderApp(new MemoryRepository(storedWith(OVERDUE)))

    await userEvent.click(screen.getByRole('button', { name: '백업 파일 보내기' }))

    await vi.waitFor(() => expect(shareMock).toHaveBeenCalledOnce())
    expect(screen.getByText(REMINDER)).toBeInTheDocument()
  })

  it('점 표시를 보고 설정에 오면 설정 화면에도 같은 띠가 보이고, 월 정리·올해 결산에는 없다', async () => {
    renderApp(new MemoryRepository(storedWith(OVERDUE)))

    await userEvent.click(screen.getByRole('button', { name: '설정 백업 필요' }))
    expect(screen.getByTestId('settings-screen')).toBeInTheDocument()
    expect(within(screen.getByTestId('notice-bar')).getByText(REMINDER)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '장부로' }))

    await userEvent.click(await screen.findByRole('button', { name: '결산' }))
    expect(screen.queryByText(REMINDER)).not.toBeInTheDocument()
  })

  describe('안내 띠는 하나만: 저장 안내 > 백업 안내 (설치 안내 띠는 없다)', () => {
    it('백업 안내가 없으면 장부 위에 띠가 없다 (설치 안내는 설정의 줄로 옮겼다)', () => {
      renderApp(new MemoryRepository(storedWith({ lastBackupAt: '2026-10-01T00:00:00.000Z', lastChangedAt: '2026-09-01T00:00:00.000Z' })))

      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.queryByTestId('notice-bar')).not.toBeInTheDocument()
      expect(screen.queryByTestId('install-banner')).not.toBeInTheDocument()
      expect(screen.queryByText('홈 화면에 추가하면 기록이 더 안전해요')).not.toBeInTheDocument()
    })

    it('백업을 보내 백업 안내 띠가 사라져도 장부 위에 설치 안내 띠가 나타나지 않는다', async () => {
      stubShare()
      renderApp(new MemoryRepository(storedWith(OVERDUE)))

      expect(screen.getByText(REMINDER)).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: '백업 파일 보내기' }))

      await vi.waitFor(() => expect(screen.queryByText(REMINDER)).not.toBeInTheDocument())
      expect(screen.queryByTestId('notice-bar')).not.toBeInTheDocument()
      expect(screen.queryByTestId('install-banner')).not.toBeInTheDocument()
    })

    it('저장 실패 안내가 있으면 백업 안내 띠는 숨긴다 (같은 [백업 파일 보내기] 를 두 번 보이지 않게). 점 표시는 남는다', async () => {
      const memory = new MemoryRepository(storedWith(OVERDUE))
      renderApp({ load: () => memory.load(), save: () => ({ ok: false, reason: 'quota-exceeded' }), restore: (data) => memory.restore(data) })

      // 기록 하나를 고쳐 저장 실패를 만든다
      await userEvent.click(screen.getByRole('button', { name: '설정 백업 필요' }))
      await userEvent.click(screen.getByRole('button', { name: /^동아리 이름/ }))
      await userEvent.clear(screen.getByLabelText('동아리 이름'))
      await userEvent.type(screen.getByLabelText('동아리 이름'), '새이름')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))
      await userEvent.click(screen.getByRole('button', { name: '장부로' }))

      expect(screen.getByText('저장하지 못했어요. 백업 파일을 보내 두세요')).toBeInTheDocument()
      expect(screen.queryByText(REMINDER)).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: '백업 파일 보내기' })).toHaveLength(1)
      expect(screen.getByRole('button', { name: '설정 백업 필요' })).toBeInTheDocument()
    })
  })

  describe('설정 > 기록 백업 [백업 파일 보내기] 줄의 마지막 백업 날짜', () => {
    it('마지막 백업 날짜를 보여 준다', async () => {
      const lastBackupAt = new Date(2026, 8, 3, 10, 0).toISOString()
      renderApp(new MemoryRepository(storedWith({ lastBackupAt, lastChangedAt: lastBackupAt })))
      await userEvent.click(screen.getByRole('button', { name: '설정' }))

      const card = within(screen.getByRole('region', { name: '기록 백업' }))
      expect(card.getByText('마지막 백업: 2026년 9월 3일')).toBeInTheDocument()
    })

    it('백업한 적이 없으면 "아직 백업하지 않았어요", 보내면 오늘 날짜로 바뀐다', async () => {
      stubShare()
      renderApp(new MemoryRepository(storedWith({ lastChangedAt: '2026-10-01T00:00:00.000Z' })))
      // 처음 기록(8월 1일)부터 30일이 지나 점이 붙어 있다
      await userEvent.click(screen.getByRole('button', { name: '설정 백업 필요' }))

      const card = within(screen.getByRole('region', { name: '기록 백업' }))
      expect(card.getByText('아직 백업하지 않았어요')).toBeInTheDocument()

      await userEvent.click(card.getByRole('button', { name: /^백업 파일 보내기/ }))

      expect(await card.findByText('마지막 백업: 2026년 10월 6일')).toBeInTheDocument()
    })
  })
})
