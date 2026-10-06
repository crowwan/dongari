// 백업 불러오기 확인 창·실패 알림 문구 (SPEC-002 백업, 예외와 경계 상황)
import type { BackupReadFailure, BackupSummary } from '../../storage/backup'
import type { SaveFailureReason } from '../../storage/LedgerRepository'

export interface DialogMessage {
  title: string
  description: string
}

// 지금 기록이 있을 때 확인 창 제목 아래에 붙이는 설명
export const REPLACE_WARNING = '지금 기록은 불러온 기록으로 바뀌어요'

export function importConfirmTitle(summary: BackupSummary): string {
  if (summary.years.length === 0) return '장부가 없는 백업 파일이에요. 불러올까요?'
  const years = summary.years.map((year) => `${year}년`).join('·')
  return `${years} 장부(기록 ${summary.entryCount}건)를 불러올까요?`
}

export function importFailureMessage(reason: BackupReadFailure): DialogMessage {
  return {
    title: '이 파일은 열 수 없어요',
    description:
      reason === 'newer-version' ? '앱을 새로고침한 뒤 다시 시도해 주세요' : '동아리 회계에서 보낸 백업 파일인지 확인해 주세요',
  }
}

export function restoreFailureMessage(reason: SaveFailureReason): DialogMessage {
  return {
    title: '불러오지 못했어요',
    description:
      reason === 'newer-version'
        ? '새 버전 앱에서 쓴 기록이 있어요. 앱을 새로고침한 뒤 다시 시도해 주세요'
        : '기기에 저장하지 못했어요. 지금 기록은 그대로예요',
  }
}
