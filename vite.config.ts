import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './src/pwa/pwaOptions'

// manifest 의 색은 tokens.css 에서 읽는다 (값의 유일한 기준)
const tokensCss = readFileSync(new URL('./src/styles/tokens.css', import.meta.url), 'utf8')

// 빌드 경로: 기본은 본 주소(GitHub Pages /dongari/), QA 미리보기는 APP_BASE=/dongari/preview/ (npm run build:preview).
// 화면 파일·아이콘 경로와 manifest·서비스 워커 범위가 모두 이 값을 따른다
const base = process.env.APP_BASE || '/dongari/'

// 앱 버전: package.json version 을 빌드 때 넣는다 (자동 보관 상태 신호, SPEC-007)
function packageVersion(): string {
  const packageJson: unknown = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  if (typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson && typeof packageJson.version === 'string') {
    return packageJson.version
  }
  throw new Error('package.json 에 version 이 없다')
}

// https://vite.dev/config/
export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(packageVersion()) },
  plugins: [react(), VitePWA(pwaOptions(tokensCss, base))],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
