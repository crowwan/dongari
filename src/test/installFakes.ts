// 홈 화면에 추가 테스트가 같이 쓰는 가짜 브라우저 (SPEC-002·SPEC-009)
import { vi } from 'vitest'
import type { InstallOfferStatus } from '../features/install/installOffer'
import { createInstallPromptStore, type InstallEnvironment, type InstallOutcome } from '../features/install/installPrompt'

export const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
export const KAKAO_UA = `${CHROME_UA} KAKAOTALK 10.8.0`

type FakeBrowserOptions = Partial<Pick<InstallEnvironment, 'standalone' | 'userAgent'>> & {
  // 브라우저가 설치를 제안해 두었으면 설치 창에서 고를 것
  prompt?: InstallOutcome
}

// 테스트마다 따로 듣는 곳을 두어 앞 테스트의 설치 제안이 섞이지 않게 한다.
// events 로 appinstalled 를 보내면 브라우저 메뉴로 설치를 마친 것과 같다
export function fakeBrowser({ standalone = false, userAgent = CHROME_UA, prompt: outcome }: FakeBrowserOptions = {}) {
  const events = new EventTarget()
  const installPrompt = createInstallPromptStore(events)
  const prompt = vi.fn(async () => {})
  if (outcome) {
    events.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt,
        userChoice: Promise.resolve({ outcome, platform: 'web' }),
      }),
    )
  }
  const install: InstallEnvironment = { standalone, userAgent, installPrompt }
  return { install, events, prompt }
}

// 기기의 권하기 상태 (dongari:install-offer 대신 메모리)
export function memoryOfferStore(initial?: InstallOfferStatus) {
  const store = {
    saved: initial,
    load: () => store.saved,
    save: (next: InstallOfferStatus) => {
      store.saved = next
    },
  }
  return store
}
