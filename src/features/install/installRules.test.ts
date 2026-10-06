import { describe, expect, it } from 'vitest'
import {
  browserKind,
  INSTALL_BANNER_DISMISSED_KEY,
  readDismissedAt,
  saveDismissedAt,
  shouldShowInstallBanner,
} from './installRules'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-06T09:00:00.000+09:00').getTime()

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

describe('SPEC-002 설치 안내 띠 표시 조건', () => {
  it('홈 화면에 추가하지 않은 상태로 열면 보인다', () => {
    expect(shouldShowInstallBanner({ standalone: false, dismissedAt: null, now: NOW })).toBe(true)
  })

  it('홈 화면에 추가한 앱(standalone)으로 열면 보이지 않는다', () => {
    expect(shouldShowInstallBanner({ standalone: true, dismissedAt: null, now: NOW })).toBe(false)
  })

  it('닫은 지 30일이 안 됐으면 보이지 않는다', () => {
    expect(shouldShowInstallBanner({ standalone: false, dismissedAt: NOW - 29 * DAY, now: NOW })).toBe(false)
  })

  it('닫은 지 30일이 지나면 다시 보인다', () => {
    expect(shouldShowInstallBanner({ standalone: false, dismissedAt: NOW - 30 * DAY, now: NOW })).toBe(true)
  })
})

describe('SPEC-002 설치 안내 띠 닫은 시각 기억', () => {
  it('닫은 시각을 기기에 적고 다시 읽는다', () => {
    const storage = memoryStorage()

    saveDismissedAt(storage, NOW)

    expect(storage.items.get(INSTALL_BANNER_DISMISSED_KEY)).toBe(String(NOW))
    expect(readDismissedAt(storage)).toBe(NOW)
  })

  it('적힌 값이 없거나 숫자가 아니면 닫은 적 없는 것으로 본다', () => {
    expect(readDismissedAt(memoryStorage())).toBeNull()
    expect(readDismissedAt(memoryStorage({ [INSTALL_BANNER_DISMISSED_KEY]: '어제' }))).toBeNull()
  })

  it('기기 저장소를 쓸 수 없어도 오류 없이 넘어간다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }

    expect(readDismissedAt(broken)).toBeNull()
    expect(() => saveDismissedAt(broken, NOW)).not.toThrow()
  })
})

describe('SPEC-002 방법 보기 브라우저 구분', () => {
  it('삼성 인터넷과 크롬과 그 밖의 브라우저를 구분한다', () => {
    expect(
      browserKind(
        'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('samsung')
    expect(
      browserKind(
        'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('chrome')
    expect(browserKind('Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0')).toBe('other')
  })
})
