import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredData } from './domain/types'
import type { InAppBrowser, InAppKind } from './features/install/inAppBrowser'
import type { InstallOfferStatus } from './features/install/installOffer'
import { createInstallPromptStore, type InstallEnvironment } from './features/install/installPrompt'
import { AutoKeeper, type KeepState } from './features/keep/AutoKeeper'
import { keepIdOf, sealKeep } from './features/keep/keepCrypto'
import type { KeepPutResult, KeepServer } from './features/keep/keepServer'
import type { Keep } from './features/keep/startKeep'
import { AppRoot } from './features/practice/AppRoot'
import { createBackup } from './storage/backup'
import { MemoryRepository } from './storage/MemoryRepository'
import { ledger, storedWith } from './test/ledgerFixtures'

const TODAY = new Date('2026-10-16T09:00:00.000+09:00')
const PHONE_CODE = 'HK7M-29QF-MX4P-8R2D'
const KAKAO_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410520'
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'

// 카톡 안에 이미 있는 장부 (백업도 해 둬서 30일 안내가 끼지 않는다)
function phoneData(): StoredData {
  return {
    ...storedWith(ledger([[10, 'expense', '대관료', 40_000]], { year: 2026 })),
    settings: { lastBackupAt: TODAY.toISOString(), recoveryCode: PHONE_CODE },
  }
}

// 카톡 안 표시 dongari:in-app 대신 메모리
function kakao(kind: InAppKind = 'kakao-android', stays = false) {
  const store = { marked: stays, stays: () => store.marked, stay: vi.fn(() => (store.marked = true)) }
  const inApp: InAppBrowser = { kind, store }
  return { inApp, store }
}

function browser(userAgent: string): InstallEnvironment {
  return { standalone: false, userAgent, installPrompt: createInstallPromptStore(new EventTarget()) }
}

// 가짜 보관 서버: 올리기 답은 테스트가 정한다 (기본 바로 성공)
function fakeServer(answer: () => Promise<KeepPutResult> = async () => 'ok') {
  const server = {
    put: vi.fn<KeepServer['put']>(answer),
    get: vi.fn<KeepServer['get']>(async () => ({ status: 'not-found' })),
    remove: vi.fn<KeepServer['remove']>(async () => true),
    sendStatus: vi.fn<KeepServer['sendStatus']>(async () => {}),
  }
  return server
}

function keepWith(server: KeepServer, state: KeepState = { enabled: true }): Keep {
  let saved = state
  const store = { load: () => saved, save: (next: KeepState) => (saved = next) }
  return { keeper: new AutoKeeper({ server, store, now: () => TODAY }), server }
}

function memoryOfferStore() {
  const store = {
    saved: undefined as InstallOfferStatus | undefined,
    load: () => store.saved,
    save: (next: InstallOfferStatus) => {
      store.saved = next
    },
  }
  return store
}

type RenderOptions = {
  data?: StoredData
  inApp?: InAppBrowser
  keep?: Keep
  fromKakao?: boolean
  userAgent?: string
  installOfferStore?: ReturnType<typeof memoryOfferStore>
}

function renderRoot({ data, inApp, keep, fromKakao, userAgent = KAKAO_UA, installOfferStore }: RenderOptions = {}) {
  const repository = new MemoryRepository(data)
  let seq = 0
  return render(
    <AppRoot
      repository={repository}
      loaded={repository.load()}
      keep={keep}
      inApp={inApp}
      fromKakao={fromKakao}
      install={browser(userAgent)}
      installOfferStore={installOfferStore}
      options={{ now: () => TODAY, createId: () => `id-${++seq}`, createRecoveryCode: () => PHONE_CODE }}
    />,
  )
}

// 클립보드 흉내 (카톡 안 쓰기 T-7, 인터넷 앱 읽기 T-8)
function stubClipboard(clipboard: Partial<Clipboard>) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
}

const inAppScreen = () => screen.queryByTestId('in-app-screen')
const openLink = (name: string | RegExp) => screen.getByRole('link', { name })

// 링크를 눌러도 jsdom 이 다른 앱 주소로 가려고 하지 않게 (누름 처리는 그대로 돈다)
function blockNavigation(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('a')) event.preventDefault()
}

describe('SPEC-009 C 카톡 안에서 열렸을 때', () => {
  beforeEach(() => {
    document.addEventListener('click', blockNavigation)
    window.history.replaceState(null, '', '/dongari/')
  })

  afterEach(() => {
    document.removeEventListener('click', blockNavigation)
    Reflect.deleteProperty(navigator, 'clipboard')
    Reflect.deleteProperty(navigator, 'share')
    Reflect.deleteProperty(navigator, 'canShare')
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
  })

  describe('① 장부가 없을 때', () => {
    it('AC-25 user agent 에 KAKAOTALK 이 있는 안드로이드에서 장부 없이 열면 첫 실행 물음보다 먼저 "카톡 안에서 열렸어요" 가 뜬다', () => {
      renderRoot({ inApp: kakao().inApp })

      const view = within(inAppScreen() ?? document.body)
      expect(view.getByRole('heading', { level: 1, name: '카톡 안에서 열렸어요' })).toBeInTheDocument()
      expect(view.getByText('여기서 적으면 나중에 홈 화면 앱에서 안 보여요. 인터넷 앱에서 열어 주세요.')).toBeInTheDocument()
      expect(view.getByRole('link', { name: '인터넷 앱으로 열기' })).toBeInTheDocument()
      expect(view.getByText("안 열리면 오른쪽 아래 ⋮ → '다른 브라우저로 열기'")).toBeInTheDocument()
      expect(view.getByRole('button', { name: '그냥 여기서 쓸게요' })).toBeInTheDocument()
      expect(screen.queryByTestId('first-run-question')).not.toBeInTheDocument()
    })

    it('메뉴 그림은 오른쪽 아래 ⋮ 와 글 줄의 메뉴 이름을 누를 곳으로 그린다 (그림은 화면 읽기에서 숨김)', () => {
      renderRoot({ inApp: kakao().inApp })

      const picture = screen.getByTestId('browser-picture')
      expect(picture).toHaveAttribute('aria-hidden', 'true')
      expect(picture).toHaveAttribute('data-picture', 'kakao-android-menu')
      const hot = [...picture.querySelectorAll('[data-hot]')]
      expect(hot.map((item) => item.textContent)).toContain('다른 브라우저로 열기')
      expect(picture.querySelector('[data-hot] [data-icon="kebab"]')).not.toBeNull()
    })

    it('AC-26 [인터넷 앱으로 열기] 는 kakaotalk://web/openExternal?url= 뒤에 지금 주소를 인코딩해 붙인 곳으로 간다', () => {
      renderRoot({ inApp: kakao().inApp })

      expect(openLink('인터넷 앱으로 열기')).toHaveAttribute(
        'href',
        `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`,
      )
    })

    it('AC-27 [그냥 여기서 쓸게요] 를 누르면 표시를 남기고 첫 실행 물음으로 간다. 다시 열어도 그 화면이 뜨지 않는다', async () => {
      const { inApp, store } = kakao()
      const { unmount } = renderRoot({ inApp })

      await userEvent.click(screen.getByRole('button', { name: '그냥 여기서 쓸게요' }))

      expect(store.stay).toHaveBeenCalledOnce()
      expect(screen.getByTestId('first-run-question')).toBeInTheDocument()
      unmount()
      renderRoot({ inApp })
      expect(inAppScreen()).not.toBeInTheDocument()
      expect(screen.getByTestId('first-run-question')).toBeInTheDocument()
    })

    it('AC-27·28 표시가 있는 카톡 안에서 장부를 만들면 권하기 카드가 없고, 설정 "앱" 묶음에 [홈 화면에 추가] 대신 [인터넷 앱으로 열기] 가 있다', async () => {
      const offers = memoryOfferStore()
      renderRoot({ inApp: kakao('kakao-android', true).inApp, installOfferStore: offers })

      await userEvent.click(screen.getByRole('button', { name: '바로 시작' }))
      await userEvent.click(screen.getByRole('button', { name: '동아리·모임' }))
      await userEvent.type(screen.getByLabelText('장부 이름'), '한랑드림')
      await userEvent.click(screen.getByRole('button', { name: '만들기' }))
      await screen.findByTestId('ledger-screen')

      expect(screen.queryByTestId('install-offer')).not.toBeInTheDocument()
      expect(offers.saved).toBeUndefined()
      await userEvent.click(screen.getByRole('button', { name: /^설정/ }))
      const app = within(screen.getByTestId('settings-block-app'))
      expect(app.getByRole('button', { name: /인터넷 앱으로 열기/ })).toHaveTextContent('홈 화면에 추가하려면')
      expect(app.queryByRole('button', { name: /^홈 화면에 추가/ })).not.toBeInTheDocument()
    })

    it('카톡 밖이면 지금처럼 첫 실행 물음이 먼저다', () => {
      renderRoot({ userAgent: CHROME_UA })

      expect(inAppScreen()).not.toBeInTheDocument()
      expect(screen.getByTestId('first-run-question')).toBeInTheDocument()
    })
  })

  describe('② 이미 여기서 장부를 쓰고 있었을 때', () => {
    it('AC-29 자동으로 지키기를 쓸 수 있으면 복구 코드가 보이고, 보관이 끝나기 전에는 주 버튼을 누를 수 없으며 끝나면 "방금 자동으로 지켜 두었어요" 와 함께 눌린다', async () => {
      let finish: (result: KeepPutResult) => void = () => {}
      const server = fakeServer(() => new Promise((resolve) => (finish = resolve)))
      renderRoot({ data: phoneData(), inApp: kakao().inApp, keep: keepWith(server) })

      const view = within(inAppScreen() ?? document.body)
      expect(view.getByText('여기에 쓰던 장부가 있어요. 인터넷 앱으로 옮겨서 쓰면 홈 화면에도 추가할 수 있어요.')).toBeInTheDocument()
      expect(view.getByTestId('in-app-code')).toHaveTextContent(PHONE_CODE)
      expect(view.getByRole('status')).toHaveTextContent('지켜 두는 중이에요')
      expect(view.getByRole('button', { name: '코드 복사하고 인터넷 앱으로 열기' })).toBeDisabled()
      expect(screen.queryByTestId('ledger-screen')).not.toBeInTheDocument()

      await vi.waitFor(() => expect(server.put).toHaveBeenCalledOnce())
      await act(async () => finish('ok'))

      expect(await view.findByText('방금 자동으로 지켜 두었어요')).toBeInTheDocument()
      expect(view.getByRole('link', { name: '코드 복사하고 인터넷 앱으로 열기' })).toBeInTheDocument()
    })

    it('올리지 못하면 "인터넷에 연결되면 지켜 두고 버튼이 눌려요" 이고, 연결이 돌아오면(online) 다시 올린다', async () => {
      const answers: KeepPutResult[] = ['failed', 'ok']
      const server = fakeServer(async () => answers.shift() ?? 'ok')
      renderRoot({ data: phoneData(), inApp: kakao().inApp, keep: keepWith(server) })

      expect(await screen.findByText('인터넷에 연결되면 지켜 두고 버튼이 눌려요')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '코드 복사하고 인터넷 앱으로 열기' })).toBeDisabled()

      act(() => {
        window.dispatchEvent(new Event('online'))
      })

      expect(await screen.findByText('방금 자동으로 지켜 두었어요')).toBeInTheDocument()
      expect(server.put).toHaveBeenCalledTimes(2)
    })

    it('AC-30 주 버튼을 누르면 클립보드에 복구 코드를 쓰고 ?from=kakao 를 붙인 주소로 openExternal 을 연다. 그 주소에 복구 코드는 없다', async () => {
      const writeText = vi.fn(async () => {})
      stubClipboard({ writeText })
      renderRoot({ data: phoneData(), inApp: kakao().inApp, keep: keepWith(fakeServer()) })
      await screen.findByText('방금 자동으로 지켜 두었어요')

      const link = openLink('코드 복사하고 인터넷 앱으로 열기')
      const href = link.getAttribute('href') ?? ''
      await userEvent.click(link)

      expect(writeText).toHaveBeenCalledWith(PHONE_CODE)
      expect(href.startsWith('kakaotalk://web/openExternal?url=')).toBe(true)
      const opened = new URL(decodeURIComponent(href.slice('kakaotalk://web/openExternal?url='.length)))
      expect(opened.searchParams.get('from')).toBe('kakao')
      expect(href).not.toContain(PHONE_CODE)
      expect(decodeURIComponent(href)).not.toContain(PHONE_CODE)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('AC-30 복사가 실패하면 "복사하지 못했어요. 코드를 적어 두세요" 를 보이고 코드는 그대로 크게 보인다', async () => {
      stubClipboard({
        writeText: vi.fn(async () => {
          throw new DOMException('denied', 'NotAllowedError')
        }),
      })
      renderRoot({ data: phoneData(), inApp: kakao().inApp, keep: keepWith(fakeServer()) })
      await screen.findByText('방금 자동으로 지켜 두었어요')

      await userEvent.click(openLink('코드 복사하고 인터넷 앱으로 열기'))

      expect(await screen.findByRole('alert')).toHaveTextContent('복사하지 못했어요. 코드를 적어 두세요')
      expect(screen.getByTestId('in-app-code')).toHaveTextContent(PHONE_CODE)
    })

    it('화면이 떠 있는 동안 주소에 ?from=kakao 를 붙여(메뉴로 열어도 가져오기 카드가 뜨게) 두고, [그냥 여기서 쓸게요] 로 장부에 가면 지운다', async () => {
      const { inApp, store } = kakao()
      renderRoot({ data: phoneData(), inApp, keep: keepWith(fakeServer()) })
      await screen.findByText('방금 자동으로 지켜 두었어요')
      expect(new URL(window.location.href).searchParams.get('from')).toBe('kakao')

      await userEvent.click(screen.getByRole('button', { name: '그냥 여기서 쓸게요' }))

      expect(store.stay).toHaveBeenCalledOnce()
      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
      expect(new URL(window.location.href).searchParams.get('from')).toBeNull()
    })

    it('AC-31 자동으로 지키기를 쓸 수 없으면 [기록 파일 보내기] → [인터넷 앱으로 열기](from 없이) 순서다', async () => {
      const share = vi.fn(async () => {})
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
      Object.defineProperty(navigator, 'share', { value: share, configurable: true })
      renderRoot({ data: phoneData(), inApp: kakao().inApp })

      const view = within(inAppScreen() ?? document.body)
      expect(view.getByText('기록 파일을 먼저 보내 두고, 인터넷 앱에서 불러와요.')).toBeInTheDocument()
      expect(view.getByText('열린 곳에서 [바로 시작] → 위쪽 [기록 파일 불러오기]')).toBeInTheDocument()
      expect(view.queryByRole('link', { name: '인터넷 앱으로 열기' })).not.toBeInTheDocument()

      await userEvent.click(view.getByRole('button', { name: '기록 파일 보내기' }))

      expect(share).toHaveBeenCalledOnce()
      const link = await view.findByRole('link', { name: '인터넷 앱으로 열기' })
      expect(decodeURIComponent(link.getAttribute('href') ?? '')).not.toContain('from=')
      expect(view.queryByRole('button', { name: '기록 파일 보내기' })).not.toBeInTheDocument()
    })

    it('자동으로 지키기가 꺼져 있어도 기록 파일 순서다', () => {
      const server = fakeServer()
      renderRoot({ data: phoneData(), inApp: kakao().inApp, keep: keepWith(server, { enabled: false }) })

      expect(screen.getByRole('button', { name: '기록 파일 보내기' })).toBeInTheDocument()
      expect(screen.queryByTestId('in-app-code')).not.toBeInTheDocument()
      expect(server.put).not.toHaveBeenCalled()
    })

    it('AC-27 [그냥 여기서 쓸게요] 뒤 설정 [인터넷 앱으로 열기] 는 설정 위 화면으로 ② 를 열고, [‹ 설정]·[그냥 여기서 쓸게요] 는 설정으로 돌아온다', async () => {
      renderRoot({ data: phoneData(), inApp: kakao('kakao-android', true).inApp, keep: keepWith(fakeServer()) })
      expect(inAppScreen()).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /^설정/ }))

      await userEvent.click(screen.getByRole('button', { name: /인터넷 앱으로 열기/ }))
      expect(within(inAppScreen() ?? document.body).getByTestId('in-app-code')).toHaveTextContent(PHONE_CODE)
      await userEvent.click(screen.getByRole('button', { name: '설정' }))
      expect(await screen.findByTestId('settings-screen')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /인터넷 앱으로 열기/ }))
      await userEvent.click(screen.getByRole('button', { name: '그냥 여기서 쓸게요' }))
      expect(await screen.findByTestId('settings-screen')).toBeInTheDocument()
    })
  })

  describe('③ 인터넷 앱에서 열린 첫 화면 (?from=kakao)', () => {
    it('AC-32 카톡 밖에서 from=kakao 로 장부 없이 열면 물음 위에 가져오기 카드가 있고, 그 카드가 주 버튼이라 [연습해 보기] 는 보조 모양이다', () => {
      renderRoot({ userAgent: CHROME_UA, fromKakao: true, keep: keepWith(fakeServer()) })

      const card = within(screen.getByTestId('in-app-import'))
      expect(card.getByRole('heading', { name: '카톡에서 쓰던 장부가 있나요?' })).toBeInTheDocument()
      expect(card.getByText('방금 복사한 복구 코드로 그대로 가져와요.')).toBeInTheDocument()
      expect(card.getByRole('button', { name: '카톡에서 쓰던 장부 가져오기' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '연습해 보기' })).toHaveAttribute('data-variant', 'secondary')
    })

    it('AC-32 누르면 복구 코드로 불러오기가 열리고 클립보드의 16자 코드가 칸에 들어가 있다. 뒤로 버튼은 물음으로 돌아온다', async () => {
      stubClipboard({ readText: vi.fn(async () => PHONE_CODE) })
      renderRoot({ userAgent: CHROME_UA, fromKakao: true, keep: keepWith(fakeServer()) })

      await userEvent.click(screen.getByRole('button', { name: '카톡에서 쓰던 장부 가져오기' }))

      expect(await screen.findByTestId('keep-restore-screen')).toBeInTheDocument()
      expect(screen.getByLabelText('복구 코드를 넣어 주세요')).toHaveValue(PHONE_CODE)
      expect(screen.queryByText('길게 눌러 붙여 넣어 주세요')).not.toBeInTheDocument()

      act(() => window.history.back())
      expect(await screen.findByTestId('first-run-question')).toBeInTheDocument()
    })

    it('AC-32 클립보드를 읽지 못하면 빈 칸에 "길게 눌러 붙여 넣어 주세요" 를 한 줄 더한다', async () => {
      stubClipboard({
        readText: vi.fn(async () => {
          throw new DOMException('denied', 'NotAllowedError')
        }),
      })
      renderRoot({ userAgent: CHROME_UA, fromKakao: true, keep: keepWith(fakeServer()) })

      await userEvent.click(screen.getByRole('button', { name: '카톡에서 쓰던 장부 가져오기' }))

      expect(await screen.findByLabelText('복구 코드를 넣어 주세요')).toHaveValue('')
      expect(screen.getByText('길게 눌러 붙여 넣어 주세요')).toBeInTheDocument()
    })

    it('불러오기를 마치면 그 장부가 열린다', async () => {
      const kept: StoredData = { ...phoneData(), settings: { recoveryCode: PHONE_CODE } }
      const envelope = await sealKeep(PHONE_CODE, createBackup(kept, TODAY).text, TODAY.toISOString())
      const id = await keepIdOf(PHONE_CODE)
      const server = fakeServer()
      server.get.mockImplementation(async (asked) => (asked === id ? { status: 'found', envelope } : { status: 'not-found' }))
      stubClipboard({ readText: vi.fn(async () => PHONE_CODE) })
      renderRoot({ userAgent: CHROME_UA, fromKakao: true, keep: keepWith(server) })

      await userEvent.click(screen.getByRole('button', { name: '카톡에서 쓰던 장부 가져오기' }))
      await userEvent.click(await screen.findByRole('button', { name: '불러오기' }))
      await userEvent.click(await screen.findByRole('button', { name: '바꾸기' }))

      expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByText('대관료')).toBeInTheDocument()
    })

    it('AC-32 이 브라우저에 장부가 있으면 카드 없이 장부를 연다', () => {
      renderRoot({ data: phoneData(), userAgent: CHROME_UA, fromKakao: true, keep: keepWith(fakeServer()) })

      expect(screen.queryByTestId('in-app-import')).not.toBeInTheDocument()
      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    })

    it('카톡 안이면 from=kakao 가 있어도 카드가 없다 (카톡에서 다시 연 경우)', async () => {
      renderRoot({ inApp: kakao('kakao-android', true).inApp, fromKakao: true, keep: keepWith(fakeServer()) })

      expect(screen.queryByTestId('in-app-import')).not.toBeInTheDocument()
      expect(screen.getByTestId('first-run-question')).toBeInTheDocument()
    })
  })

  describe('아이폰 카톡', () => {
    it("AC-33 아이폰 카톡에서는 주 버튼 없이 메뉴 그림 안내(오른쪽 아래 ⋯ → 'Safari로 열기')만 보인다", () => {
      renderRoot({ inApp: kakao('kakao-ios').inApp })

      const view = within(inAppScreen() ?? document.body)
      expect(view.queryByRole('link')).not.toBeInTheDocument()
      expect(view.queryAllByTestId('button')).toHaveLength(0)
      expect(view.getByText("오른쪽 아래 ⋯ → 'Safari로 열기'")).toBeInTheDocument()
      expect(screen.getByTestId('browser-picture')).toHaveAttribute('data-picture', 'kakao-ios-menu')
      expect(view.getByRole('button', { name: '그냥 여기서 쓸게요' })).toBeInTheDocument()
    })

    it('아이폰 카톡 ② 는 [코드 복사하기] 만 (다른 앱으로 여는 주 버튼 없음)', async () => {
      const writeText = vi.fn(async () => {})
      stubClipboard({ writeText })
      renderRoot({ data: phoneData(), inApp: kakao('kakao-ios').inApp, keep: keepWith(fakeServer()) })
      await screen.findByText('방금 자동으로 지켜 두었어요')

      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      const copy = screen.getByRole('button', { name: '코드 복사하기' })
      expect(copy).toHaveAttribute('data-variant', 'secondary')
      await userEvent.click(copy)

      expect(writeText).toHaveBeenCalledWith(PHONE_CODE)
      expect(await screen.findByText('복사했어요')).toBeInTheDocument()
    })
  })
})
