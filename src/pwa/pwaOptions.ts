import type { VitePWAOptions } from 'vite-plugin-pwa'

// GitHub Pages 주소 (vite.config.ts base 와 같다)
const APP_PATH = '/dongari/'

// tokens.css 맨 앞 라이트 블록(:root, [data-theme='light'])의 값을 읽는다. manifest 는 CSS 변수를 못 써 빌드 때 옮겨 적는다
export function lightToken(tokensCss: string, name: string): string {
  const lightBlock = tokensCss.slice(0, tokensCss.indexOf('}') + 1)
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(lightBlock)
  if (!match) throw new Error(`tokens.css 라이트 블록에 ${name} 가 없어요`)
  return match[1].trim()
}

// 홈 화면 추가와 오프라인 실행 설정 (SPEC-002). vite.config.ts 가 tokens.css 내용을 넘겨 부른다
export function pwaOptions(tokensCss: string): Partial<VitePWAOptions> {
  const background = lightToken(tokensCss, '--bg')

  return {
    // 새 버전은 묻지 않고 받아 바로 교체(skipWaiting)하고, 화면은 다음에 열 때 새 버전으로 뜬다.
    // virtual:pwa-register 의 자동 새로고침은 적던 내용을 날릴 수 있어 쓰지 않고 등록 스크립트만 넣는다
    registerType: 'autoUpdate',
    injectRegister: 'script',
    includeAssets: ['icons/favicon.svg'],
    manifest: {
      id: APP_PATH,
      name: '동아리 회계',
      short_name: '동아리 회계',
      description: '동아리 수입·지출을 한 줄씩 적으면 월 정리와 올해 결산을 만들어 주는 장부',
      lang: 'ko',
      start_url: APP_PATH,
      scope: APP_PATH,
      display: 'standalone',
      orientation: 'portrait',
      theme_color: background,
      background_color: background,
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    // 미리 저장: 화면 파일은 아래 glob, 아이콘은 includeAssets 와 manifest 아이콘, manifest 는 플러그인이 넣는다 (겹치지 않게 나눔)
    workbox: {
      globPatterns: ['**/*.{js,css,html}'],
      cleanupOutdatedCaches: true,
    },
  }
}
