// v2 거래 기록 모델 (docs/prd.md 데이터 모델)

export type EntryType = 'income' | 'expense'

// 기록 한 줄 금액 상한 (원). 금액은 1 ~ 이 값 사이의 정수. 입력칸(src/ui/money.ts)도 이 값으로 자른다
export const ENTRY_AMOUNT_MAX = 999_999_999

// 달 하나 'YYYY-MM' ("2026-03"). 회원이 들어온 달·그만둔 달·쉬는 달, 회비 표 시작 달 (SPEC-010 1절)
export type YearMonth = string

// 회비 기록 하나에 돈을 낸 회원 한 분과 그분 몫 (SPEC-010 "낸 분"). 회원은 이름이 아니라 번호로 가리킨다
export interface Payer {
  memberId: string // 그 장부 회원 명단의 Member.id
  amount: number // 1 이상 정수. 한 기록의 낸 분 금액 합 = 기록 금액
}

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
  // 낸 분 (SPEC-010 1절, v4). 비어 있지 않고, 같은 회원 두 번 없고, 그 장부 명단에 있는 회원만. 없으면 낸 분을 안 적은 기록
  payers?: Payer[]
  sourceText?: string // 엑셀에 적혀 있던 글 (SPEC-010 8절, 엑셀에서 불러온 기록만)
}

// 연도별 장부 1개. 이름은 장부(Book)에 하나만 둔다 (v3, SPEC-005)
export interface Ledger {
  year: number
  carryover: number // 전년도 이월금 (적자면 음수)
  entries: Entry[]
  // 월 회비: 한 분이 한 달에 내는 돈, 해마다 하나 (SPEC-010 1절, v4). 1 ~ ENTRY_AMOUNT_MAX 정수. 없으면 그 전 해의 월 회비를 쓴다
  monthlyFee?: number
}

// 장부 종류 (SPEC-005): 동아리·모임 / 개인 가계부. 처음 보여 줄 기본 항목과 몇몇 문구만 다르다
export type BookKind = 'club' | 'household'

// 회비 표에 나오는 회원 한 분 (SPEC-010 1절, v4)
export interface Member {
  id: string // 바뀌지 않는 번호. 이름을 바꿔도 낸 분 기록과 끊어지지 않고, 같은 이름의 두 분도 따로다
  name: string
  joined: YearMonth // 들어온 달
  left?: YearMonth // 그만둔 달. 그 달부터 회원이 아니다 (그만둔 분도 명단에 남는다)
  off: YearMonth[] // 쉬는 달
  // 시작할 때 남은 돈: 회비 표 시작 달 앞까지의 셈. 양수 = 미리 낸 돈, 음수 = 덜 낸 돈 (정수). 없으면 0
  opening?: number
}

// 장부의 회비 표 값 (SPEC-010 1절, v4). 회원 명단을 처음 넣을 때 생긴다
export interface BookDues {
  startMonth: YearMonth // 회비 표 시작 달
  hideUnassigned?: boolean // "낸 분을 안 적은 회비" 카드 숨김 (SPEC-010 7절)
}

// 장부 하나 = 이름 + 종류 + 연도별 기록 (SPEC-005)
export interface Book {
  id: string
  name: string
  kind: BookKind
  ledgers: Record<string, Ledger> // 키: 연도 문자열 ("2026")
  createdAt: string // ISO 8601
  // 회원 명단과 회비 표 값 (SPEC-010, v4). 동아리·모임 장부에서 생기고, 가계부로 바꿔도 지우지 않고 숨긴다(SPEC-010 6절)
  members?: Member[]
  dues?: BookDues
}

// 앱 설정. 필요한 항목은 이후 이슈에서 선택 필드로 늘린다
export interface Settings {
  lastBackupAt?: string // ISO 8601
  lastChangedAt?: string // ISO 8601
  lastBookId?: string // 마지막에 본 장부. 앱을 열면 이 장부가 열린다 (SPEC-005 AC-2)
  // 복구 코드 "HK7M-29QF-MX4P-8R2D" (SPEC-006). 첫 장부를 만들 때(또는 이 칸이 생긴 버전을 처음 열 때) 생긴다.
  // 백업 파일에도 들어가 파일로 옮겨도 같은 보관 자리를 쓴다. 선택 칸이라 schemaVersion 은 그대로 (ADR 001)
  recoveryCode?: string
}

// v4 (SPEC-010): 회원 명단·월 회비·낸 분. 선택 칸이지만 옛 앱이 고쳐 저장하면 낸 분이 조용히 빠져 번호를 올렸다 (ADR 001 "v4")
export const CURRENT_SCHEMA_VERSION = 4

// 저장소 키 `dongari:v2` 에 들어가는 전체 데이터 (키 이름은 v3·v4 에서도 그대로, ADR 001)
export interface StoredData {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION
  books: Book[] // 만든 순
  settings: Settings
}
