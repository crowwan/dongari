// 엑셀 불러오기 화면 문구 (SPEC-010 8절 "읽은 내용 확인"·"예외와 경계 상황", #166).
// 작은 파일이라 첫 화면(기록 파일 불러오기 안내·읽는 중 화면)이 불러도 엑셀 읽기 코드가 따라오지 않는다
import type { SaveFailureReason } from '../../storage/LedgerRepository'
import type { ExcelFileProblem } from './excelFile'

// 제목 한 줄(화면 제목·확인 창 제목) + 다음에 할 일 한 줄
export interface ExcelMessage {
  title: string
  description: string
}

// 지금 앱에서 [기록 파일 불러오기]가 있는 자리 (#178 리뷰: 서버 주소 없는 빌드·첫 실행에는 "다른 방법으로 옮기기"가 없다)
// - first-run: 장부가 없는 첫 실행 화면 위쪽
// - settings: 설정 맨 위 기록 파일 카드 (서버 주소 없는 빌드·복구 코드 없음)
// - settings-more: 설정 › 다른 방법으로 옮기기 접기 안 (복구 코드 카드가 있는 빌드)
export type BackupFileRoute = 'first-run' | 'settings' | 'settings-more'

const BACKUP_FILE_WAY: Readonly<Record<BackupFileRoute, string>> = {
  'first-run': '위쪽 [기록 파일 불러오기]에서 열어 주세요',
  settings: '설정 › 기록 파일 불러오기에서 열어 주세요',
  'settings-more': '설정 › 다른 방법으로 옮기기 › 기록 파일 불러오기에서 열어 주세요',
}

// 엑셀 기능(SheetJS·엑셀 화면 조각)을 받지 못함: 불러오기·내보내기가 같이 쓴다. 파일 탓이 아니라 파일 이야기를 하지 않고,
// 한 번 실패한 동적 import 는 브라우저가 기억할 수 있어 파일을 다시 고르는 대신 앱을 다시 열게 한다 (#178 리뷰)
export const EXCEL_LOAD_FAILED: ExcelMessage = {
  title: '엑셀 기능을 받지 못했어요',
  description: '인터넷에 연결된 뒤 [앱 다시 열기]를 눌러 주세요',
}

// 고른 파일을 읽지 못한 이유별 안내
export function excelProblemMessage(problem: ExcelFileProblem, route: BackupFileRoute): ExcelMessage {
  switch (problem) {
    case 'too-large':
      return { title: '파일이 너무 커요', description: '5MB 까지 읽을 수 있어요' }
    case 'backup-file':
      return { title: '이 파일은 기록 파일이에요', description: BACKUP_FILE_WAY[route] }
    case 'not-excel':
      return { title: '엑셀 파일을 읽지 못했어요', description: '엑셀에서 다시 저장해 보세요' }
    case 'no-sheets':
      return {
        title: '읽을 수 있는 입출금내역 시트가 없어요',
        description: "2013년 이후 '2026년 입출금내역'처럼 이름 붙은 시트를 읽어요",
      }
    case 'load-failed':
      return EXCEL_LOAD_FAILED
  }
}

// 기록 파일 불러오기에서 엑셀 파일을 고른 경우 (반대 방향 안내)
export const EXCEL_IN_BACKUP_IMPORT: ExcelMessage = {
  title: '이 파일은 엑셀 파일이에요',
  description: '[엑셀 파일 불러오기]에서 열어 주세요',
}

// [새 장부 만들기]를 기기에 저장하지 못함 (저장 공간 부족 등, #178 리뷰). 장부를 만들지 않았으니 지금 기록은 그대로다
export const EXCEL_CREATE_FAILED = '장부를 만들지 못했어요. 이 폰에 저장하지 못해 지금 기록은 그대로예요'
// 저장 전 가드에 막힘(#172): 엑셀을 읽은 앱 쪽 문제라 저장 공간을 비우고 다시 해도 같다
export const EXCEL_CREATE_INVALID = '앱에 문제가 있어 장부를 만들지 못했어요. 지금 기록은 그대로예요'

export function excelCreateFailedMessage(reason: SaveFailureReason): string {
  return reason === 'invalid-data' ? EXCEL_CREATE_INVALID : EXCEL_CREATE_FAILED
}

export const EXCEL_READING_TITLE = '엑셀 파일을 읽는 중이에요'

// 처음 한 번은 SheetJS 조각을 받는다 (읽는 중·만드는 중 같이)
export const EXCEL_FIRST_LOAD_NOTE = '처음 한 번은 엑셀 기능을 받느라 조금 더 걸려요'

// 엑셀 내보내기 (SPEC-010 9절, #167)
export const EXCEL_EXPORT_WORDS = {
  making: '엑셀 파일을 만드는 중이에요',
  saved: '엑셀 파일을 저장했어요',
  sent: '엑셀 파일을 보냈어요',
  // 다운로드 폴더 (갤럭시 "내 파일" 앱에서 보이는 길)
  where: { main: '다운로드 폴더', sub: '내 파일 › 다운로드' },
  // 갤럭시 크롬·삼성 인터넷은 .xlsx 를 보내기 창에 넣지 않아 카톡에서 파일을 고르는 길을 알린다 (메뉴 이름은 실기기 QA AC-39)
  kakao: { title: '카톡으로 보내려면', description: '채팅방 [+] › 파일 › 다운로드에서 이 파일을 고르세요' },
  failed: { title: '엑셀 파일을 만들지 못했어요', description: '닫고 [엑셀 파일로 내보내기]를 다시 눌러 주세요' },
} as const
