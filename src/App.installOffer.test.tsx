import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import type { StoredData } from './domain/types'
import type { InstallOfferStatus, InstallOfferStore } from './features/install/installOffer'
import { createInstallPromptStore, type InstallEnvironment } from './features/install/installPrompt'
import { MemoryRepository } from './storage/MemoryRepository'
import { ledger, storedWith } from './test/ledgerFixtures'

const TODAY = new Date('2026-10-13T09:00:00.000+09:00')
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'

// 기기의 권하기 상태 (dongari:install-offer 대신 메모리)
function memoryOfferStore(initial?: InstallOfferStatus) {
  const store = {
    saved: initial,
    load: () => store.saved,
    save: (next: InstallOfferStatus) => {
      store.saved = next
    },
  }
  return store
}

// 테스트마다 따로 듣는 곳을 두어 앞 테스트의 설치 제안이 섞이지 않게 한다
function browser(overrides: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return { standalone: false, userAgent: CHROME_UA, installPrompt: createInstallPromptStore(new EventTarget()), ...overrides }
}

// 크롬·삼성 인터넷이 설치할 수 있을 때 보내는 이벤트를 흉내 낸다
function browserWithPrompt(outcome: 'accepted' | 'dismissed') {
  const events = new EventTarget()
  const installPrompt = createInstallPromptStore(events)
  const prompt = vi.fn(async () => {})
  events.dispatchEvent(
    Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome, platform: 'web' }),
    }),
  )
  return { install: browser({ installPrompt }), prompt }
}

function renderApp(data: StoredData | undefined, installOfferStore: InstallOfferStore, install = browser()) {
  const repository = new MemoryRepository(data)
  let seq = 0
  return render(
    <App
      repository={repository}
      loaded={repository.load()}
      installOfferStore={installOfferStore}
      install={install}
      options={{ now: () => TODAY, createId: () => `id-${++seq}` }}
    />,
  )
}

async function createFirstBook() {
  await userEvent.click(screen.getByRole('button', { name: '동아리·모임' }))
  await userEvent.type(screen.getByLabelText('장부 이름'), '한랑드림')
  await userEvent.click(screen.getByRole('button', { name: '만들기' }))
  await screen.findByTestId('ledger-screen')
}

const offerCard = () => screen.queryByTestId('install-offer')

describe('SPEC-002 첫 장부 뒤 홈 화면에 추가 권하기 (#135)', () => {
  it('첫 실행에서 첫 장부를 만든 직후 장부 위에 권하기 카드가 보이고, 기기에 기다림으로 적어 둔다', async () => {
    const store = memoryOfferStore()
    renderApp(undefined, store)

    await createFirstBook()

    const card = offerCard()
    expect(card).toHaveTextContent('홈 화면에 추가하면 앱처럼 바로 열려요')
    expect(within(card ?? document.body).getByRole('button', { name: '홈 화면에 추가' })).toBeInTheDocument()
    expect(within(card ?? document.body).getByRole('button', { name: '나중에' })).toBeInTheDocument()
    expect(store.saved).toBe('waiting')
  })

  it('[나중에] 를 누르면 카드가 사라지고 기기에 적어 두어 다시 열어도 뜨지 않는다', async () => {
    const store = memoryOfferStore()
    const { unmount } = renderApp(undefined, store)
    await createFirstBook()

    await userEvent.click(screen.getByRole('button', { name: '나중에' }))

    expect(offerCard()).not.toBeInTheDocument()
    expect(store.saved).toBe('done')
    unmount()
    renderApp(storedWith(ledger([], { year: 2026 })), store)
    expect(offerCard()).not.toBeInTheDocument()
  })

  it('[나중에] 를 누르지 않았으면 다시 열어도 장부 위에 카드가 있다', () => {
    renderApp(storedWith(ledger([], { year: 2026 })), memoryOfferStore('waiting'))

    expect(offerCard()).toBeInTheDocument()
  })

  it('설치 제안이 없으면 [홈 화면에 추가] 가 설정 줄과 같은 방법 안내 선택 창을 연다', async () => {
    renderApp(undefined, memoryOfferStore())
    await createFirstBook()

    await userEvent.click(screen.getByRole('button', { name: '홈 화면에 추가' }))

    const sheet = screen.getByRole('dialog', { name: '홈 화면에 추가하는 방법' })
    expect(within(sheet).getByTestId('install-guide')).toHaveAttribute('data-browser', 'chrome')
  })

  it('설치 제안이 있으면 [홈 화면에 추가] 가 브라우저 설치 창을 열고, 설치하면 카드가 사라져 다시 뜨지 않는다', async () => {
    const store = memoryOfferStore()
    const { install, prompt } = browserWithPrompt('accepted')
    renderApp(undefined, store, install)
    await createFirstBook()

    await userEvent.click(screen.getByRole('button', { name: '홈 화면에 추가' }))

    expect(prompt).toHaveBeenCalledOnce()
    expect(offerCard()).not.toBeInTheDocument()
    expect(store.saved).toBe('done')
  })

  it('홈 화면 앱(standalone)으로 열었으면 첫 장부를 만들어도 카드가 뜨지 않는다', async () => {
    renderApp(undefined, memoryOfferStore(), browser({ standalone: true }))

    await createFirstBook()

    expect(offerCard()).not.toBeInTheDocument()
  })

  it('이미 쓰던 폰(값 없음)에서 두 번째 장부를 만들어도 카드가 뜨지 않는다', async () => {
    const store = memoryOfferStore()
    renderApp(storedWith(ledger([], { year: 2026 })), store)

    await userEvent.click(screen.getByTestId('book-button'))
    await userEvent.click(within(screen.getByRole('dialog', { name: '어느 장부를 볼까요?' })).getByRole('button', { name: '새 장부 만들기' }))
    await userEvent.click(screen.getByRole('button', { name: '개인 가계부' }))
    await userEvent.type(screen.getByLabelText('장부 이름'), '우리집')
    await userEvent.click(screen.getByRole('button', { name: '만들기' }))
    await screen.findByTestId('ledger-screen')

    expect(offerCard()).not.toBeInTheDocument()
    expect(store.saved).toBeUndefined()
  })

  it('장부 위 다른 띠(30일 기록 파일 안내)가 있으면 그 띠만 보이고 권하기는 뒤로 미룬다', () => {
    const overdue: StoredData = {
      ...storedWith(ledger([], { year: 2026 })),
      settings: { lastBackupAt: '2026-09-01T00:00:00.000Z', lastChangedAt: '2026-09-15T00:00:00.000Z' },
    }
    renderApp(overdue, memoryOfferStore('waiting'))

    expect(screen.getByTestId('notice-bar')).toHaveTextContent('기록 파일')
    expect(offerCard()).not.toBeInTheDocument()
  })
})
