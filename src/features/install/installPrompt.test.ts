import { describe, expect, it, vi } from 'vitest'
import { createInstallPromptStore } from './installPrompt'

function installPromptEvent(outcome: 'accepted' | 'dismissed') {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  })
}

describe('SPEC-009 개발 확인 화면 설치 창 결과', () => {
  it('설치 창을 열면 고른 것(userChoice)을 돌려준다', async () => {
    const events = new EventTarget()
    const store = createInstallPromptStore(events)
    events.dispatchEvent(installPromptEvent('dismissed'))

    expect(await store.install()).toBe('dismissed')
    expect(store.getSnapshot()).toEqual({ canInstall: false, installed: false })
  })

  it('설치 제안이 없으면 아무것도 돌려주지 않는다', async () => {
    expect(await createInstallPromptStore(new EventTarget()).install()).toBeUndefined()
  })
})
