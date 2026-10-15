import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Settings, StoredData } from './domain/types'
import { AutoKeeper, type KeepState } from './features/keep/AutoKeeper'
import { keepIdOf, sealKeep, type KeepEnvelope } from './features/keep/keepCrypto'
import type { KeepServer } from './features/keep/keepServer'
import type { Keep } from './features/keep/startKeep'
import { createBackup } from './storage/backup'
import type { LedgerRepository } from './storage/LedgerRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { book, ledger, storedWith as storedWithLedgers } from './test/ledgerFixtures'

const TODAY = new Date('2026-10-13T09:00:00.000+09:00')
const DAY = 24 * 60 * 60 * 1000
const PHONE_CODE = 'HK7M-29QF-MX4P-8R2D'
const KEPT_CODE = 'AB2C-DE3F-GH4J-KM5N'
const KEPT_AT = new Date(2026, 9, 12, 15, 20).toISOString()

// 이 폰 기록: 백업도 해 둬서 30일 백업 안내가 끼지 않는다
function phoneData(settings: Settings = {}): StoredData {
  return {
    ...storedWithLedgers(ledger([[10, 'expense', '대관료', 40_000]], { year: 2026 })),
    settings: { lastBackupAt: TODAY.toISOString(), recoveryCode: PHONE_CODE, ...settings },
  }
}

// 다른 폰이 보관해 둔 기록 (장부 둘)
const KEPT: StoredData = {
  schemaVersion: 3,
  books: [
    book([ledger([[3, 'income', '회비', 140_000]], { year: 2026 })], { id: 'club', name: '꽃동산' }),
    book([ledger([[1, 'expense', '장보기', 30_000]], { year: 2026 })], { id: 'home', name: '우리집 가계부', kind: 'household' }),
  ],
  settings: { lastBookId: 'club', recoveryCode: KEPT_CODE },
}

// 가짜 보관 서버: 이름별 보관본, 지운 이름
function fakeServer(stored: Record<string, KeepEnvelope> = {}) {
  const removed: string[] = []
  const server: KeepServer = {
    put: async (id, envelope) => {
      stored[id] = envelope
      return 'ok'
    },
    get: async (id) => {
      const envelope = stored[id]
      return envelope ? { status: 'found', envelope } : { status: 'not-found' }
    },
    remove: async (id) => {
      removed.push(id)
      return true
    },
    sendStatus: async () => {},
  }
  return { server, removed }
}

async function serverWithKept() {
  const envelope = await sealKeep(KEPT_CODE, createBackup(KEPT, new Date(KEPT_AT)).text, KEPT_AT)
  return fakeServer({ [await keepIdOf(KEPT_CODE)]: envelope })
}

function keepWith(server: KeepServer, state: KeepState = { enabled: true }): Keep {
  let saved = state
  const store = { load: () => saved, save: (next: KeepState) => (saved = next) }
  return { keeper: new AutoKeeper({ server, store, now: () => TODAY }), server }
}

function renderApp(repository: LedgerRepository, keep?: Keep) {
  render(<App repository={repository} loaded={repository.load()} keep={keep} options={{ now: () => TODAY, createId: () => 'id' }} />)
  return repository
}

async function openSettings() {
  await userEvent.click(screen.getByRole('button', { name: /^설정/ }))
}

async function restoreWithCode(code: string) {
  await userEvent.type(screen.getByRole('textbox', { name: '복구 코드를 넣어 주세요' }), code)
  await userEvent.click(screen.getByRole('button', { name: '불러오기' }))
}

describe('SPEC-006 복구 코드로 자동 보관 (화면)', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share')
    vi.restoreAllMocks()
  })

  it('AC-1 설정 "기록 지키기" 에 복구 코드와 자동 보관(켜짐 · 마지막 보관)이 보인다', async () => {
    const { server } = fakeServer()
    renderApp(new MemoryRepository(phoneData()), keepWith(server, { enabled: true, lastKeptAt: new Date(TODAY.getTime() - 3 * 60_000).toISOString() }))
    await openSettings()

    const group = within(screen.getByRole('region', { name: '기록 지키기' }))
    expect(group.getByTestId('recovery-code-value')).toHaveTextContent(PHONE_CODE)
    expect(group.getByRole('button', { name: /^자동 보관/ })).toHaveTextContent('켜짐 · 3분 전')
  })

  it('서버 주소가 없는 빌드면 자동 보관은 "준비 중", 복구 코드는 보이고 [복구 코드로 불러오기] 는 없다', async () => {
    renderApp(new MemoryRepository(phoneData()))
    await openSettings()

    expect(screen.getByText('준비 중')).toBeInTheDocument()
    expect(screen.getByTestId('recovery-code-value')).toHaveTextContent(PHONE_CODE)
    expect(screen.queryByRole('button', { name: '복구 코드로 불러오기' })).not.toBeInTheDocument()
  })

  it('AC-4 7일 넘게 보관하지 못했으면 장부 위에 안내 띠가 뜬다', () => {
    const { server } = fakeServer()
    renderApp(new MemoryRepository(phoneData()), keepWith(server, { enabled: true, pendingSince: new Date(TODAY.getTime() - 8 * DAY).toISOString() }))

    expect(screen.getByTestId('notice-bar')).toHaveTextContent('인터넷에 연결되면 기록을 자동으로 보관해요. 7일째 보관하지 못했어요')
  })

  it('7일 보관 안내가 30일 백업 안내보다 먼저다 (띠는 하나만)', () => {
    const { server } = fakeServer()
    const overdue = phoneData({ lastBackupAt: '2026-08-01T00:00:00.000Z', lastChangedAt: '2026-09-01T00:00:00.000Z' })
    renderApp(new MemoryRepository(overdue), keepWith(server, { enabled: true, pendingSince: new Date(TODAY.getTime() - 8 * DAY).toISOString() }))

    expect(screen.getAllByTestId('notice-bar')).toHaveLength(1)
    expect(screen.getByTestId('notice-bar')).toHaveTextContent('7일째 보관하지 못했어요')
  })

  it('AC-5 설정에서 맞는 코드로 불러와 [바꾸기] 하면 모든 장부가 돌아오고 이 폰 복구 코드가 그 코드로 바뀐다', async () => {
    const { server } = await serverWithKept()
    const repository = renderApp(new MemoryRepository(phoneData()), keepWith(server))
    await openSettings()
    await userEvent.click(screen.getByRole('button', { name: '복구 코드로 불러오기' }))
    await restoreWithCode(KEPT_CODE.toLowerCase())

    const dialog = await screen.findByRole('alertdialog', { name: '보관본으로 바꿀까요?' })
    expect(within(dialog).getByText('2개 (꽃동산, 우리집 가계부)')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '바꾸기' }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('꽃동산')
    expect(screen.getByRole('status')).toHaveTextContent('불러왔어요')
    const saved = repository.load().data
    expect(saved.books.map((item) => item.name)).toEqual(['꽃동산', '우리집 가계부'])
    expect(saved.settings.recoveryCode).toBe(KEPT_CODE)
  })

  it('AC-5 틀린 코드면 다시 확인하라고 알리고 아무것도 바꾸지 않는다', async () => {
    const { server } = await serverWithKept()
    const repository = renderApp(new MemoryRepository(phoneData()), keepWith(server))
    await openSettings()
    await userEvent.click(screen.getByRole('button', { name: '복구 코드로 불러오기' }))
    await restoreWithCode('AB2C-DE3F-GH4J-KM5P')

    expect(await screen.findByText('이 코드로 보관된 기록이 없어요. 코드를 다시 확인해 주세요')).toBeInTheDocument()
    expect(repository.load().data).toEqual(phoneData())
  })

  it('AC-5 첫 실행(새 장부 만들기) 화면의 [복구 코드로 불러오기] 로 새 폰에 기록을 되찾는다', async () => {
    const { server } = await serverWithKept()
    const repository = renderApp(new MemoryRepository(), keepWith(server))

    expect(screen.getByRole('button', { name: '백업 불러오기' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '복구 코드로 불러오기' }))
    expect(screen.getByRole('heading', { level: 1, name: '복구 코드로 불러오기' })).toBeInTheDocument()

    await restoreWithCode(KEPT_CODE)
    const dialog = await screen.findByRole('alertdialog', { name: '보관본으로 바꿀까요?' })
    // 이 폰에 기록이 없으면 지워진다는 말이 없다
    expect(dialog).not.toHaveAccessibleDescription()
    await userEvent.click(within(dialog).getByRole('button', { name: '바꾸기' }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('꽃동산')
    expect(repository.load().data.settings.recoveryCode).toBe(KEPT_CODE)
  })

  it('첫 실행 불러오기 화면에서 [뒤로] 를 누르면 새 장부 만들기로 돌아온다', async () => {
    const { server } = fakeServer()
    renderApp(new MemoryRepository(), keepWith(server))
    await userEvent.click(screen.getByRole('button', { name: '복구 코드로 불러오기' }))
    await userEvent.click(screen.getByRole('button', { name: '뒤로' }))

    expect(await screen.findByTestId('new-book-screen')).toBeInTheDocument()
  })

  it('서버 주소가 없는 빌드의 첫 실행에는 [복구 코드로 불러오기] 가 없다', () => {
    renderApp(new MemoryRepository())
    expect(screen.queryByRole('button', { name: '복구 코드로 불러오기' })).not.toBeInTheDocument()
  })

  it('AC-6 [보내기] 는 공유 화면을 열고 보냈다고 알린다', async () => {
    const share = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    renderApp(new MemoryRepository(phoneData()))
    await openSettings()
    await userEvent.click(screen.getByRole('button', { name: '복구 코드 보내기' }))

    expect(share).toHaveBeenCalledWith({ text: `우리 장부 복구 코드: ${PHONE_CODE}` })
    expect(await screen.findByText('복구 코드를 보냈어요')).toBeInTheDocument()
  })

  it('AC-6 공유가 안 되면 복사하고 "복사했어요"', async () => {
    const user = userEvent.setup()
    renderApp(new MemoryRepository(phoneData()))
    await user.click(screen.getByRole('button', { name: /^설정/ }))
    await user.click(screen.getByRole('button', { name: '복구 코드 보내기' }))

    expect(await screen.findByText('복사했어요')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`우리 장부 복구 코드: ${PHONE_CODE}`)
  })

  it('자동 보관을 끄며 [지우기] 를 고르면 서버 사본을 지우고 줄이 "꺼짐" 이 된다', async () => {
    const { server, removed } = fakeServer()
    const keep = keepWith(server)
    keep.keeper.start(phoneData())
    await keep.keeper.idle()
    renderApp(new MemoryRepository(phoneData()), keep)
    await openSettings()

    await userEvent.click(screen.getByRole('button', { name: /^자동 보관/ }))
    await userEvent.click(within(screen.getByRole('group', { name: '자동 보관' })).getByRole('button', { name: '끄기' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '지우기' }))

    expect(await screen.findByText('자동 보관을 끄고 보관해 둔 기록을 지웠어요')).toBeInTheDocument()
    expect(removed).toEqual([await keepIdOf(PHONE_CODE)])
    expect(screen.getByRole('button', { name: /^자동 보관/ })).toHaveTextContent('꺼짐')
  })
})
