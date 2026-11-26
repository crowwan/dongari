// 저장 상태 안내 문구 (SPEC-002 예외와 경계 상황 표)
import type { SaveFailureReason } from '../../storage/LedgerRepository'
import type { StartupStatus } from '../ledger/useLedger'

export const STORAGE_NOTICE = {
  recovered: '저장된 기록을 읽지 못해 새 장부로 시작해요. 예전 기록은 따로 보관해 두었어요',
  newerVersion: '새 버전 앱에서 쓴 기록이 있어요. 앱을 닫았다가 다시 열어 주세요',
  unreadableOriginal: '저장된 기록을 읽지 못했어요. 지금 적는 내용은 저장되지 않아요',
  oldVersionUnpreserved: '기록을 새 버전으로 옮기지 못했어요. 지금 적는 내용은 저장되지 않아요',
  // v2.6 문구 ①: 목록에 보이는 내역이 앱을 닫으면 사라진다는 것까지 알린다 (#121)
  saveFailed: '저장하지 못했어요. 방금 적은 내역은 앱을 닫으면 사라져요. 기록 파일을 보내 두세요',
  // 가드에 어긋나 쓰지 않음(#172): 사용자가 잘못한 것이 아니고, 화면은 그 변경 전으로 돌아가 있다(useLedger)
  invalidData: '앱에 문제가 있어 방금 바꾼 것을 저장하지 않았어요. 그 전 기록은 그대로예요',
}

// 안내 띠에 붙는 버튼: [기록 파일 불러오기] / [기록 파일 보내기]
export type StorageNoticeAction = 'import-backup' | 'send-backup'

export interface StorageNotice {
  message: string
  action?: StorageNoticeAction
}

function startupNotice(startup: StartupStatus): StorageNotice | undefined {
  if (startup.status === 'recovered') return { message: STORAGE_NOTICE.recovered }
  if (startup.status === 'read-only') {
    switch (startup.reason) {
      // 상위 버전 원본은 다시 연 새 버전 앱이 다시 읽어야 하므로 불러오기를 권하지 않는다
      case 'newer-version':
        return { message: STORAGE_NOTICE.newerVersion }
      case 'unreadable-original':
        return { message: STORAGE_NOTICE.unreadableOriginal, action: 'import-backup' }
      // 옮긴 기록은 보이므로 백업 파일로 먼저 챙기게 한다 (SPEC-005 지금 기록 옮기기)
      case 'old-version-unpreserved':
        return { message: STORAGE_NOTICE.oldVersionUnpreserved, action: 'send-backup' }
    }
  }
  return undefined
}

// 가드에 어긋난 저장(invalid-data)은 그 변경만 화면에 들이지 않아(useLedger) 다음 저장은 된다. 할 일이 없으니 버튼 없이 알리기만 한다.
// 기록 파일 보내기를 권하지 않는다: 앱 문제라 사용자가 챙길 것이 없고, 저장 실패 띠의 "앱을 닫으면 사라져요"와 다르다 (#172)
function saveFailureNotice(reason: SaveFailureReason): StorageNotice {
  if (reason === 'invalid-data') return { message: STORAGE_NOTICE.invalidData }
  return { message: STORAGE_NOTICE.saveFailed, action: 'send-backup' }
}

// 저장 실패 띠를 띄울 실패 이유. 없으면 띠가 없다.
// 저장을 막아 둔 상태(read-only)의 저장 실패는 시작 안내가 이미 이유를 말하므로 따로 띄우지 않는다.
// 띠가 뜨면 App 이 앱 오류 save 로 센다 (SPEC-012 2절, "저장하지 못했어요"·"앱에 문제가 있어" 띠 둘 다)
export function shownSaveFailure(startup: StartupStatus, saveFailure: SaveFailureReason | undefined): SaveFailureReason | undefined {
  return startup.status === 'read-only' ? undefined : saveFailure
}

// 화면 위에 띄울 안내, 위에서부터 순서대로
export function storageNotices(startup: StartupStatus, saveFailure: SaveFailureReason | undefined): StorageNotice[] {
  const failure = shownSaveFailure(startup, saveFailure)
  const notices = [startupNotice(startup), failure && saveFailureNotice(failure)]
  return notices.filter((notice) => notice !== undefined)
}
