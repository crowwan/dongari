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

// 연도별 장부 1개. 이름은 장부(Book)에 하나만 둔다 (v3, SPEC-005)
export interface Ledger {
  year: number
  carryover: number // 전년도 이월금 (적자면 음수)
  entries: Entry[]
}

// 장부 종류 (SPEC-005): 동아리·모임 / 개인 가계부. 처음 보여 줄 기본 항목과 몇몇 문구만 다르다
export type BookKind = 'club' | 'household'

// 장부 하나 = 이름 + 종류 + 연도별 기록 (SPEC-005)
export interface Book {
  id: string
  name: string
  kind: BookKind
  ledgers: Record<string, Ledger> // 키: 연도 문자열 ("2026")
  createdAt: string // ISO 8601
}

// 앱 설정. 필요한 항목은 이후 이슈에서 선택 필드로 늘린다
export interface Settings {
  lastBackupAt?: string // ISO 8601
  lastChangedAt?: string // ISO 8601
  lastBookId?: string // 마지막에 본 장부. 앱을 열면 이 장부가 열린다 (SPEC-005 AC-2)
}

export const CURRENT_SCHEMA_VERSION = 3

// 저장소 키 `dongari:v2` 에 들어가는 전체 데이터 (키 이름은 v3 에서도 그대로, ADR 001)
export interface StoredData {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION
  books: Book[] // 만든 순
  settings: Settings
}
