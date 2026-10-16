import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstallPromptStore } from '../features/install/installPrompt'
import { DevEnvScreen } from './DevEnvScreen'
import type { DevEnvironment } from './devEnvironment'
import { sessionCheckLog } from './envChecks'

const KAKAO_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410550'
const HREF = 'https://uri-jangbu-preview.pages.dev/?from=kakao#/dev/env'

// sessionStorage 대신 메모리 (다시 그려도 같은 곳을 읽는다)
function memoryStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

function fakeEnvironment(overrides: Partial<DevEnvironment> = {}) {
  const events = new EventTarget()
  const clipboard = {
    writeText: vi.fn(async (text: string) => void text),
    readText: vi.fn(async () => '붙여 넣은 글'),
  }
  const env: DevEnvironment = {
    href: HREF,
    origin: 'https://uri-jangbu-preview.pages.dev',
    userAgent: KAKAO_UA,
    standalone: false,
    versionLabel: '2.6.0 · 미리보기 abc1234',
    events,
    installPrompt: createInstallPromptStore(events),
    clipboard,
    share: undefined,
    canShare: undefined,
    persisted: async () => false,
    log: sessionCheckLog(memoryStorage()),
    now: () => new Date(2026, 9, 16, 10, 0, 1),
    ...overrides,
  }
  return { env, events, clipboard }
}

// 크롬·삼성 인터넷이 설치할 수 있을 때 보내는 이벤트를 흉내 낸다
function installPromptEvent(outcome: 'accepted' | 'dismissed') {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  })
}

function factValue(label: string): string {
  const term = screen.getByText(label, { selector: 'dt' })
  return term.nextElementSibling?.textContent ?? ''
}

function logLines(): string[] {
  return within(screen.getByRole('list', { name: '결과 기록' }))
    .queryAllByRole('listitem')
    .map((item) => item.textContent ?? '')
}

describe('SPEC-009 개발 확인 화면 (AC-36)', () => {
  it('user agent·카톡 판단·standalone·beforeinstallprompt·appinstalled 받음 여부를 보여 준다', async () => {
    const { env } = fakeEnvironment()
    render(<DevEnvScreen env={env} />)

    expect(screen.getByRole('heading', { level: 1, name: '개발 확인 화면' })).toBeInTheDocument()
    expect(factValue('user agent')).toBe(KAKAO_UA)
    expect(factValue('카톡 안 (KAKAOTALK 포함)')).toBe('예')
    expect(factValue('기기')).toBe('안드로이드')
    expect(factValue('홈 화면 앱 (display-mode: standalone)')).toBe('아니오')
    expect(factValue('들어온 길 (?from)')).toBe('kakao')
    expect(factValue('beforeinstallprompt')).toBe('안 받음')
    expect(factValue('appinstalled')).toBe('안 받음')
    expect(factValue('navigator.share')).toBe('없음')
    expect(factValue('canShare(파일)')).toBe('canShare 없음')
    expect(factValue('앱 버전')).toBe('2.6.0 · 미리보기 abc1234')
    expect(await screen.findByText('아니오', { selector: '[data-fact="persisted"]' })).toBeInTheDocument()
  })

  it('beforeinstallprompt 를 받으면 받은 시각과 [설치 창 띄우기] 가 보이고, 누르면 userChoice 결과를 기록한다', async () => {
    const { env, events } = fakeEnvironment()
    render(<DevEnvScreen env={env} />)
    expect(screen.queryByRole('button', { name: '설치 창 띄우기' })).not.toBeInTheDocument()

    act(() => {
      events.dispatchEvent(installPromptEvent('dismissed'))
    })

    expect(factValue('beforeinstallprompt')).toBe('받음 10:00:01')
    await userEvent.click(screen.getByRole('button', { name: '설치 창 띄우기' }))

    expect(logLines()).toContain('10:00:01 beforeinstallprompt 받음')
    expect(await screen.findByText('10:00:01 설치 창 결과 성공 — dismissed')).toBeInTheDocument()
  })

  it('화면을 열기 전에 받은 설치 제안도 받음으로 보인다', () => {
    const { env, events } = fakeEnvironment()
    events.dispatchEvent(installPromptEvent('accepted'))
    render(<DevEnvScreen env={env} />)

    expect(factValue('beforeinstallprompt')).toBe('받음 (화면 열기 전)')
    expect(screen.getByRole('button', { name: '설치 창 띄우기' })).toBeInTheDocument()
  })

  it('appinstalled 를 받으면 받은 시각을 보여 주고 기록한다', () => {
    const { env, events } = fakeEnvironment()
    render(<DevEnvScreen env={env} />)

    act(() => {
      events.dispatchEvent(new Event('appinstalled'))
    })

    expect(factValue('appinstalled')).toBe('받음 10:00:01')
    expect(logLines()).toContain('10:00:01 appinstalled 받음')
  })

  it('[복사 시험]·[붙여넣기 시험] 의 성공과 오류 이름을 시각과 함께 기록 목록에 남긴다', async () => {
    const { env, clipboard } = fakeEnvironment()
    clipboard.readText.mockRejectedValueOnce(new DOMException('Read permission denied.', 'NotAllowedError'))
    render(<DevEnvScreen env={env} />)

    await userEvent.click(screen.getByRole('button', { name: '복사 시험' }))
    await userEvent.click(screen.getByRole('button', { name: '붙여넣기 시험' }))
    await userEvent.click(screen.getByRole('button', { name: '붙여넣기 시험' }))

    expect(clipboard.writeText).toHaveBeenCalledWith('우리 장부 복사 시험 10:00:01')
    expect(logLines()).toEqual([
      '10:00:01 복사 시험 성공',
      '10:00:01 붙여넣기 시험 실패 — NotAllowedError: Read permission denied.',
      '10:00:01 붙여넣기 시험 성공 — 읽음 "붙여 넣은 글"',
    ])
  })

  it('클립보드가 없는 브라우저면 없다고 기록한다', async () => {
    const { env } = fakeEnvironment({ clipboard: undefined })
    render(<DevEnvScreen env={env} />)

    await userEvent.click(screen.getByRole('button', { name: '복사 시험' }))

    expect(logLines()).toEqual(['10:00:01 복사 시험 실패 — navigator.clipboard 없음'])
  })

  it('openExternal·크롬 intent 링크가 지금 주소로 열리고, 누르면 기록한다', async () => {
    const { env } = fakeEnvironment()
    render(<DevEnvScreen env={env} />)

    expect(screen.getByRole('link', { name: 'kakaotalk openExternal 로 열기' })).toHaveAttribute(
      'href',
      `kakaotalk://web/openExternal?url=${encodeURIComponent('https://uri-jangbu-preview.pages.dev/?from=kakao#/dev/env')}`,
    )
    expect(screen.getByRole('link', { name: '크롬 intent 로 열기' })).toHaveAttribute(
      'href',
      'intent://uri-jangbu-preview.pages.dev/?from=intent&dev=env#Intent;scheme=https;package=com.android.chrome;end',
    )

    // jsdom 은 다른 앱 주소로 넘어가지 않는다. 누름만 기록되는지 본다
    await userEvent.click(screen.getByRole('link', { name: 'kakaotalk openExternal 로 열기' }))
    expect(logLines()).toEqual(['10:00:01 openExternal 링크 누름'])
  })

  it('기록은 sessionStorage 에 남아 새로고침(다시 그리기)해도 보인다', async () => {
    const storage = memoryStorage()
    const first = fakeEnvironment({ log: sessionCheckLog(storage) })
    const { unmount } = render(<DevEnvScreen env={first.env} />)
    await userEvent.click(screen.getByRole('button', { name: '복사 시험' }))
    unmount()

    render(<DevEnvScreen env={fakeEnvironment({ log: sessionCheckLog(storage) }).env} />)

    expect(logLines()).toEqual(['10:00:01 복사 시험 성공'])
  })

  it('[결과 복사] 는 화면 값과 기록을 글로 묶어 클립보드에 쓰고, 고를 수 있는 글 상자에도 같은 글이 있다', async () => {
    const { env, clipboard } = fakeEnvironment()
    render(<DevEnvScreen env={env} />)
    await userEvent.click(screen.getByRole('button', { name: '복사 시험' }))

    await userEvent.click(screen.getByRole('button', { name: '결과 복사' }))

    const copied = clipboard.writeText.mock.calls.at(-1)?.[0] ?? ''
    expect(copied).toContain(`user agent: ${KAKAO_UA}`)
    expect(copied).toContain('카톡 안 (KAKAOTALK 포함): 예')
    expect(copied).toContain('10:00:01 복사 시험 성공')
    // 글 상자는 복사가 안 되는 곳(카톡 안 등)에서 길게 눌러 고른다. [결과 복사] 를 누른 기록까지 들어 있다
    const box = screen.getByRole('textbox', { name: '결과 글' })
    expect(box).toHaveValue(`${copied}\n10:00:01 결과 복사 성공`)
  })

  it('공유 창이 있으면 [결과 보내기] 로 결과 글을 보낸다', async () => {
    const share = vi.fn(async (data: ShareData) => void data)
    const { env } = fakeEnvironment({ share, canShare: () => true })
    render(<DevEnvScreen env={env} />)
    expect(factValue('navigator.share')).toBe('있음')
    expect(factValue('canShare(파일)')).toBe('예')

    await userEvent.click(screen.getByRole('button', { name: '결과 보내기' }))

    expect(share.mock.calls[0]?.[0].text).toContain(`user agent: ${KAKAO_UA}`)
  })

  describe('localStorage 는 쓰지 않는다', () => {
    beforeEach(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('시험을 돌려도 localStorage 를 읽지도 쓰지도 않는다', async () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem')
      const setItem = vi.spyOn(Storage.prototype, 'setItem')
      const { env } = fakeEnvironment({ log: sessionCheckLog(sessionStorage) })
      render(<DevEnvScreen env={env} />)

      await userEvent.click(screen.getByRole('button', { name: '복사 시험' }))
      await userEvent.click(screen.getByRole('button', { name: '결과 복사' }))

      expect(setItem.mock.contexts).toContain(sessionStorage)
      expect(getItem.mock.contexts).not.toContain(localStorage)
      expect(setItem.mock.contexts).not.toContain(localStorage)
      expect(localStorage.length).toBe(0)
    })
  })
})
