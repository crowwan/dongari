/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lightToken, pwaOptions } from './pwaOptions'

// vite.config.ts 처럼 파일을 그대로 읽는다 (Vitest 는 CSS import 를 빈 글자로 바꾼다). 경로는 레포 루트 기준
const tokensCss = readFileSync('src/styles/tokens.css', 'utf8')

describe('SPEC-002 홈 화면 추가 (PWA) 설정', () => {
  const options = pwaOptions(tokensCss, '/dongari/')
  const manifest = options.manifest || undefined

  it('GitHub Pages 주소(/dongari/)에서 홈 화면 앱으로 열리게 한다', () => {
    expect(manifest).toMatchObject({
      name: '동아리 회계',
      short_name: '동아리 회계',
      lang: 'ko',
      start_url: '/dongari/',
      scope: '/dongari/',
      id: '/dongari/',
      display: 'standalone',
    })
  })

  it('빌드 경로를 바꾸면(QA 미리보기 /dongari/preview/) 홈 화면 앱도 그 경로에서 열린다', () => {
    const preview = pwaOptions(tokensCss, '/dongari/preview/').manifest || undefined

    expect(preview).toMatchObject({
      start_url: '/dongari/preview/',
      scope: '/dongari/preview/',
      id: '/dongari/preview/',
    })
  })

  it('빌드 경로가 / 로 시작하고 끝나지 않으면 빌드를 멈춘다 (홈 화면 앱 범위가 틀어지지 않게)', () => {
    expect(() => pwaOptions(tokensCss, 'dongari/preview/')).toThrow('dongari/preview/')
    expect(() => pwaOptions(tokensCss, '/dongari/preview')).toThrow('/dongari/preview')
  })

  it('앱 바탕색과 주소창 색은 tokens.css 의 라이트 바탕(--bg)과 같다', () => {
    expect(lightToken(tokensCss, '--bg')).toMatch(/^#[0-9a-f]{6}$/)
    expect(manifest?.theme_color).toBe(lightToken(tokensCss, '--bg'))
    expect(manifest?.background_color).toBe(lightToken(tokensCss, '--bg'))
  })

  it('192·512 아이콘과 둥근 모양으로 잘려도 되는(maskable) 아이콘을 둔다', () => {
    expect(manifest?.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
        expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ]),
    )
  })

  it('새 버전은 사용자에게 묻지 않고 받아 두었다가, 다음에 열 때 반영한다 (쓰는 중에 새로고침하지 않는다)', () => {
    expect(options.registerType).toBe('autoUpdate')
    // 화면을 저절로 새로고침하는 등록 코드(virtual:pwa-register) 대신 등록만 하는 스크립트
    expect(options.injectRegister).toBe('script')
  })

  it('오프라인에서도 열리도록 화면 파일·글꼴과 아이콘을 모두 미리 저장한다', () => {
    // 글꼴(Pretendard woff2)이 빠지면 오프라인에서 기기 글꼴로 바뀌어 글자 폭·줄바꿈이 달라진다
    expect(options.workbox?.globPatterns).toEqual(['**/*.{js,css,html,woff2}'])
    expect(options.includeAssets).toEqual(['icons/favicon.svg'])
    // manifest 와 그 아이콘은 플러그인이 기본으로 미리 저장한다
    expect(options.includeManifestIcons).not.toBe(false)
    expect(options.workbox?.cleanupOutdatedCaches).toBe(true)
  })
})

describe('SPEC-002 본 주소 서비스 워커가 미리보기 주소를 덮지 않게 (#54)', () => {
  // 서비스 워커는 화면 요청의 경로(pathname + search)를 제외 목록과 맞춰 본다
  const isDenied = (denylist: RegExp[] | undefined, path: string) =>
    (denylist ?? []).some((rule) => rule.test(path))

  it('본 주소 빌드(/dongari/)는 미리보기·lab 화면 요청을 본 앱 화면(index.html)으로 답하지 않는다', () => {
    const denylist = pwaOptions(tokensCss, '/dongari/').workbox?.navigateFallbackDenylist

    expect(isDenied(denylist, '/dongari/preview/')).toBe(true)
    expect(isDenied(denylist, '/dongari/preview/index.html')).toBe(true)
    expect(isDenied(denylist, '/dongari/preview')).toBe(true)
    expect(isDenied(denylist, '/dongari/preview?from=home')).toBe(true)
    expect(isDenied(denylist, '/dongari/lab/')).toBe(true)
    expect(isDenied(denylist, '/dongari/lab/demo.html')).toBe(true)
  })

  it('본 주소 빌드는 본 화면 요청은 그대로 본 앱 화면으로 답한다 (오프라인 실행 유지)', () => {
    const denylist = pwaOptions(tokensCss, '/dongari/').workbox?.navigateFallbackDenylist

    expect(isDenied(denylist, '/dongari/')).toBe(false)
    expect(isDenied(denylist, '/dongari/index.html')).toBe(false)
    expect(isDenied(denylist, '/dongari/?source=pwa')).toBe(false)
    // 이름이 preview·lab 으로 시작할 뿐인 경로는 미리보기가 아니다
    expect(isDenied(denylist, '/dongari/previews/')).toBe(false)
    expect(isDenied(denylist, '/dongari/laboratory')).toBe(false)
  })

  it('미리보기 빌드(/dongari/preview/)는 제외 목록을 두지 않는다 (서비스 워커 범위가 미리보기 안이라 본 주소에 닿지 않음)', () => {
    const preview = pwaOptions(tokensCss, '/dongari/preview/').workbox

    expect(preview?.navigateFallbackDenylist).toBeUndefined()
  })

  it('제외 목록은 빌드 경로에서 만든다 (주소가 바뀌어도 따라간다)', () => {
    const denylist = pwaOptions(tokensCss, '/club.app/').workbox?.navigateFallbackDenylist

    expect(isDenied(denylist, '/club.app/preview/')).toBe(true)
    expect(isDenied(denylist, '/club.app/lab/')).toBe(true)
    // 경로의 . 은 아무 글자가 아니라 . 그대로 맞춘다
    expect(isDenied(denylist, '/clubxapp/preview/')).toBe(false)
    expect(isDenied(denylist, '/dongari/preview/')).toBe(false)
  })
})

describe('tokens.css 라이트 값 읽기', () => {
  it('다크 값이 아닌 :root 라이트 값을 읽는다', () => {
    const css = `:root,\n[data-theme='light'] {\n  --bg: #f3f5f7;\n}\n[data-theme='dark'] {\n  --bg: #12171b;\n}`

    expect(lightToken(css, '--bg')).toBe('#f3f5f7')
  })

  it('없는 토큰이면 오류를 낸다 (빌드에서 바로 알 수 있게)', () => {
    expect(() => lightToken(':root { --bg: #fff; }', '--primary')).toThrow('--primary')
  })
})
