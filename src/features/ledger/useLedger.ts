// 장부 상태 훅 (SPEC-001). 저장소(SPEC-002)를 감싸 현재 연도 장부와 바꾸는 동작을 준다
import { useRef, useState } from 'react'
import {
  addEntry as addEntryTo,
  calculateTotals,
  createLedger,
  deleteEntry as deleteEntryFrom,
  frequentNames as pickFrequentNames,
  newLedgerDefaults as defaultsFor,
  updateEntry as updateEntryIn,
  updateLedgerInfo,
  type EntryInput,
  type LedgerInfo,
  type LedgerTotals,
} from '../../domain/ledger'
import type { EntryType, Ledger, StoredData } from '../../domain/types'
import type { LedgerRepository, LoadResult, ReadOnlyReason, SaveFailureReason } from '../../storage/LedgerRepository'

export interface UseLedgerOptions {
  now?: () => Date // 기본 연도·입력 시각·변경 시각 (기본: 지금)
  createId?: () => string // 기록 id (기본: crypto.randomUUID)
}

// 앱 시작 때 저장소 상태. 화면이 시작 안내를 고르는 데 쓴다 (SPEC-002)
export type StartupStatus = { status: 'ok' } | { status: 'recovered' } | { status: 'read-only'; reason: ReadOnlyReason }

export interface LedgerState {
  year: number
  years: number[] // 장부가 있는 연도, 최신 순
  ledger: Ledger | undefined // 이 연도 장부. 아직 없으면 undefined
  totals: LedgerTotals | undefined
  isFirstRun: boolean // 장부가 하나도 없다
  newLedgerDefaults: LedgerInfo // 이 연도 장부를 새로 만들 때 기본값 (AC-8)
  startup: StartupStatus
  saveFailure: SaveFailureReason | undefined // 마지막 저장이 실패했으면 그 이유
  frequentNames: (type: EntryType) => string[]
  startLedger: (info: LedgerInfo) => void
  addEntry: (input: EntryInput) => void
  updateEntry: (id: string, input: EntryInput) => void
  deleteEntry: (id: string) => void
  updateClubInfo: (info: LedgerInfo) => void
  changeYear: (year: number) => void
}

function toStartupStatus(result: LoadResult): StartupStatus {
  return result.status === 'read-only' ? { status: 'read-only', reason: result.reason } : { status: result.status }
}

// 지난 연도부터 입력 순으로 모은 전체 기록 (자주 쓴 항목은 해가 바뀌어도 이어진다)
function allEntriesOldestFirst(data: StoredData) {
  return Object.values(data.ledgers)
    .sort((a, b) => a.year - b.year)
    .flatMap((item) => item.entries)
}

export function useLedger(repository: LedgerRepository, options: UseLedgerOptions = {}): LedgerState {
  const now = options.now ?? (() => new Date())
  const createId = options.createId ?? (() => crypto.randomUUID())

  // StrictMode 에서 초기화 함수가 두 번 불려도 React 는 첫 결과를 쓴다
  const [loaded] = useState(() => repository.load())
  const [data, setData] = useState(loaded.data)
  const [year, setYear] = useState(() => now().getFullYear())
  const [saveFailure, setSaveFailure] = useState<SaveFailureReason | undefined>()
  // 같은 이벤트 안에서 여러 번 바꿔도 앞 변경을 잃지 않게 최신 데이터를 따로 들고 있는다
  const latest = useRef(loaded.data)

  // 모든 변경은 즉시 저장한다. 실패해도 화면 데이터는 바뀐 대로 두고 이유를 알린다
  function commit(change: (current: StoredData) => StoredData) {
    const changed = change(latest.current)
    const next: StoredData = { ...changed, settings: { ...changed.settings, lastChangedAt: now().toISOString() } }
    latest.current = next
    setData(next)
    const result = repository.save(next)
    setSaveFailure(result.ok ? undefined : result.reason)
  }

  function changeLedger(change: (ledger: Ledger) => Ledger) {
    commit((current) => {
      const ledger = current.ledgers[String(year)]
      if (!ledger) throw new Error(`${year}년 장부가 없다`)
      return { ...current, ledgers: { ...current.ledgers, [String(year)]: change(ledger) } }
    })
  }

  const ledger = data.ledgers[String(year)]

  return {
    year,
    years: Object.values(data.ledgers)
      .map((item) => item.year)
      .sort((a, b) => b - a),
    ledger,
    totals: ledger && calculateTotals(ledger),
    isFirstRun: Object.keys(data.ledgers).length === 0,
    newLedgerDefaults: defaultsFor(data.ledgers, year),
    startup: toStartupStatus(loaded),
    saveFailure,
    frequentNames: (type) => pickFrequentNames(allEntriesOldestFirst(data), type),
    startLedger: (info) =>
      commit((current) => {
        if (current.ledgers[String(year)]) throw new Error(`${year}년 장부가 이미 있다`)
        return { ...current, ledgers: { ...current.ledgers, [String(year)]: createLedger(year, info) } }
      }),
    addEntry: (input) => changeLedger((item) => addEntryTo(item, input, { createId, now })),
    updateEntry: (id, input) => changeLedger((item) => updateEntryIn(item, id, input)),
    deleteEntry: (id) => changeLedger((item) => deleteEntryFrom(item, id)),
    updateClubInfo: (info) => changeLedger((item) => updateLedgerInfo(item, info)),
    changeYear: setYear,
  }
}
