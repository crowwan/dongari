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

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), VitePWA(pwaOptions(tokensCss, base))],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
