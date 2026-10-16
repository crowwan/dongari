import { CoachMark } from '../../ui/CoachMark'
import { RECOVERY_GUIDE_MESSAGE } from './guideMessages'
import type { FirstUseGuide } from './useFirstUseGuide'

// 진짜 장부의 복구 코드 안내 말풍선 (SPEC-008 4번): [설정] 을 가리키고 [알겠어요]·[✕] 로 닫는다
export function FirstUseGuideMark({ guide }: { guide: FirstUseGuide }) {
  if (!guide.showing) return null
  return (
    <CoachMark
      open
      name="4"
      target={guide.settings}
      message={RECOVERY_GUIDE_MESSAGE}
      onDismiss={guide.dismiss}
      onTargetPress={guide.pressTarget}
    />
  )
}
