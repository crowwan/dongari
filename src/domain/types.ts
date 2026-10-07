// v2 거래 기록 모델 (docs/prd.md 데이터 모델)

export type EntryType = 'income' | 'expense'

// 기록 한 줄 금액 상한 (원). 금액은 1 ~ 이 값 사이의 정수. 입력칸(src/ui/money.ts)도 이 값으로 자른다
export const ENTRY_AMOUNT_MAX = 999_999_999

// 장부 한 줄. 월별 합계·지출 상세·수입내역은 entries 에서 계산하고 저장하지 않는다
export interface Entry {
  id: string
  month: number // 1~12
  // 며칠 (1 ~ 그 달 마지막 날, 장부 연도 윤년 반영, v2.2). 새로 적는 내역은 늘 있고, 그 전에 적은 예전 기록에는 없다
  day?: number
  type: EntryType
  name: string
  amount: number // 1 ~ ENTRY_AMOUNT_MAX 정수
  createdAt: string // ISO 8601
  batchId?: string // 사진으로 함께 넣은 묶음 (되돌리기용)
}

// 연도별 장부 1개
export interface Ledger {
  year: number
  clubName: string
  carryover: number // 전년도 이월금 (적자면 음수)
  entries: Entry[]
}

// 앱 설정. 필요한 항목은 이후 이슈에서 선택 필드로 늘린다
export interface Settings {
  lastBackupAt?: string // ISO 8601
  lastChangedAt?: string // ISO 8601
}

export const CURRENT_SCHEMA_VERSION = 2

// 저장소 키 `dongari:v2` 에 들어가는 전체 데이터
export interface StoredData {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION
  ledgers: Record<string, Ledger> // 키: 연도 문자열 ("2026")
  settings: Settings
}
