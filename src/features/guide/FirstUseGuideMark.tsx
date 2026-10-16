import { CoachMark } from '../../ui/CoachMark'
import { GUIDE_MESSAGES } from './guideMessages'
import type { GuideNumber } from './guideRules'
import type { FirstUseGuide, GuideTargets } from './useFirstUseGuide'

const TARGET_OF: Record<GuideNumber, keyof GuideTargets> = {
  1: 'addEntry',
  2: 'monthSummary',
  3: 'yearAction',
  4: 'settings',
}

// 떠 있는 처음 쓰는 분 안내 말풍선 하나 (SPEC-008)
export function FirstUseGuideMark({ guide }: { guide: FirstUseGuide }) {
  const { showing } = guide
  if (showing === undefined) return null
  return (
    <CoachMark
      // 번호가 바뀌면 새 말풍선으로 (가리키는 버튼·잠금을 처음부터)
      key={showing}
      open
      name={String(showing)}
      target={guide.targets[TARGET_OF[showing]]}
      message={GUIDE_MESSAGES[showing]}
      onDismiss={guide.dismiss}
      onTargetPress={guide.pressTarget}
    />
  )
}
