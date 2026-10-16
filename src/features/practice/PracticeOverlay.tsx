import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { CoachMark } from '../../ui/CoachMark'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { Icon } from '../../ui/Icon'
import type { SheetHistory } from '../useScreenHistory'
import type { PracticeExample } from './practiceScript'
import { PRACTICE_STOP_DIALOG } from './practiceSlot'
import { practiceCoach, type PracticeCoach, type PracticeProgress, type PracticeView } from './practiceSteps'
import { practiceTargetRef } from './practiceTargets'
import './practice.css'

type PracticeOverlayProps = {
  view: PracticeView
  dialogs: SheetHistory
  example: PracticeExample
  progress: PracticeProgress
  // 월 정리를 열었다 (② — 1초쯤 뒤 [‹ 장부로] 를 가리킨다)
  onMonthOpened: () => void
  // 그만할까요 확인 창 [그만하기]
  onStop: () => void
  // 공유 갈래의 [다음에 할게요]
  onLater: () => void
}

// 연습 동안 App 위에 얹는 것 (SPEC-008): 맨 위 연습 띠, 단계 말풍선 하나, 그만할까요 확인 창.
// 월 정리를 연 뒤 1초쯤은 말풍선 없이 읽게 하되 뒤 화면은 그대로 막아 둔다(띠 [그만하기] 만)
export function PracticeOverlay({ view, dialogs, example, progress, onMonthOpened, onStop, onLater }: PracticeOverlayProps) {
  const bandRef = useRef<HTMLDivElement>(null)
  const coach = practiceCoach(view, progress, example)
  const reading = view.screen === 'month-summary' && !progress.monthReady && !view.covered

  const monthOpened = useEffectEvent(onMonthOpened)
  useEffect(() => {
    if (view.screen === 'month-summary') monthOpened()
  }, [view.screen])

  return (
    <>
      <div ref={bandRef} className="practice-band" data-raised={coach !== undefined || reading || undefined} data-testid="practice-band">
        <div className="practice-band__inner">
          <Icon name="info" />
          <p className="practice-band__text">
            <strong>연습 중이에요</strong> <span>저장되지 않아요</span>
          </p>
          <button type="button" className="practice-band__stop" onClick={() => dialogs.openDialog(PRACTICE_STOP_DIALOG)}>
            그만하기
          </button>
        </div>
      </div>
      {reading && <div className="practice-reading" data-testid="practice-reading" />}
      {coach && <PracticeCoachMark key={`${coach.step}:${coach.target}:${coach.message}`} coach={coach} example={example} bandRef={bandRef} onLater={onLater} />}
      <ConfirmDialog
        open={dialogs.dialog === PRACTICE_STOP_DIALOG}
        title="연습을 그만할까요?"
        description="적은 연습 내역은 사라져요"
        cancelLabel="계속하기"
        confirmLabel="그만하기"
        onConfirm={onStop}
        onCancel={dialogs.closeDialog}
      />
    </>
  )
}

type PracticeCoachMarkProps = {
  coach: PracticeCoach
  example: PracticeExample
  bandRef: RefObject<HTMLDivElement | null>
  onLater: () => void
}

// 단계 말풍선 하나. 가리키는 곳·같이 열어 둘 곳(+ 연습 띠)은 이 단계 동안 바뀌지 않게 처음 한 번 만든다.
// 글이 바뀌면(공유 갈래) 새로 띄운다: 가리키는 버튼이 제 안내(aria-describedby)를 바꾸며 말풍선 설명을 덮어써도 다시 붙는다
function PracticeCoachMark({ coach, example, bandRef, onLater }: PracticeCoachMarkProps) {
  const [refs] = useState(() => ({
    target: practiceTargetRef(coach.target, example),
    alsoOpen: [...coach.alsoOpen.map((target) => practiceTargetRef(target, example)), bandRef],
    spotlight: coach.spotlight.map((target) => practiceTargetRef(target, example)),
  }))
  return (
    <CoachMark
      open
      name={coach.step}
      target={refs.target}
      alsoOpen={refs.alsoOpen}
      spotlight={refs.spotlight}
      message={coach.message}
      progress={`연습 ${coach.stage} / 4`}
      action={coach.later ? { label: '다음에 할게요', onClick: onLater } : undefined}
    />
  )
}
