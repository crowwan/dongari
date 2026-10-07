// 설정 [홈 화면에 추가] 줄 규칙 (SPEC-002 홈 화면 추가). 화면과 떼어 브라우저 상태를 받아 판단한다

type OfferCondition = {
  // 홈 화면 아이콘으로 열었는지 (display-mode: standalone)
  standalone: boolean
  // 이 화면에서 설치를 마쳤는지 (설치 창 [설치] 또는 브라우저 메뉴로 설치)
  installed: boolean
}

// 이미 홈 화면 앱이면 권할 것이 없다
export function shouldOfferInstall({ standalone, installed }: OfferCondition): boolean {
  return !standalone && !installed
}

export type BrowserKind = 'samsung' | 'chrome' | 'other'

// 방법 안내에서 메뉴 위치를 맞게 알려 주려고 브라우저를 구분한다. 삼성 인터넷 UA 에도 Chrome 이 들어 있어 먼저 본다
export function browserKind(userAgent: string): BrowserKind {
  if (userAgent.includes('SamsungBrowser')) return 'samsung'
  if (/Chrome\//.test(userAgent) && !/Edg|OPR|Whale/.test(userAgent)) return 'chrome'
  return 'other'
}
