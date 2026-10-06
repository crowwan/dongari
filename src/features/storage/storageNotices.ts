// 저장 상태 안내 문구 (SPEC-002 예외와 경계 상황 표)
import type { SaveFailureReason } from '../../storage/LedgerRepository'
import type { StartupStatus } from '../ledger/useLedger'

export const STORAGE_NOTICE = {
  recovered: '저장된 기록을 읽지 못해 새 장부로 시작해요. 예전 기록은 따로 보관해 두었어요',
  newerVersion: '새 버전 앱에서 쓴 기록이 있어요. 앱을 닫았다가 다시 열어 주세요',
  unreadableOriginal: '저장된 기록을 읽지 못했어요. 지금 적는 내용은 저장되지 않아요',
  saveFailed: '저장하지 못했어요. 백업 파일을 보내 두세요',
}

// 안내 띠에 붙는 버튼: [백업 파일 불러오기] / [백업 파일 보내기]
export type StorageNoticeAction = 'import-backup' | 'send-backup'

export interface StorageNotice {
  message: string
  action?: StorageNoticeAction
}

function startupNotice(startup: StartupStatus): StorageNotice | undefined {
  if (startup.status === 'recovered') return { message: STORAGE_NOTICE.recovered }
  if (startup.status === 'read-only') {
    // 상위 버전 원본은 다시 연 새 버전 앱이 다시 읽어야 하므로 불러오기를 권하지 않는다
    return startup.reason === 'newer-version'
      ? { message: STORAGE_NOTICE.newerVersion }
      : { message: STORAGE_NOTICE.unreadableOriginal, action: 'import-backup' }
  }
  return undefined
}

// 화면 위에 띄울 안내, 위에서부터 순서대로.
// 저장을 막아 둔 상태(read-only)의 저장 실패는 시작 안내가 이미 이유를 말하므로 따로 띄우지 않는다
export function storageNotices(startup: StartupStatus, saveFailure: SaveFailureReason | undefined): StorageNotice[] {
  const notices = [startupNotice(startup)]
  if (saveFailure && startup.status !== 'read-only') {
    notices.push({ message: STORAGE_NOTICE.saveFailed, action: 'send-backup' })
  }
  return notices.filter((notice) => notice !== undefined)
}
