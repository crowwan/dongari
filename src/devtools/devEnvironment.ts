import { browserInstallPrompt, type InstallPromptStore } from '../features/install/installPrompt'
import { browserAppVersion } from '../features/version/appVersion'
import { askDevCrash } from './crashRequest'
import { sessionCheckLog, type CheckLog } from './envChecks'

// 화면이 보는 브라우저 상태. 테스트에서는 바꿔 넣는다
export type DevEnvironment = {
  href: string
  origin: string
  userAgent: string
  standalone: boolean
  versionLabel: string
  // beforeinstallprompt·appinstalled 가 오는 곳 (window). 받은 시각을 적는다
  events: EventTarget
  // 앱이 모듈을 읽을 때부터 받아 둔 설치 제안 (화면을 열기 전에 온 것도 있다)
  installPrompt: InstallPromptStore
  clipboard: Pick<Clipboard, 'writeText' | 'readText'> | undefined
  share: ((data: ShareData) => Promise<void>) | undefined
  canShare: ((data: ShareData) => boolean) | undefined
  persisted: (() => Promise<boolean>) | undefined
  log: CheckLog
  now: () => Date
  // [오류 내 보기] (SPEC-012 AC-11): 다음에 열 앱에 오류를 내라고 적어 두고 앱 첫 화면으로 간다
  crashApp: () => void
}

export function browserDevEnvironment(): DevEnvironment {
  const nav = window.navigator
  return {
    href: window.location.href,
    origin: window.location.origin,
    userAgent: nav.userAgent,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    versionLabel: browserAppVersion().label,
    events: window,
    installPrompt: browserInstallPrompt,
    clipboard: nav.clipboard,
    share: typeof nav.share === 'function' ? (data) => nav.share(data) : undefined,
    canShare: typeof nav.canShare === 'function' ? (data) => nav.canShare(data) : undefined,
    persisted: nav.storage?.persisted ? () => nav.storage.persisted() : undefined,
    log: sessionCheckLog(window.sessionStorage),
    now: () => new Date(),
    // 해시(#/dev/env)·검색어(?dev=env) 없는 앱 첫 주소로 새로 연다
    crashApp: () => {
      askDevCrash(window.sessionStorage)
      window.location.assign(new URL(import.meta.env.BASE_URL, window.location.origin).href)
    },
  }
}
