import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './src/pwa/pwaOptions'

// manifest 의 색은 tokens.css 에서 읽는다 (값의 유일한 기준)
const tokensCss = readFileSync(new URL('./src/styles/tokens.css', import.meta.url), 'utf8')

// https://vite.dev/config/
export default defineConfig({
  base: '/dongari/',
  plugins: [react(), VitePWA(pwaOptions(tokensCss))],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
