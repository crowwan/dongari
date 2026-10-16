import { useEffect, useRef, useState } from 'react'
import App from '../../App'
import type { BookKind } from '../../domain/types'
import { MemoryRepository } from '../../storage/MemoryRepository'
import type { PictureSaver } from '../report/savePicture'
import type { PictureAction, PictureResult } from '../report/usePictureActions'
import { PracticeOverlay } from './PracticeOverlay'
import { PRACTICE_EXAMPLES, practiceData } from './practiceScript'
import { MONTH_READING_MS, START_PROGRESS } from './practiceSteps'

type PracticeRunProps = {
  kind: BookKind // 첫 실행이면 동아리, 설정에서 열었으면 지금 장부 종류
  now: Date // 연습을 시작한 때. 연습 동안 "오늘"은 이 날로 둔다 (자정을 넘겨도 [오늘 N일] 이 바뀌지 않게)
  saver?: PictureSaver
  onStop: () => void // 그만할까요 [그만하기]
  onFinish: (sent: boolean) => void // ④ 끝: 공유를 마쳤으면 true, [다음에 할게요]·사진으로 저장이면 false
}

// 연습 장부 (SPEC-008): 진짜 App 을 메모리 저장소(MemoryRepository)로 한 번 더 그린다.
// 자동으로 지키기·상태 신호·안내 상태(guideStore)·오래 보관 요청을 넘기지 않아 폰에 아무것도 남지 않는다.
// 진짜 화면 부품·규칙 그대로에 연습 띠·단계 말풍선만 얹는다 (practiceSlot)
export function PracticeRun({ kind, now, saver, onStop, onFinish }: PracticeRunProps) {
  const example = PRACTICE_EXAMPLES[kind]
  const [repository] = useState(() => new MemoryRepository(practiceData(kind, now)))
  const [loaded] = useState(() => repository.load())
  const [options] = useState(() => ({ now: () => now }))
  const [progress, setProgress] = useState(START_PROGRESS)
  const readingTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(readingTimer.current), [])

  function openMonth() {
    if (progress.monthSeen) return
    setProgress((current) => ({ ...current, monthSeen: true }))
    readingTimer.current = window.setTimeout(() => setProgress((current) => ({ ...current, monthReady: true })), MONTH_READING_MS)
  }

  // ④ 갈래: 보내기 끝 → "잘 보냈어요!", 거부 → 한 번 더, 닫음(·내려받기로 대신함) → [다음에 할게요], 사진으로 저장 → "연습 끝!"
  function pictureResult(action: PictureAction, result: PictureResult) {
    if (action === 'save') {
      if (result !== 'notAllowed') onFinish(false)
      return
    }
    if (result === 'shared') return onFinish(true)
    if (result === 'notAllowed') return setProgress((current) => ({ ...current, sendReady: true }))
    setProgress((current) => ({ ...current, sendReady: false, sendCancelled: true }))
  }

  return (
    <App
      repository={repository}
      loaded={loaded}
      options={options}
      saver={saver}
      practice={{
        render: (view, dialogs) => (
          <PracticeOverlay
            view={view}
            dialogs={dialogs}
            example={example}
            progress={progress}
            onMonthOpened={openMonth}
            onStop={onStop}
            onLater={() => onFinish(false)}
          />
        ),
        onPictureResult: pictureResult,
      }}
    />
  )
}
