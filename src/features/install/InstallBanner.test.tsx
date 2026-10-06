import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallBanner } from './InstallBanner'
import { createInstallPromptStore } from './installPrompt'
import { INSTALL_BANNER_DISMISSED_KEY } from './installRules'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-06T09:00:00.000+09:00').getTime()
const SAMSUNG_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36'
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
    items,
  }
}

type RenderOptions = {
  standalone?: boolean
  storage?: ReturnType<typeof memoryStorage>
  userAgent?: string
  now?: number
}

// 테스트마다 따로 듣는 곳을 두어 앞 테스트의 설치 제안·설치 완료가 섞이지 않게 한다
let browserEvents = new EventTarget()

function renderBanner({ standalone = false, storage = memoryStorage(), userAgent = CHROME_UA, now = NOW }: RenderOptions = {}) {
  browserEvents = new EventTarget()
  render(
    <InstallBanner
      standalone={standalone}
      storage={storage}
      userAgent={userAgent}
      now={() => now}
      installPrompt={createInstallPromptStore(browserEvents)}
    />,
  )
  return storage
}

// 크롬·삼성 인터넷이 설치할 수 있을 때 보내는 이벤트를 흉내 낸다
function fireInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn(async () => {})
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  })
  act(() => {
    browserEvents.dispatchEvent(event)
  })
  return { prompt, event }
}

const banner = () => screen.queryByTestId('install-banner')

describe('SPEC-002 설치 안내 띠', () => {
  it('홈 화면에 추가하지 않은 상태로 열면 안내 문구와 [방법 보기] [닫기] 를 보인다', () => {
    renderBanner()

    expect(banner()).toHaveTextContent('홈 화면에 추가하면 기록이 더 안전해요')
    expect(screen.getByRole('button', { name: '방법 보기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument()
  })

  it('홈 화면에 추가한 앱으로 열면 보이지 않는다', () => {
    renderBanner({ standalone: true })

    expect(banner()).not.toBeInTheDocument()
  })

  it('[닫기] 를 누르면 사라지고 닫은 시각을 기억해 30일 동안 다시 보이지 않는다', async () => {
    const storage = renderBanner()

    await userEvent.click(screen.getByRole('button', { name: '닫기' }))

    expect(banner()).not.toBeInTheDocument()
    expect(storage.items.get(INSTALL_BANNER_DISMISSED_KEY)).toBe(String(NOW))
  })

  it('닫은 지 30일이 안 됐으면 보이지 않고, 지나면 다시 보인다', () => {
    const storage = memoryStorage({ [INSTALL_BANNER_DISMISSED_KEY]: String(NOW) })

    renderBanner({ storage, now: NOW + 29 * DAY })
    expect(banner()).not.toBeInTheDocument()

    renderBanner({ storage, now: NOW + 30 * DAY })
    expect(banner()).toBeInTheDocument()
  })

  describe('방법 보기', () => {
    it('삼성 인터넷이면 아래 메뉴에서 홈 화면에 추가하는 방법을 큰 글씨 순서로 보인다', async () => {
      renderBanner({ userAgent: SAMSUNG_UA })

      await userEvent.click(screen.getByRole('button', { name: '방법 보기' }))

      const guide = screen.getByTestId('install-guide')
      expect(guide).toHaveAttribute('data-browser', 'samsung')
      expect(guide).toHaveTextContent('화면 아래 오른쪽 [≡] 메뉴')
      expect(guide).toHaveTextContent('[현재 페이지 추가]')
      expect(guide).not.toHaveTextContent('[⋮]')
      expect(screen.getByRole('button', { name: '방법 접기' })).toHaveAttribute('aria-expanded', 'true')
    })

    it('크롬이면 위쪽 메뉴에서 홈 화면에 추가하는 방법을 보인다', async () => {
      renderBanner({ userAgent: CHROME_UA })

      await userEvent.click(screen.getByRole('button', { name: '방법 보기' }))

      const guide = screen.getByTestId('install-guide')
      expect(guide).toHaveAttribute('data-browser', 'chrome')
      expect(guide).toHaveTextContent('화면 위 오른쪽 [⋮] 메뉴')
      expect(guide).not.toHaveTextContent('[≡]')
    })

    it('그 밖의 브라우저면 삼성 인터넷과 크롬 방법을 둘 다 보인다', async () => {
      renderBanner({ userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0' })

      await userEvent.click(screen.getByRole('button', { name: '방법 보기' }))

      const guide = screen.getByTestId('install-guide')
      expect(guide).toHaveTextContent('[≡]')
      expect(guide).toHaveTextContent('[⋮]')
    })

    it('[방법 접기] 를 누르면 안내를 접는다', async () => {
      renderBanner()

      await userEvent.click(screen.getByRole('button', { name: '방법 보기' }))
      await userEvent.click(screen.getByRole('button', { name: '방법 접기' }))

      expect(screen.queryByTestId('install-guide')).not.toBeInTheDocument()
    })
  })

  describe('바로 설치 (브라우저가 설치를 제안할 때)', () => {
    it('설치 제안을 받으면 [방법 보기] 대신 [홈 화면에 추가] 를 보이고 브라우저 기본 띠는 막는다', () => {
      renderBanner()

      const { event } = fireInstallPrompt()

      expect(event.defaultPrevented).toBe(true)
      expect(screen.getByRole('button', { name: '홈 화면에 추가' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '방법 보기' })).not.toBeInTheDocument()
    })

    it('[홈 화면에 추가] 를 누르면 브라우저 설치 창을 열고, 설치하면 안내 띠를 감춘다', async () => {
      renderBanner()
      const { prompt } = fireInstallPrompt('accepted')

      await userEvent.click(screen.getByRole('button', { name: '홈 화면에 추가' }))

      expect(prompt).toHaveBeenCalledTimes(1)
      expect(banner()).not.toBeInTheDocument()
    })

    it('설치 창에서 취소하면 다시 [방법 보기] 로 돌아간다 (설치 제안은 한 번만 쓸 수 있다)', async () => {
      renderBanner()
      fireInstallPrompt('dismissed')

      await userEvent.click(screen.getByRole('button', { name: '홈 화면에 추가' }))

      expect(banner()).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '방법 보기' })).toBeInTheDocument()
    })

    it('다른 화면에 다녀와 띠를 다시 그려도 받아 둔 설치 제안을 잃지 않는다', () => {
      const events = new EventTarget()
      const installPrompt = createInstallPromptStore(events)
      const element = <InstallBanner standalone={false} storage={memoryStorage()} now={() => NOW} installPrompt={installPrompt} />
      const { unmount } = render(element)
      act(() => {
        events.dispatchEvent(
          Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
            prompt: async () => {},
            userChoice: Promise.resolve({ outcome: 'accepted' }),
          }),
        )
      })

      unmount()
      render(element)

      expect(screen.getByRole('button', { name: '홈 화면에 추가' })).toBeInTheDocument()
    })

    it('다른 경로로 설치가 끝나면(appinstalled) 안내 띠를 감춘다', () => {
      renderBanner()

      act(() => {
        browserEvents.dispatchEvent(new Event('appinstalled'))
      })

      expect(banner()).not.toBeInTheDocument()
    })
  })
})
