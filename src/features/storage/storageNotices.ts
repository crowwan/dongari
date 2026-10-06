// 저장 상태 안내 문구 (SPEC-002 예외와 경계 상황 표)
import type { SaveFailureReason } from '../../storage/LedgerRepository'
import type { StartupStatus } from '../ledger/useLedger'

// "백업 파일 불러오기·보내기" 버튼은 백업 기능(#8)이 생기면 안내 띠 옆에 붙인다
export const STORAGE_NOTICE = {
  recovered: '저장된 기록을 읽지 못해 새 장부로 시작해요. 예전 기록은 따로 보관해 두었어요',
  newerVersion: '새 버전 앱에서 쓴 기록이 있어요. 앱을 새로고침해 주세요',
  unreadableOriginal: '저장된 기록을 읽지 못했어요. 지금 적는 내용은 저장되지 않아요',
  saveFailed: '저장하지 못했어요. 백업 파일을 보내 두세요',
}

function startupNotice(startup: StartupStatus): string | undefined {
  if (startup.status === 'recovered') return STORAGE_NOTICE.recovered
  if (startup.status === 'read-only') {
    return startup.reason === 'newer-version' ? STORAGE_NOTICE.newerVersion : STORAGE_NOTICE.unreadableOriginal
  }
  return undefined
}

// 화면 위에 띄울 안내, 위에서부터 순서대로.
// 저장을 막아 둔 상태(read-only)의 저장 실패는 시작 안내가 이미 이유를 말하므로 따로 띄우지 않는다
export function storageNotices(startup: StartupStatus, saveFailure: SaveFailureReason | undefined): string[] {
  const notices = [startupNotice(startup)]
  if (saveFailure && startup.status !== 'read-only') notices.push(STORAGE_NOTICE.saveFailed)
  return notices.filter((notice) => notice !== undefined)
}
