// 설치 안내 띠 규칙 (SPEC-002 홈 화면 추가). 화면과 떼어 시각·저장소를 받아 판단한다

// 장부 데이터(dongari:v2)와 따로 두는 작은 기억. 백업 파일에는 들어가지 않는다
export const INSTALL_BANNER_DISMISSED_KEY = 'dongari:install-banner-dismissed-at'

const DISMISS_DAYS = 30
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000

export type DismissStorage = Pick<Storage, 'getItem' | 'setItem'>

type ShowCondition = {
  // 홈 화면 아이콘으로 열었는지 (display-mode: standalone)
  standalone: boolean
  // [닫기] 를 누른 시각(ms). 누른 적 없으면 null
  dismissedAt: number | null
  now: number
}

// 홈 화면에 추가하지 않은 상태로 열었고, 닫은 지 30일이 안 됐으면 숨긴다
export function shouldShowInstallBanner({ standalone, dismissedAt, now }: ShowCondition): boolean {
  if (standalone) return false
  if (dismissedAt === null) return true
  return now - dismissedAt >= DISMISS_MS
}

// 저장소를 못 쓰면(사생활 보호 모드 등) 닫은 적 없는 것으로 본다
export function readDismissedAt(storage: DismissStorage): number | null {
  try {
    const raw = storage.getItem(INSTALL_BANNER_DISMISSED_KEY)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

// 못 적어도 이번에 띠가 사라지는 것은 같다. 다음에 열면 다시 보일 뿐이라 오류를 알리지 않는다
export function saveDismissedAt(storage: DismissStorage, now: number): void {
  try {
    storage.setItem(INSTALL_BANNER_DISMISSED_KEY, String(now))
  } catch {
    // 무시
  }
}

export type BrowserKind = 'samsung' | 'chrome' | 'other'

// 방법 보기에서 메뉴 위치를 맞게 알려 주려고 브라우저를 구분한다. 삼성 인터넷 UA 에도 Chrome 이 들어 있어 먼저 본다
export function browserKind(userAgent: string): BrowserKind {
  if (userAgent.includes('SamsungBrowser')) return 'samsung'
  if (/Chrome\//.test(userAgent) && !/Edg|OPR|Whale/.test(userAgent)) return 'chrome'
  return 'other'
}
