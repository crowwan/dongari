import { describe, expect, it, vi } from 'vitest'
import {
  IN_APP_KEY,
  IN_APP_WORDS,
  copyRecoveryCode,
  inAppKind,
  localInAppStore,
  openExternalUrl,
  readClipboardCode,
  readFromKakao,
  withFromKakao,
} from './inAppBrowser'

const KAKAO_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410520'
const KAKAO_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0'
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'

// 기기의 localStorage 대신 쓰는 메모리 저장소
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('SPEC-009 C 카톡 안 브라우저 판단 (inAppKind)', () => {
  it('user agent 에 KAKAOTALK 이 있는 안드로이드는 카톡 안(안드로이드)으로 본다', () => {
    expect(inAppKind(KAKAO_ANDROID)).toBe('kakao-android')
  })

  it('user agent 에 KAKAOTALK 이 있는 아이폰은 카톡 안(아이폰)으로 본다', () => {
    expect(inAppKind(KAKAO_IOS)).toBe('kakao-ios')
  })

  it('KAKAOTALK 이 없으면 카톡 안이 아니다 (크롬·삼성 인터넷은 지금처럼)', () => {
    expect(inAppKind(CHROME_ANDROID)).toBeUndefined()
    expect(inAppKind('')).toBeUndefined()
  })
})

describe('SPEC-009 C openExternal 주소 (AC-26·AC-30)', () => {
  it('[인터넷 앱으로 열기] 는 kakaotalk://web/openExternal?url= 뒤에 지금 주소를 인코딩해 붙인다', () => {
    const href = 'https://crowwan.github.io/dongari/'
    expect(openExternalUrl(href, { fromKakao: false })).toBe(
      `kakaotalk://web/openExternal?url=${encodeURIComponent('https://crowwan.github.io/dongari/')}`,
    )
  })

  it('장부를 옮길 때는 ?from=kakao 를 붙이고, 해시는 그대로 둔다', () => {
    const url = openExternalUrl('https://uri-jangbu-preview.pages.dev/#/x', { fromKakao: true })
    expect(url).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent('https://uri-jangbu-preview.pages.dev/?from=kakao#/x')}`)
  })

  it('주소에 남은 from 은 지우고 다시 정한다', () => {
    const url = openExternalUrl('https://crowwan.github.io/dongari/?from=kakao', { fromKakao: false })
    expect(decodeURIComponent(url)).not.toContain('from=')
  })
})

describe('SPEC-009 C 앱을 열 때 from 읽고 지우기 (AC-32)', () => {
  it('from=kakao 가 있으면 알려 주고 그 검색어만 지운 주소를 돌려준다', () => {
    expect(readFromKakao('https://crowwan.github.io/dongari/?from=kakao#a')).toEqual({
      fromKakao: true,
      cleanHref: 'https://crowwan.github.io/dongari/#a',
    })
  })

  it('다른 검색어는 남긴다', () => {
    expect(readFromKakao('https://example.com/?a=1&from=kakao')).toEqual({ fromKakao: true, cleanHref: 'https://example.com/?a=1' })
  })

  it('from 이 kakao 가 아니어도 지우지만 카톡에서 온 것으로 보지 않는다', () => {
    expect(readFromKakao('https://example.com/?from=intent')).toEqual({ fromKakao: false, cleanHref: 'https://example.com/' })
  })

  it('from 이 없으면 바꿀 주소가 없다', () => {
    expect(readFromKakao('https://example.com/dongari/')).toEqual({ fromKakao: false, cleanHref: undefined })
  })

  it('withFromKakao 는 지금 주소에 from=kakao 를 붙인다 (메뉴로 열어도 가져오기 카드가 뜨게)', () => {
    expect(withFromKakao('https://example.com/dongari/#x')).toBe('https://example.com/dongari/?from=kakao#x')
  })
})

describe('SPEC-009 C 메뉴 그림 문구 (T-5 예상값, 한 곳)', () => {
  it.each(['kakao-android', 'kakao-ios'] as const)('%s 글 줄의 \' \' 안 메뉴 이름이 그림 속 진한 줄과 같다', (kind) => {
    const { hint, item } = IN_APP_WORDS.menu[kind]
    expect(hint).toContain(`'${item}'`)
  })
})

describe('SPEC-009 C 그냥 여기서 쓰기 표시 dongari:in-app', () => {
  it('표시가 없으면 묻는다', () => {
    expect(localInAppStore(memoryStorage()).stays()).toBe(false)
  })

  it('[그냥 여기서 쓸게요] 를 누르면 { v: 1, stay: true } 를 적고 다시 묻지 않는다', () => {
    const storage = memoryStorage()
    localInAppStore(storage).stay()
    expect(JSON.parse(storage.values.get(IN_APP_KEY) ?? '')).toEqual({ v: 1, stay: true })
    expect(localInAppStore(storage).stays()).toBe(true)
  })

  it('깨졌으면 표시가 없는 것으로 본다 (다시 묻는다)', () => {
    expect(localInAppStore(memoryStorage({ [IN_APP_KEY]: '{oops' })).stays()).toBe(false)
    expect(localInAppStore(memoryStorage({ [IN_APP_KEY]: '{"v":2,"stay":true}' })).stays()).toBe(false)
  })

  it('적지 못해도 오류를 내지 않는다', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(() => localInAppStore(storage).stay()).not.toThrow()
  })
})

describe('SPEC-009 C 복구 코드 복사·붙여 넣기 (AC-30·AC-32)', () => {
  it('클립보드에 복구 코드만 쓴다', async () => {
    const writeText = vi.fn(async () => {})
    await expect(copyRecoveryCode('HK7M-29QF-MX4P-8R2D', { writeText })).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('HK7M-29QF-MX4P-8R2D')
  })

  it('쓰지 못하거나 클립보드가 없으면 false', async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError')
    })
    await expect(copyRecoveryCode('HK7M-29QF-MX4P-8R2D', { writeText })).resolves.toBe(false)
    await expect(copyRecoveryCode('HK7M-29QF-MX4P-8R2D', undefined)).resolves.toBe(false)
  })

  it('클립보드 글이 16자 복구 코드 모양이면 코드로 읽는다', async () => {
    await expect(readClipboardCode({ readText: async () => ' hk7m29qfmx4p8r2d ' })).resolves.toBe('HK7M-29QF-MX4P-8R2D')
  })

  it('코드 모양이 아니거나 읽지 못하면 빈 칸 (undefined)', async () => {
    await expect(readClipboardCode({ readText: async () => '안녕하세요' })).resolves.toBeUndefined()
    await expect(
      readClipboardCode({
        readText: async () => {
          throw new DOMException('denied', 'NotAllowedError')
        },
      }),
    ).resolves.toBeUndefined()
    await expect(readClipboardCode(undefined)).resolves.toBeUndefined()
  })
})
