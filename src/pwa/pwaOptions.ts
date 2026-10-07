import type { VitePWAOptions } from 'vite-plugin-pwa'

// tokens.css 맨 앞 라이트 블록(:root, [data-theme='light'])의 값을 읽는다. manifest 는 CSS 변수를 못 써 빌드 때 옮겨 적는다
export function lightToken(tokensCss: string, name: string): string {
  const lightBlock = tokensCss.slice(0, tokensCss.indexOf('}') + 1)
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(lightBlock)
  if (!match) throw new Error(`tokens.css 라이트 블록에 ${name} 가 없어요`)
  return match[1].trim()
}

// 본 주소 아래에 따로 올리는 화면 폴더: QA 미리보기(preview/)와 실험(lab/). gh-pages 에서 본 주소 옆에 산다
const SUB_SITES = ['preview', 'lab'] as const

// 본 주소 빌드의 서비스 워커(범위 base)는 하위 폴더 화면 요청도 받는다. 그 요청은 본 앱 index.html 로 답하지 않고
// 네트워크(그 폴더의 화면)로 보낸다 (#54). 하위 폴더 빌드는 범위가 그 폴더 안이라 본 주소에 닿지 않아 둘 필요가 없다
function subSiteDenylist(base: string): RegExp[] | undefined {
  const lastSegment = base.split('/').at(-2) ?? ''
  if (SUB_SITES.some((name) => name === lastSegment)) return undefined
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 서비스 워커는 경로 + 검색어(pathname + search)로 맞춘다. 끝 / 없는 /dongari/preview 도 미리보기다
  return [new RegExp(`^${escapedBase}(?:${SUB_SITES.join('|')})(?:[/?]|$)`)]
}

// 홈 화면 추가와 오프라인 실행 설정 (SPEC-002). vite.config.ts 가 tokens.css 내용과 빌드 경로(base)를 넘겨 부른다.
// base 는 본 주소 '/dongari/' 또는 QA 미리보기 '/dongari/preview/'. 서비스 워커 범위는 플러그인이 vite base 를 따른다
export function pwaOptions(tokensCss: string, base: string): Partial<VitePWAOptions> {
  if (!base.startsWith('/') || !base.endsWith('/')) {
    throw new Error(`빌드 경로(APP_BASE)는 / 로 시작하고 끝나야 해요: ${base}`)
  }
  const background = lightToken(tokensCss, '--bg')

  return {
    // 새 버전은 묻지 않고 받아 바로 교체(skipWaiting)하고, 화면은 다음에 열 때 새 버전으로 뜬다.
    // virtual:pwa-register 의 자동 새로고침은 적던 내용을 날릴 수 있어 쓰지 않고 등록 스크립트만 넣는다
    registerType: 'autoUpdate',
    injectRegister: 'script',
    includeAssets: ['icons/favicon.svg'],
    manifest: {
      id: base,
      name: '동아리 회계',
      short_name: '동아리 회계',
      description: '동아리 수입·지출을 한 줄씩 적으면 월 정리와 올해 결산을 만들어 주는 장부',
      lang: 'ko',
      start_url: base,
      scope: base,
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
    // 미리 저장: 화면 파일·글꼴(Pretendard woff2)은 아래 glob, 아이콘은 includeAssets 와 manifest 아이콘,
    // manifest 는 플러그인이 넣는다 (겹치지 않게 나눔). 글꼴이 빠지면 오프라인에서 기기 글꼴로 바뀌어 글자 폭이 달라진다
    workbox: {
      globPatterns: ['**/*.{js,css,html,woff2}'],
      cleanupOutdatedCaches: true,
      navigateFallbackDenylist: subSiteDenylist(base),
    },
  }
}
