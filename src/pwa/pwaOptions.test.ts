/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lightToken, pwaOptions } from './pwaOptions'

// vite.config.ts 처럼 파일을 그대로 읽는다 (Vitest 는 CSS import 를 빈 글자로 바꾼다). 경로는 레포 루트 기준
const tokensCss = readFileSync('src/styles/tokens.css', 'utf8')

describe('SPEC-002 홈 화면 추가 (PWA) 설정', () => {
  const options = pwaOptions(tokensCss)
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

  it('오프라인에서도 열리도록 화면 파일과 아이콘을 모두 미리 저장한다', () => {
    expect(options.workbox?.globPatterns).toEqual(['**/*.{js,css,html}'])
    expect(options.includeAssets).toEqual(['icons/favicon.svg'])
    // manifest 와 그 아이콘은 플러그인이 기본으로 미리 저장한다
    expect(options.includeManifestIcons).not.toBe(false)
    expect(options.workbox?.cleanupOutdatedCaches).toBe(true)
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
