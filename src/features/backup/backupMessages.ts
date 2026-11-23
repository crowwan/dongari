// 백업 불러오기 확인 창·실패 알림 문구 (SPEC-002 백업, 예외와 경계 상황)
import type { BackupReadFailure, BackupSummary } from '../../storage/backup'
import type { SaveFailureReason } from '../../storage/LedgerRepository'

export interface DialogMessage {
  title: string
  description: string
}

// 지금 기록이 있을 때 확인 창 제목 아래에 붙이는 설명
export const REPLACE_WARNING = '지금 기록은 불러온 기록으로 바뀌어요'

// 불러오기는 전체 바꾸기라 파일의 장부 수와 기록 수를 묻는다 (SPEC-005 "장부 2개, 기록 128건으로 바꿀까요?")
export function importConfirmTitle(summary: BackupSummary): string {
  if (summary.bookCount === 0) return '장부가 없는 기록 파일이에요. 불러올까요?'
  return `장부 ${summary.bookCount}개, 기록 ${summary.entryCount}건으로 바꿀까요?`
}

export function importFailureMessage(reason: BackupReadFailure): DialogMessage {
  return {
    title: '이 파일은 열 수 없어요',
    description:
      reason === 'newer-version' ? '앱을 닫았다가 다시 연 뒤 불러와 주세요' : '우리 장부에서 보낸 기록 파일인지 확인해 주세요',
  }
}

// 기록 파일·복구 코드 불러오기가 같이 쓴다. 저장 전 가드에 막힌 것(invalid-data)은 저장 공간 탓이 아니라 앱 문제다 (#172)
export function restoreFailureMessage(reason: SaveFailureReason): DialogMessage {
  return { title: '불러오지 못했어요', description: restoreFailureDescription(reason) }
}

function restoreFailureDescription(reason: SaveFailureReason): string {
  if (reason === 'newer-version') return '새 버전 앱에서 쓴 기록이 있어요. 앱을 닫았다가 다시 열어 주세요'
  if (reason === 'invalid-data') return '앱에 문제가 있어 불러온 기록을 저장하지 않았어요. 지금 기록은 그대로예요'
  return '기기에 저장하지 못했어요. 지금 기록은 그대로예요'
}
