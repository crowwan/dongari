// 엑셀 불러오기 화면 문구 (SPEC-010 8절 "읽은 내용 확인"·"예외와 경계 상황", #166).
// 작은 파일이라 첫 화면(기록 파일 불러오기 안내·읽는 중 화면)이 불러도 엑셀 읽기 코드가 따라오지 않는다
import type { ExcelFileProblem } from './excelFile'

// 제목 한 줄(화면 제목·확인 창 제목) + 다음에 할 일 한 줄
export interface ExcelMessage {
  title: string
  description: string
}

// 고른 파일을 읽지 못한 이유별 안내. 파일 탓이 아닌 load-failed 는 파일 이야기를 하지 않는다
export const EXCEL_PROBLEM_MESSAGES: Readonly<Record<ExcelFileProblem, ExcelMessage>> = {
  'too-large': { title: '파일이 너무 커요', description: '5MB 까지 읽을 수 있어요' },
  'backup-file': {
    title: '이 파일은 기록 파일이에요',
    description: '설정 › 다른 방법으로 옮기기 › 기록 파일 불러오기에서 열어 주세요',
  },
  'not-excel': { title: '엑셀 파일을 읽지 못했어요', description: '엑셀에서 다시 저장해 보세요' },
  'no-sheets': {
    title: '읽을 수 있는 입출금내역 시트가 없어요',
    description: "2013년 이후 '2026년 입출금내역'처럼 이름 붙은 시트를 읽어요",
  },
  'load-failed': { title: '엑셀 기능을 받지 못했어요', description: '인터넷에 연결된 뒤 다시 해 주세요' },
}

// 기록 파일 불러오기에서 엑셀 파일을 고른 경우 (반대 방향 안내)
export const EXCEL_IN_BACKUP_IMPORT: ExcelMessage = {
  title: '이 파일은 엑셀 파일이에요',
  description: '[엑셀 파일 불러오기]에서 열어 주세요',
}

export const EXCEL_READING_TITLE = '엑셀 파일을 읽는 중이에요'
