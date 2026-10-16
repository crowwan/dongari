import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import type { SheetHistory } from '../useScreenHistory'
import { InstallGuide } from './InstallGuide'
import type { InstallEnvironment } from './installPrompt'
import { browserKind } from './installRules'

type InstallGuideSheetProps = {
  install: InstallEnvironment
  sheets: SheetHistory
  guideSheet: string // 선택 창 이름 (useInstallAction 에 넘긴 것과 같게)
}

// 방법 안내 선택 창 "홈 화면에 추가하는 방법" + [확인] (SPEC-002). 설정 줄과 장부 위 권하기 카드(#135)가 같이 쓴다
export function InstallGuideSheet({ install, sheets, guideSheet }: InstallGuideSheetProps) {
  return (
    <BottomSheet open={sheets.sheet === guideSheet} title="홈 화면에 추가하는 방법" onClose={sheets.closeSheet}>
      <InstallGuide browser={browserKind(install.userAgent)} />
      <Button onClick={sheets.closeSheet}>확인</Button>
    </BottomSheet>
  )
}
