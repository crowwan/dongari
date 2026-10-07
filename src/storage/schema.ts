// 저장 데이터 런타임 검증. 외부에서 들어온 값(localStorage, 백업 파일)은 이 가드를 통과해야 타입을 얻는다
import { isDayInMonth } from '../domain/entryDate'
import {
  CURRENT_SCHEMA_VERSION,
  ENTRY_AMOUNT_MAX,
  type Entry,
  type Ledger,
  type Settings,
  type StoredData,
} from '../domain/types'

export function createEmptyData(): StoredData {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, ledgers: {}, settings: {} }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

// 날짜(일)는 없어도 된다(v2.2 전 예전 기록). 있으면 1~31 정수 — 그 달 마지막 날은 장부 연도를 아는 isLedger 가 본다
function isOptionalDay(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31)
}

export function isEntry(value: unknown): value is Entry {
  if (!isRecord(value)) return false
  const { id, month, day, type, name, amount, createdAt, batchId } = value
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof month === 'number' &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    isOptionalDay(day) &&
    (type === 'income' || type === 'expense') &&
    typeof name === 'string' &&
    typeof amount === 'number' &&
    Number.isInteger(amount) &&
    amount > 0 &&
    amount <= ENTRY_AMOUNT_MAX &&
    typeof createdAt === 'string' &&
    isOptionalString(batchId)
  )
}

// 기록의 날짜가 장부 연도의 그 달 안인가 (4월 31일, 윤년이 아닌 해 2월 29일은 없는 날)
function isEntryOfYear(year: number) {
  return (value: unknown): value is Entry =>
    isEntry(value) && (value.day === undefined || isDayInMonth(year, value.month, value.day))
}

export function isLedger(value: unknown): value is Ledger {
  if (!isRecord(value)) return false
  const { year, clubName, carryover, entries } = value
  return (
    typeof year === 'number' &&
    Number.isInteger(year) &&
    typeof clubName === 'string' &&
    typeof carryover === 'number' &&
    Number.isFinite(carryover) &&
    Array.isArray(entries) &&
    entries.every(isEntryOfYear(year))
  )
}

export function isSettings(value: unknown): value is Settings {
  return isRecord(value) && isOptionalString(value.lastBackupAt) && isOptionalString(value.lastChangedAt)
}

// 장부 키는 연도 문자열이고, 안의 year 와 같아야 한다
function isLedgerMap(value: unknown): value is Record<string, Ledger> {
  return isRecord(value) && Object.entries(value).every(([key, ledger]) => isLedger(ledger) && key === String(ledger.year))
}

export function isStoredData(value: unknown): value is StoredData {
  return (
    isRecord(value) &&
    value.schemaVersion === CURRENT_SCHEMA_VERSION &&
    isLedgerMap(value.ledgers) &&
    isSettings(value.settings)
  )
}
