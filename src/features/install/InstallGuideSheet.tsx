import { useEffect, useEffectEvent } from 'react'
import { BottomSheet } from '../../ui/BottomSheet'
import type { GuideSheetHistory } from './installAction'
import { InstallGuide } from './InstallGuide'
import { useInstallPrompt, type InstallEnvironment } from './installPrompt'
import { browserKind } from './installRules'

type InstallGuideSheetProps = {
  install: InstallEnvironment
  sheets: GuideSheetHistory
  guideSheet: string // 선택 창 이름 (useInstallAction 에 넘긴 것과 같게)
  // 마지막 장 [다 했어요] 로 닫았을 때 (연습 끝 설치 따라 하기 → "홈 화면에 생겼나요?", SPEC-009 B)
  onFinished?: () => void
}

// 방법 안내 선택 창 "홈 화면에 추가하는 방법" (SPEC-002, SPEC-009 A 그림 넘기기). 설정 줄·장부 위 권하기 카드(#135)·연습 끝 [추가할게요](SPEC-009 B)가 같이 쓴다.
// 창 안 장 번호는 그림 안내가 들고 있어 닫았다 다시 열면 1장부터다
export function InstallGuideSheet({ install, sheets, guideSheet, onFinished }: InstallGuideSheetProps) {
  const open = sheets.sheet === guideSheet
  const { installed } = useInstallPrompt(install.installPrompt)
  const closeSheet = useEffectEvent(() => sheets.closeSheet())

  // 따라 하다 브라우저 메뉴로 설치를 마치면(appinstalled) 창을 닫는다 (SPEC-009 예외와 경계)
  useEffect(() => {
    if (open && installed) closeSheet()
  }, [open, installed])

  return (
    <BottomSheet open={open} title="홈 화면에 추가하는 방법" onClose={sheets.closeSheet}>
      <InstallGuide
        browser={browserKind(install.userAgent)}
        onFinish={() => {
          sheets.closeSheet()
          onFinished?.()
        }}
      />
    </BottomSheet>
  )
}
