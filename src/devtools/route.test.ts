import { describe, expect, it } from 'vitest'
import { isDevEnvRoute, isPreviewBase } from './route'

const at = (hash: string, search = '') => ({ hash, search })

describe('SPEC-009 개발 확인 화면 주소 (AC-35)', () => {
  it('개발 모드·미리보기 빌드에서 #/dev/env 이면 확인 화면을 연다', () => {
    expect(isDevEnvRoute(at('#/dev/env'), true)).toBe(true)
  })

  it('본 주소 빌드에서는 같은 주소여도 열지 않는다', () => {
    expect(isDevEnvRoute(at('#/dev/env'), false)).toBe(false)
    expect(isDevEnvRoute(at('', '?dev=env'), false)).toBe(false)
  })

  it('크롬 intent 로 넘어온 주소(?dev=env, 해시를 못 넘김)도 연다', () => {
    expect(isDevEnvRoute(at('', '?from=intent&dev=env'), true)).toBe(true)
  })

  it('다른 주소에서는 열지 않는다', () => {
    expect(isDevEnvRoute(at(''), true)).toBe(false)
    expect(isDevEnvRoute(at('#/dev/catalog'), true)).toBe(false)
    expect(isDevEnvRoute(at('', '?from=kakao'), true)).toBe(false)
  })

  it('미리보기 빌드는 빌드 경로가 / 인 빌드다 (본 주소 /dongari/ 는 아니다)', () => {
    expect(isPreviewBase('/')).toBe(true)
    expect(isPreviewBase('/dongari/')).toBe(false)
  })
})
