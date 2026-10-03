// v2 거래 기록 모델 (docs/prd.md 데이터 모델)

export type EntryType = 'income' | 'expense'

// 장부 한 줄. 월별 합계·지출 상세·수입내역은 entries 에서 계산하고 저장하지 않는다
export interface Entry {
  id: string
  month: number // 1~12
  type: EntryType
  name: string
  amount: number
  createdAt: string // ISO 8601
  batchId?: string // 사진으로 함께 넣은 묶음 (되돌리기용)
}

// 연도별 장부 1개
export interface Ledger {
  year: number
  clubName: string
  carryover: number // 전년도 이월금
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
