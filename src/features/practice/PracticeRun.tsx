import { useEffect, useRef, useState } from 'react'
import App from '../../App'
import type { BookKind } from '../../domain/types'
import { MemoryRepository } from '../../storage/MemoryRepository'
import type { PictureSaver } from '../report/savePicture'
import type { PictureAction, PictureResult } from '../report/usePictureActions'
import type { Screen } from '../useScreenHistory'
import { PracticeOverlay } from './PracticeOverlay'
import { PRACTICE_EXAMPLES, practiceData } from './practiceScript'
import { READING_MS, START_PROGRESS, type PracticeProgress } from './practiceSteps'

// 연습을 끝까지 하며 해 본 것 (끝 화면 배운 것 줄 체크)
export type PracticeResult = { sent: boolean; excel: boolean }

type PracticeRunProps = {
  kind: BookKind // 첫 실행이면 동아리, 설정에서 열었으면 지금 장부 종류
  now: Date // 연습을 시작한 때. 연습 동안 "오늘"은 이 날로 둔다 (자정을 넘겨도 [오늘 N일] 이 바뀌지 않게)
  saver?: PictureSaver
  onStop: () => void // 그만할까요 [그만하기]
  // 끝(연습용 엑셀 [새 장부 만들기] 또는 [엑셀 연습 건너뛰기]). sent: ④ 에서 공유를 마쳤다, excel: ⑥ 연습용 엑셀까지 해 봤다
  onFinish: (result: PracticeResult) => void
}

// 연습 장부 (SPEC-008·SPEC-010 10절): 진짜 App 을 메모리 저장소(MemoryRepository)로 한 번 더 그린다.
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

  // 월 정리·회비 표를 처음 열면 1초쯤 말풍선 없이 읽게 두고 [‹ 장부로] 를 가리킨다
  function startReading(seen: boolean, opened: Partial<PracticeProgress>, ready: Partial<PracticeProgress>) {
    if (seen) return
    setProgress((current) => ({ ...current, ...opened }))
    readingTimer.current = window.setTimeout(() => setProgress((current) => ({ ...current, ...ready })), READING_MS)
  }

  function opened(screen: Screen['name']) {
    if (screen === 'month-summary') startReading(progress.monthSeen, { monthSeen: true }, { monthReady: true })
    if (screen === 'dues') startReading(progress.duesSeen, { duesSeen: true }, { duesReady: true })
  }

  // ④ 끝: 보냈다 / [다음에 할게요]·사진으로 저장. 말풍선이 결산 [‹ 장부로] 로 옮겨 가 다음 단계로 (SPEC-010 10절)
  function finishPicture(picture: PracticeProgress['picture']) {
    setProgress((current) => (current.picture === 'pending' ? { ...current, picture } : current))
  }

  // ④ 갈래: 보내기 끝 → 보냈음, 거부 → 한 번 더, 닫음(·내려받기로 대신함) → [다음에 할게요], 사진으로 저장 → 안 보냄
  function pictureResult(action: PictureAction, result: PictureResult) {
    if (action === 'save') {
      if (result !== 'notAllowed') finishPicture('later')
      return
    }
    if (result === 'shared') return finishPicture('sent')
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
            onOpened={opened}
            onStop={onStop}
            onLater={() => finishPicture('later')}
            onSkipExcel={() => onFinish({ sent: progress.picture === 'sent', excel: false })}
          />
        ),
        onPictureResult: pictureResult,
        onExcelCreate: () => onFinish({ sent: progress.picture === 'sent', excel: true }),
      }}
    />
  )
}
