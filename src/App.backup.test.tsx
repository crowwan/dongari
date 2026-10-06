import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Ledger, StoredData } from './domain/types'
import type { LedgerRepository, LoadResult } from './storage/LedgerRepository'
import { LocalStorageRepository, STORAGE_KEY } from './storage/LocalStorageRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { createEmptyData } from './storage/schema'

const TODAY = new Date('2026-10-03T09:00:00.000+09:00')

const LEDGER_2025: Ledger = {
  year: 2025,
  clubName: '한랑드림',
  carryover: 100_000,
  entries: [
    { id: 'a', month: 3, type: 'income', name: '회비', amount: 140_000, createdAt: '2025-03-01T00:00:00.000Z' },
  ],
}

const LEDGER_2026: Ledger = {
  year: 2026,
  clubName: '꽃동산',
  carryover: 200_000,
  entries: [
    { id: 'b', month: 9, type: 'income', name: '회비', amount: 50_000, createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'c', month: 10, type: 'expense', name: '대관료', amount: 40_000, createdAt: '2026-10-01T00:00:00.000Z' },
  ],
}

function storedWith(...ledgers: Ledger[]): StoredData {
  return {
    ...createEmptyData(),
    ledgers: Object.fromEntries(ledgers.map((item) => [String(item.year), item])),
    settings: { lastChangedAt: '2026-10-01T00:00:00.000Z' },
  }
}

function renderApp(repository: LedgerRepository = new MemoryRepository(), loaded: LoadResult = repository.load()) {
  let seq = 0
  render(<App repository={repository} loaded={loaded} options={{ now: () => TODAY, createId: () => `id-${++seq}` }} />)
  return repository
}

// 폰의 공유 기능 흉내. 공유한 파일을 모아 둔다
function stubShare(share: (data: ShareData) => Promise<void> = () => Promise.resolve()) {
  const sharedFiles: File[] = []
  const shareMock = vi.fn((data: ShareData) => {
    sharedFiles.push(...(data.files ?? []))
    return share(data)
  })
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
  Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true })
  return { shareMock, sharedFiles }
}

function textFile(text: string, name = '동아리회계-백업-2026-10-03.txt'): File {
  return new File([text], name, { type: 'text/plain' })
}

async function chooseFile(file: File) {
  await userEvent.upload(screen.getByLabelText('백업 파일 고르기'), file)
}

async function openSettings() {
  await userEvent.click(screen.getByRole('button', { name: '설정' }))
}

describe('SPEC-002 백업 파일 보내기·불러오기', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'canShare')
    Reflect.deleteProperty(navigator, 'share')
    vi.restoreAllMocks()
  })

  it('설정에 기록 백업 묶음과 [백업 파일 보내기] [백업 파일 불러오기] 가 있다', async () => {
    renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
    await openSettings()

    const card = within(screen.getByRole('region', { name: '기록 백업' }))
    expect(card.getByRole('button', { name: '백업 파일 보내기' })).toBeInTheDocument()
    expect(card.getByRole('button', { name: '백업 파일 불러오기' })).toBeInTheDocument()
  })

  describe('보내기', () => {
    it('AC-6 공유 화면에 오늘 날짜 백업 파일을 보내고, 보냈으면 마지막 백업 시각만 기록하고 알린다', async () => {
      const { shareMock, sharedFiles } = stubShare()
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openSettings()

      await userEvent.click(screen.getByRole('button', { name: '백업 파일 보내기' }))

      expect(shareMock).toHaveBeenCalledOnce()
      expect(sharedFiles.map((file) => file.name)).toEqual(['동아리회계-백업-2026-10-03.txt'])
      expect(JSON.parse(await sharedFiles[0].text())).toEqual(storedWith(LEDGER_2026))
      expect(await screen.findByText('백업 파일을 보냈어요')).toBeInTheDocument()
      expect(repository.load().data.settings).toEqual({
        lastChangedAt: '2026-10-01T00:00:00.000Z',
        lastBackupAt: TODAY.toISOString(),
      })
    })

    it('공유 화면을 그냥 닫으면 아무 알림 없이 백업 시각도 남기지 않는다', async () => {
      const { shareMock } = stubShare(() => Promise.reject(new DOMException('취소', 'AbortError')))
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openSettings()

      await userEvent.click(screen.getByRole('button', { name: '백업 파일 보내기' }))

      await vi.waitFor(() => expect(shareMock).toHaveBeenCalledOnce())
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      expect(repository.load().data.settings.lastBackupAt).toBeUndefined()
    })

    it('공유를 못 하는 브라우저면 파일을 내려받고 그때도 백업 시각을 기록한다', async () => {
      const urls = { createObjectURL: vi.fn(() => 'blob:backup'), revokeObjectURL: vi.fn() }
      Object.defineProperty(URL, 'createObjectURL', { value: urls.createObjectURL, configurable: true })
      Object.defineProperty(URL, 'revokeObjectURL', { value: urls.revokeObjectURL, configurable: true })
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openSettings()

      await userEvent.click(screen.getByRole('button', { name: '백업 파일 보내기' }))

      expect(click).toHaveBeenCalledOnce()
      expect(await screen.findByText('백업 파일을 다운로드 폴더에 저장했어요')).toBeInTheDocument()
      expect(repository.load().data.settings.lastBackupAt).toBe(TODAY.toISOString())
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    })

    it('저장 실패 안내 띠의 [백업 파일 보내기] 로도 보낸다', async () => {
      const { shareMock } = stubShare()
      const memory = new MemoryRepository(storedWith(LEDGER_2026))
      renderApp({ load: () => memory.load(), save: () => ({ ok: false, reason: 'quota-exceeded' }), restore: (data) => memory.restore(data) })
      await openSettings()
      await userEvent.type(screen.getByLabelText('동아리 이름'), '2')
      await userEvent.click(screen.getByRole('button', { name: '바꾼 내용 저장' }))

      await userEvent.click(within(screen.getByTestId('notice-bar')).getByRole('button', { name: '백업 파일 보내기' }))

      expect(shareMock).toHaveBeenCalledOnce()
    })
  })

  describe('불러오기', () => {
    it('AC-3 보낸 백업 파일을 데이터를 지운 새 폰에서 불러오면 전과 같은 장부가 된다', async () => {
      const original = storedWith(LEDGER_2025, LEDGER_2026)
      const { sharedFiles } = stubShare()
      renderApp(new MemoryRepository(original))
      await openSettings()
      await userEvent.click(screen.getByRole('button', { name: '백업 파일 보내기' }))
      await screen.findByText('백업 파일을 보냈어요')
      const backupFile = sharedFiles[0]
      cleanup()

      // 데이터를 지운 새 폰: 첫 실행 화면 위쪽 [백업 불러오기]
      const fresh = renderApp(new MemoryRepository())
      await userEvent.click(screen.getByRole('button', { name: '백업 불러오기' }))
      await chooseFile(backupFile)

      const dialog = await screen.findByRole('alertdialog', { name: '2025년·2026년 장부(기록 3건)를 불러올까요?' })
      // 지금 기록이 없으면 바뀐다는 경고 없이 주 버튼
      expect(dialog).not.toHaveAccessibleDescription()
      expect(within(dialog).getByRole('button', { name: '불러오기' })).toHaveAttribute('data-variant', 'primary')
      await userEvent.click(within(dialog).getByRole('button', { name: '불러오기' }))

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('꽃동산')
      expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('210,000원')
      expect(screen.getByRole('status')).toHaveTextContent('불러왔어요')
      expect(fresh.load().data).toEqual(original)
    })

    it('지금 기록이 있으면 바뀐다고 알리는 위험 확인 창을 띄우고, [아니요] 면 아무것도 바꾸지 않는다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openSettings()

      await chooseFile(textFile(JSON.stringify(storedWith(LEDGER_2025))))

      const dialog = await screen.findByRole('alertdialog', { name: '2025년 장부(기록 1건)를 불러올까요?' })
      expect(dialog).toHaveAccessibleDescription('지금 기록은 불러온 기록으로 바뀌어요')
      expect(within(dialog).getByRole('button', { name: '불러오기' })).toHaveAttribute('data-variant', 'danger')
      await userEvent.click(within(dialog).getByRole('button', { name: '아니요' }))

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByTestId('settings-screen')).toBeInTheDocument()
      expect(repository.load().data).toEqual(storedWith(LEDGER_2026))
    })

    it('설정에서 [불러오기] 하면 바꿔 저장하고 장부로 돌아가 올해 장부의 이번 달을 보여 준다', async () => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2025)))
      await openSettings()
      await userEvent.click(within(screen.getByRole('group', { name: '장부 연도' })).getByRole('button', { name: '2025년' }))
      await openSettings()

      await chooseFile(textFile(JSON.stringify(storedWith(LEDGER_2026))))
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '불러오기' }))

      expect(screen.getByTestId('ledger-year')).toHaveTextContent('2026년')
      expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('10월')
      expect(repository.load().data).toEqual(storedWith(LEDGER_2026))
    })

    it.each([
      ['깨진 JSON', '{"schemaVersion": 2,', '동아리 회계에서 보낸 백업 파일인지 확인해 주세요'],
      ['다른 형식', JSON.stringify({ name: '가계부' }), '동아리 회계에서 보낸 백업 파일인지 확인해 주세요'],
      ['상위 버전', JSON.stringify({ schemaVersion: 3, ledgers: {}, settings: {} }), '앱을 새로고침한 뒤 다시 시도해 주세요'],
    ])('AC-4 %s 파일은 불러오지 않고 "이 파일은 열 수 없어요" 를 알리며 기존 데이터를 유지한다', async (_label, text, description) => {
      const repository = renderApp(new MemoryRepository(storedWith(LEDGER_2026)))
      await openSettings()

      await chooseFile(textFile(text))

      const dialog = await screen.findByRole('alertdialog', { name: '이 파일은 열 수 없어요' })
      expect(dialog).toHaveAccessibleDescription(description)
      expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(['확인'])
      await userEvent.click(within(dialog).getByRole('button', { name: '확인' }))

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(repository.load().data).toEqual(storedWith(LEDGER_2026))
      await userEvent.click(screen.getByRole('button', { name: '장부로' }))
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('꽃동산')
    })

    it('불러온 것을 저장하지 못하면 지금 기록을 그대로 두고 알린다', async () => {
      const memory = new MemoryRepository(storedWith(LEDGER_2026))
      renderApp({ load: () => memory.load(), save: (data) => memory.save(data), restore: () => ({ ok: false, reason: 'quota-exceeded' }) })
      await openSettings()

      await chooseFile(textFile(JSON.stringify(storedWith(LEDGER_2025))))
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '불러오기' }))

      const dialog = screen.getByRole('alertdialog', { name: '불러오지 못했어요' })
      expect(dialog).toHaveAccessibleDescription('기기에 저장하지 못했어요. 지금 기록은 그대로예요')
      expect(memory.load().data).toEqual(storedWith(LEDGER_2026))
    })
  })

  describe('시작 안내에서 불러오기', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('원본을 옮기지 못해 저장을 막았으면 안내 띠의 [백업 파일 불러오기] 로 풀고 이후 기록이 저장된다', async () => {
      localStorage.setItem(STORAGE_KEY, 'not json')
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new DOMException('용량 초과', 'QuotaExceededError')
      })
      const repository = new LocalStorageRepository()
      const loaded = repository.load()
      setItem.mockRestore()
      renderApp(repository, loaded)

      const notice = screen.getByTestId('notice-bar')
      expect(within(notice).getByRole('alert')).toHaveTextContent('저장된 기록을 읽지 못했어요. 지금 적는 내용은 저장되지 않아요')
      // 같은 버튼이 안내 띠에 있으니 첫 실행 화면 위쪽 버튼은 숨긴다
      expect(screen.queryByRole('button', { name: '백업 불러오기' })).not.toBeInTheDocument()

      await userEvent.click(within(notice).getByRole('button', { name: '백업 파일 불러오기' }))
      await chooseFile(textFile(JSON.stringify(storedWith(LEDGER_2026))))
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '불러오기' }))

      expect(screen.queryByTestId('notice-bar')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '+ 내역 적기' }))
      await userEvent.click(screen.getByRole('button', { name: '지출' }))
      await userEvent.type(screen.getByLabelText('직접 적기'), '간식비')
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '5000')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(screen.queryByTestId('notice-bar')).not.toBeInTheDocument()
      expect(new LocalStorageRepository().load().data.ledgers['2026']?.entries).toHaveLength(3)
    })

    it('새 버전 기록이 있어 저장을 막았으면 안내 띠에 불러오기 버튼이 없다', () => {
      renderApp(new MemoryRepository(), { status: 'read-only', reason: 'newer-version', data: createEmptyData() })

      expect(within(screen.getByTestId('notice-bar')).queryByRole('button')).not.toBeInTheDocument()
    })
  })
})
