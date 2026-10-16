import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import type { StoredData } from './domain/types'
import { ACTIVE_GUIDE, GUIDE_OFF, type GuideState, type SeenGuideNumber } from './features/guide/guideRules'
import { GUIDE_KEY, localGuideStore, type GuideStore } from './features/guide/guideStore'
import { AutoKeeper, type KeepState } from './features/keep/AutoKeeper'
import type { KeepServer } from './features/keep/keepServer'
import type { Keep } from './features/keep/startKeep'
import { createBackup } from './storage/backup'
import { MemoryRepository } from './storage/MemoryRepository'
import { ledger, storedWith, type EntrySpec } from './test/ledgerFixtures'

const TODAY = new Date('2026-10-13T09:00:00.000+09:00')
const PHONE_CODE = 'HK7M-29QF-MX4P-8R2D'

// 기기의 안내 상태 (dongari:guide 대신 메모리)
function memoryGuideStore(initial?: GuideState) {
  const store = { saved: initial, load: () => store.saved, save: (next: GuideState) => (store.saved = next) }
  return store
}

const seenUpTo = (...seen: SeenGuideNumber[]): GuideState => ({ ...ACTIVE_GUIDE, seen })

// 10월 기록 n 건이 든 2026년 장부 (복구 코드 있음, 기록 파일도 보내 둬서 30일 안내가 끼지 않는다)
function phoneWith(count: number): StoredData {
  const specs: EntrySpec[] = Array.from({ length: count }, (_, index) => [10, 'expense', `지출${index + 1}`, 10_000])
  return { ...storedWith(ledger(specs, { year: 2026 })), settings: { lastBackupAt: TODAY.toISOString(), recoveryCode: PHONE_CODE } }
}

// 아무 일도 하지 않는 보관 서버로 자동으로 지키기를 쓸 수 있는 빌드
function keepWith(state: KeepState = { enabled: true, lastKeptAt: TODAY.toISOString() }): Keep {
  const server: KeepServer = {
    put: async () => 'ok',
    get: async () => ({ status: 'not-found' }),
    remove: async () => true,
    sendStatus: async () => {},
  }
  let saved = state
  const store = { load: () => saved, save: (next: KeepState) => (saved = next) }
  return { keeper: new AutoKeeper({ server, store, now: () => TODAY }), server }
}

function renderApp(data: StoredData | undefined, guideStore: GuideStore, keep?: Keep) {
  let seq = 0
  const repository = new MemoryRepository(data)
  const view = render(
    <App
      repository={repository}
      loaded={repository.load()}
      keep={keep}
      guideStore={guideStore}
      options={{ now: () => TODAY, createId: () => `id-${++seq}`, createRecoveryCode: () => PHONE_CODE }}
    />,
  )
  return { repository, ...view }
}

function pressBackButton() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
}

const coachMark = () => screen.queryByTestId('coach-mark')

function isLocked(element: HTMLElement): boolean {
  return element.closest('[inert]') !== null
}

async function createFirstBook() {
  await userEvent.click(screen.getByRole('button', { name: '동아리·모임' }))
  await userEvent.type(screen.getByLabelText('장부 이름'), '한랑드림')
  await userEvent.click(screen.getByRole('button', { name: '만들기' }))
  await screen.findByTestId('ledger-screen')
}

// 내역 적기 화면에서 처음 쓰는 이름의 지출 하나를 [저장] 한다 (연달아 적기라 내역 적기에 남는다)
async function saveExpense(name: string) {
  const dayField = screen.getByRole('textbox', { name: '며칠인가요?' })
  await userEvent.clear(dayField)
  await userEvent.type(dayField, '3')
  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await userEvent.click(within(screen.getByRole('group', { name: '자주 쓴 항목' })).getByRole('button', { name: '직접 적기' }))
  await userEvent.type(screen.getByLabelText('직접 적기'), name)
  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await userEvent.click(within(screen.getByRole('group', { name: '수입인가요, 지출인가요?' })).getByRole('button', { name: '지출' }))
  await userEvent.type(screen.getByLabelText('얼마인가요?'), '10000')
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
}

async function finishEntries() {
  await userEvent.click(screen.getByRole('button', { name: '다 적었어요' }))
  await screen.findByTestId('ledger-screen')
}

// 가리키는 [설정] 과 그 설명(말풍선 글)
function expectPointingSettings() {
  expect(coachMark()).toHaveAttribute('data-state', '4')
  const target = screen.getByRole('button', { name: /^설정/ })
  expect(target).toHaveAccessibleDescription('폰을 바꿔도 기록이 돌아오게 복구 코드를 보내 두세요')
  return target
}

describe('SPEC-008 진짜 장부의 복구 코드 안내 말풍선 (화면)', () => {
  it('AC-28 첫 실행에서 첫 장부를 만든 폰에서 모든 장부 기록이 3건이 된 뒤 장부로 돌아오면 말풍선이 [설정] 을 가리킨다', async () => {
    const guideStore = memoryGuideStore()
    renderApp(undefined, guideStore, keepWith())
    await createFirstBook()
    expect(guideStore.saved).toEqual(ACTIVE_GUIDE)

    await userEvent.click(screen.getByRole('button', { name: '내역 적기' }))
    await saveExpense('대관료')
    await saveExpense('꽃값')
    await saveExpense('간식')
    await finishEntries()

    expect(await screen.findByTestId('coach-mark')).toBeInTheDocument()
    expectPointingSettings()
  })

  it('AC-30 첫 장부를 만든 직후·첫 기록 뒤·처음 결산을 열 때 [+ 내역 적기]·[N월 정리 보기]·결산 버튼을 가리키는 말풍선이 뜨지 않는다', async () => {
    renderApp(undefined, memoryGuideStore(), keepWith())
    await createFirstBook()
    expect(coachMark()).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '내역 적기' }))
    await saveExpense('대관료')
    await finishEntries()
    expect(screen.getByRole('button', { name: '10월 정리 보기' })).toBeInTheDocument()
    expect(coachMark()).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '결산' }))
    expect(screen.getByRole('heading', { level: 1, name: '2026년 결산' })).toBeInTheDocument()
    expect(coachMark()).not.toBeInTheDocument()
  })

  it('AC-28 #122 시절 본 번호(1·2·3)가 남은 폰도 기록 3건 이상이면 장부에서 말풍선이 [설정] 을 가리킨다', async () => {
    renderApp(phoneWith(3), memoryGuideStore(seenUpTo(1, 2, 3)), keepWith())

    expect(await screen.findByTestId('coach-mark')).toBeInTheDocument()
    expectPointingSettings()
  })

  it('AC-29 서버 주소가 없는 빌드면 말풍선이 뜨지 않는다', () => {
    renderApp(phoneWith(3), memoryGuideStore(seenUpTo(1, 2, 3)))

    expect(coachMark()).not.toBeInTheDocument()
  })

  it('AC-29 자동으로 지키기가 꺼져 있으면 말풍선이 뜨지 않고, 켜면 다음에 장부로 돌아올 때 뜬다', async () => {
    const keep = keepWith({ enabled: false })
    renderApp(phoneWith(3), memoryGuideStore(seenUpTo(1, 2, 3)), keep)
    expect(coachMark()).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^설정/ }))
    act(() => keep.keeper.setEnabled(true))
    expect(coachMark()).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /장부로/ }))
    await screen.findByTestId('ledger-screen')

    expect(await screen.findByTestId('coach-mark')).toHaveAttribute('data-state', '4')
  })

  it('AC-31 말풍선이 떠 있는 동안 말풍선과 [설정] 밖은 inert 라 누르기·Tab 이 닿지 않는다', async () => {
    renderApp(phoneWith(3), memoryGuideStore(seenUpTo(1, 2, 3)), keepWith())
    await screen.findByTestId('coach-mark')

    expect(isLocked(screen.getByRole('button', { name: '결산' }))).toBe(true)
    expect(isLocked(screen.getByRole('button', { name: '내역 적기' }))).toBe(true)
    expect(isLocked(screen.getByRole('button', { name: /^설정/ }))).toBe(false)
    expect(isLocked(screen.getByRole('button', { name: '알겠어요' }))).toBe(false)
    expect(isLocked(screen.getByRole('button', { name: '안내 닫기' }))).toBe(false)
  })

  it('AC-32 [설정] 을 누르면 말풍선이 닫히고 설정이 열리며, 설정에서 뒤로 버튼 한 번에 장부로 온다', async () => {
    renderApp(phoneWith(3), memoryGuideStore(ACTIVE_GUIDE), keepWith())
    await screen.findByTestId('coach-mark')

    await userEvent.click(screen.getByRole('button', { name: /^설정/ }))
    expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    expect(coachMark()).not.toBeInTheDocument()

    // 말풍선 칸을 설정 칸으로 바꿔 끼웠다
    pressBackButton()
    await screen.findByTestId('ledger-screen')
    expect(coachMark()).not.toBeInTheDocument()
  })

  it.each([
    { how: '[알겠어요]', close: () => userEvent.click(screen.getByRole('button', { name: '알겠어요' })) },
    { how: '[✕]', close: () => userEvent.click(screen.getByRole('button', { name: '안내 닫기' })) },
    { how: '뒤로 버튼', close: async () => pressBackButton() },
  ])('AC-33 $how 으로 닫으면 장부 화면에 남고, 그 말풍선은 앱을 다시 열어도 뜨지 않는다', async ({ close }) => {
    const guideStore = memoryGuideStore(seenUpTo(1, 2, 3))
    const { repository, unmount } = renderApp(phoneWith(3), guideStore, keepWith())
    await screen.findByTestId('coach-mark')

    await close()

    expect(coachMark()).not.toBeInTheDocument()
    expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    expect(guideStore.saved?.seen).toContain(4)
    unmount()
    render(<App repository={repository} loaded={repository.load()} keep={keepWith()} guideStore={guideStore} options={{ now: () => TODAY }} />)
    expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    expect(coachMark()).not.toBeInTheDocument()
  })

  it('AC-34 첫 실행에서 기록 파일로 불러와 시작하면 안내를 끈다', async () => {
    const guideStore = memoryGuideStore()
    renderApp(undefined, guideStore)

    await userEvent.click(screen.getByRole('button', { name: '기록 파일 불러오기' }))
    await userEvent.upload(
      screen.getByLabelText('기록 파일 고르기'),
      new File([createBackup(phoneWith(0), TODAY).text], '우리장부-기록.txt', { type: 'text/plain' }),
    )
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '불러오기' }))
    await screen.findByTestId('ledger-screen')

    expect(guideStore.saved).toEqual(GUIDE_OFF)
    expect(coachMark()).not.toBeInTheDocument()
  })

  it('AC-34 이미 쓰던 폰에서 두 번째 장부를 만들어도 안내를 켜지 않는다', async () => {
    const guideStore = memoryGuideStore(GUIDE_OFF)
    renderApp(phoneWith(0), guideStore)

    await userEvent.click(screen.getByTestId('book-button'))
    await userEvent.click(within(screen.getByRole('dialog', { name: '어느 장부를 볼까요?' })).getByRole('button', { name: '새 장부 만들기' }))
    await userEvent.click(screen.getByRole('button', { name: '개인 가계부' }))
    await userEvent.type(screen.getByLabelText('장부 이름'), '우리집')
    await userEvent.click(screen.getByRole('button', { name: '만들기' }))
    await screen.findByTestId('ledger-screen')

    expect(guideStore.saved).toEqual(GUIDE_OFF)
    expect(coachMark()).not.toBeInTheDocument()
  })

  it('AC-35 안내 상태는 dongari:guide 에만 있고 장부 데이터(기록 파일·보관본의 원본)에는 들어가지 않는다. 값이 깨졌으면 뜨지 않는다', async () => {
    localStorage.setItem(GUIDE_KEY, '{깨짐')
    const { repository, unmount } = renderApp(phoneWith(0), localGuideStore())
    expect(coachMark()).not.toBeInTheDocument()
    localStorage.removeItem(GUIDE_KEY)
    unmount()

    const fresh = memoryGuideStore()
    const first = renderApp(undefined, fresh)
    await createFirstBook()
    expect(fresh.saved).toEqual(ACTIVE_GUIDE)
    expect(JSON.stringify(first.repository.load().data)).not.toMatch(/guide|seen/)
    expect(JSON.stringify(repository.load().data)).not.toMatch(/guide|seen/)
  })

  it('AC-31 말풍선이 열리면 포커스가 [설정] 으로 간다', async () => {
    renderApp(phoneWith(3), memoryGuideStore(seenUpTo(1, 2, 3)), keepWith())
    await screen.findByTestId('coach-mark')

    expect(screen.getByRole('button', { name: /^설정/ })).toHaveFocus()
  })
})
