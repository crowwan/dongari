import { useSyncExternalStore } from 'react'

// 크롬·삼성 인터넷이 "이 사이트를 설치할 수 있다" 고 알려 주는 이벤트. 표준 DOM 타입에 없어 필요한 만큼만 적는다
type InstallPromptEvent = Event & {
  prompt: () => Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function' && 'userChoice' in event
}

export type InstallPromptState = {
  // 바로 설치 창을 열 수 있는지
  canInstall: boolean
  // 설치를 마쳤는지 (설치 창에서 [설치] 또는 브라우저 메뉴로 설치)
  installed: boolean
}

export type InstallPromptStore = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => InstallPromptState
  // 브라우저 설치 창을 연다. 설치 제안은 한 번만 쓸 수 있어 취소하면 canInstall 이 false 로 돌아간다
  install: () => Promise<void>
}

// beforeinstallprompt 는 페이지마다 한 번 온다. 설정 화면을 떠났다 와도(줄이 다시 그려져도) 잃지 않게 화면 밖에서 받아 둔다
export function createInstallPromptStore(target: EventTarget): InstallPromptStore {
  let promptEvent: InstallPromptEvent | null = null
  let state: InstallPromptState = { canInstall: false, installed: false }
  const listeners = new Set<() => void>()

  function update(next: Partial<InstallPromptState>) {
    state = { ...state, ...next }
    listeners.forEach((listener) => listener())
  }

  target.addEventListener('beforeinstallprompt', (event) => {
    if (!isInstallPromptEvent(event)) return
    // 브라우저 기본 설치 띠 대신 설정의 [홈 화면에 추가] 줄로 연다 (안내가 둘 뜨지 않게)
    event.preventDefault()
    promptEvent = event
    update({ canInstall: true })
  })
  target.addEventListener('appinstalled', () => {
    promptEvent = null
    update({ canInstall: false, installed: true })
  })

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => state,
    async install() {
      const event = promptEvent
      if (!event) return
      promptEvent = null
      update({ canInstall: false })
      await event.prompt()
      const { outcome } = await event.userChoice
      if (outcome === 'accepted') update({ installed: true })
    },
  }
}

// 앱이 뜨기 전에 온 제안도 받도록 모듈을 읽을 때 바로 듣기 시작한다
export const browserInstallPrompt = createInstallPromptStore(globalThis.window ?? new EventTarget())

export function useInstallPrompt(store: InstallPromptStore): InstallPromptState & { install: () => Promise<void> } {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return { ...state, install: store.install }
}

// 홈 화면에 추가 줄이 보는 브라우저 상태. 테스트에서는 바꿔 넣는다
export type InstallEnvironment = {
  // 홈 화면 아이콘으로 열었는지 (display-mode: standalone)
  standalone: boolean
  userAgent: string
  // 설치 제안을 화면 밖에서 받아 둔 곳 (설정을 떠났다 와도 잃지 않게)
  installPrompt: InstallPromptStore
}

// 지금 브라우저 상태
export function browserInstallEnvironment(): InstallEnvironment {
  return {
    standalone: globalThis.matchMedia?.('(display-mode: standalone)').matches ?? false,
    userAgent: globalThis.navigator?.userAgent ?? '',
    installPrompt: browserInstallPrompt,
  }
}
