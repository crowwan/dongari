// 연습 장부(SPEC-008)가 진짜 App 에 끼우는 자리. App 은 화면 부품·규칙을 그대로 쓰고 이 자리만 더 그린다
import type { ReactNode } from 'react'
import type { PictureAction, PictureResult } from '../report/usePictureActions'
import type { SheetHistory } from '../useScreenHistory'
import type { PracticeView } from './practiceSteps'

// 연습 중 뒤로 버튼·띠 [그만하기] 가 여는 확인 창 ("연습을 그만할까요?")
export const PRACTICE_STOP_DIALOG = 'practice-stop'

export type PracticeSlot = {
  // 연습 띠·단계 말풍선·그만하기 확인 창. App 이 지금 화면 상태와 확인 창 방문 기록을 넘긴다
  render: (view: PracticeView, dialogs: SheetHistory) => ReactNode
  // 결산 [사진 보내기]·[사진으로 저장] 이 끝난 결과 (④ 단계 갈래)
  onPictureResult: (action: PictureAction, result: PictureResult) => void
}
