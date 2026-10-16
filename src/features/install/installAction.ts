import type { SheetHistory } from '../useScreenHistory'
import { useInstallPrompt, type InstallEnvironment } from './installPrompt'
import { shouldOfferInstall } from './installRules'

// 방법 안내 선택 창을 여닫는 방문 기록. 연습 끝 묻는 화면(SPEC-009 B)은 App 밖이라 이것만 따로 들고 있다
export type GuideSheetHistory = Pick<SheetHistory, 'sheet' | 'openSheet' | 'closeSheet'>

// [홈 화면에 추가] 누름 (SPEC-002): 설치 제안이 있으면 브라우저 설치 창, 없으면 방법 안내 선택 창(guideSheet, InstallGuideSheet 가 그린다).
// 설정 "앱" 묶음 줄과 장부 위 권하기 카드(#135), 연습 끝 [추가할게요](SPEC-009 B)가 같이 쓴다
export function useInstallAction(install: InstallEnvironment, sheets: GuideSheetHistory, guideSheet: string) {
  const prompt = useInstallPrompt(install.installPrompt)
  return {
    // 아직 홈 화면 앱이 아니다 (권할 것이 있다)
    offers: shouldOfferInstall({ standalone: install.standalone, installed: prompt.installed }),
    installed: prompt.installed,
    start: () => (prompt.canInstall ? void prompt.install() : sheets.openSheet(guideSheet)),
  }
}
