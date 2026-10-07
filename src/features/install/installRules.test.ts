import { describe, expect, it } from 'vitest'
import { browserKind, shouldOfferInstall } from './installRules'

describe('SPEC-002 설정 [홈 화면에 추가] 줄 표시 조건', () => {
  it('홈 화면에 추가하지 않은 상태로 열면 보인다', () => {
    expect(shouldOfferInstall({ standalone: false, installed: false })).toBe(true)
  })

  it('홈 화면에 추가한 앱(standalone)으로 열면 보이지 않는다', () => {
    expect(shouldOfferInstall({ standalone: true, installed: false })).toBe(false)
  })

  it('이 화면에서 설치를 마쳤으면 보이지 않는다', () => {
    expect(shouldOfferInstall({ standalone: false, installed: true })).toBe(false)
  })
})

describe('SPEC-002 방법 안내 브라우저 구분', () => {
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
