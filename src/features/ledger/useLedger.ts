// 장부 상태 훅 (SPEC-001). 저장소(SPEC-002)를 감싸 지금 장부(SPEC-005)의 현재 연도 장부와 바꾸는 동작을 준다.
// 지금 장부는 저장 데이터의 마지막에 본 장부(settings.lastBookId)다 — 장부를 바꾸려면 그 값을 바꿔 저장한다
import { useRef, useState } from 'react'
import { currentBook } from '../../domain/book'
import {
  addEntry as addEntryTo,
  calculateTotals,
  createLedger,
  deleteEntry as deleteEntryFrom,
  firstVisibleMonth,
  frequentChoices as pickFrequentChoices,
  lastUsedType as findLastUsedType,
  newLedgerDefaults as defaultsFor,
  updateCarryover,
  updateEntry as updateEntryIn,
  type EntryInput,
  type FrequentChoice,
  type LedgerInfo,
  type LedgerTotals,
} from '../../domain/ledger'
import type { Book, EntryType, Ledger, StoredData } from '../../domain/types'
import type {
  LedgerRepository,
  LoadResult,
  ReadOnlyReason,
  SaveFailureReason,
  SaveResult,
} from '../../storage/LedgerRepository'

export interface UseLedgerOptions {
  now?: () => Date // 기본 연도·입력 시각·변경 시각 (기본: 지금)
  createId?: () => string // 기록·장부 id (기본: crypto.randomUUID)
}

// 앱 시작 때 저장소 상태. 화면이 시작 안내를 고르는 데 쓴다 (SPEC-002)
export type StartupStatus = { status: 'ok' } | { status: 'recovered' } | { status: 'read-only'; reason: ReadOnlyReason }

export interface LedgerState {
  book: Book | undefined // 지금 장부. 아직 없으면(첫 실행) undefined
  year: number
  years: number[] // 지금 장부에 연도별 장부가 있는 연도, 최신 순
  yearChoices: number[] // 설정에서 고를 수 있는 연도: 장부가 있는 연도 + 올해, 최신 순
  ledger: Ledger | undefined // 이 연도 장부. 아직 없으면 undefined
  totals: LedgerTotals | undefined
  firstMonth: number // 장부 화면에 처음 보이는 달: 올해면 이번 달, 지난 연도면 12월
  isFirstRun: boolean // 장부가 하나도 없다 (첫 실행 화면)
  newLedgerDefaults: LedgerInfo // 이 연도 장부를 새로 만들 때 기본값 (AC-8)
  startup: StartupStatus
  saveFailure: SaveFailureReason | undefined // 마지막 저장이 실패했으면 그 이유
  data: StoredData // 모든 장부의 기록 전체 (백업 파일 내용)
  // 자주 쓴 항목 버튼 (지금 장부 기록에서): 종류를 고르기 전(type 없음)엔 두 종류를 섞어서
  frequentChoices: (type?: EntryType) => FrequentChoice[]
  // 직접 적은 이름을 예전에 쓴 종류. 처음 쓰는 이름이면 undefined (AC-15)
  lastUsedType: (name: string) => EntryType | undefined
  // 이 연도 장부를 시작한다. 장부가 없으면(첫 실행) 동아리·모임 장부를 만들어 지금 장부로 정한다
  startLedger: (info: LedgerInfo) => void
  addEntry: (input: EntryInput) => boolean // 저장에 성공했는지 (성공일 때만 "저장했어요" 를 띄운다)
  updateEntry: (id: string, input: EntryInput) => boolean // 저장에 성공했는지 (성공일 때만 "고쳤어요")
  deleteEntry: (id: string) => boolean // 저장에 성공했는지 (성공일 때만 "지웠어요")
  updateClubInfo: (info: LedgerInfo) => boolean // 장부 이름·이 연도 이월금. 저장에 성공했는지 (성공일 때만 알림을 띄운다)
  changeYear: (year: number) => void
  // 백업 파일 데이터로 통째로 바꾼다 (SPEC-002). 저장에 성공했을 때만 화면을 바꾸고 올해 장부로 연다
  restoreBackup: (data: StoredData) => SaveResult
  // 백업 파일을 보냈다고 기록한다 (마지막 백업 시각, 백업 안내 #9 가 쓴다). 저장에 성공했는지
  recordBackup: () => boolean
}

function toStartupStatus(result: LoadResult): StartupStatus {
  return result.status === 'read-only' ? { status: 'read-only', reason: result.reason } : { status: result.status }
}

// 한 장부의 지난 연도부터 입력 순으로 모은 기록 (자주 쓴 항목은 해가 바뀌어도 이어지고, 다른 장부와는 섞이지 않는다)
function entriesOldestFirst(book: Book | undefined) {
  return Object.values(book?.ledgers ?? {})
    .sort((a, b) => a.year - b.year)
    .flatMap((item) => item.entries)
}

// 장부 하나를 바꾼 저장 데이터
function replaceBook(data: StoredData, book: Book): StoredData {
  return { ...data, books: data.books.map((item) => (item.id === book.id ? book : item)) }
}

function withLedger(book: Book, ledger: Ledger): Book {
  return { ...book, ledgers: { ...book.ledgers, [String(ledger.year)]: ledger } }
}

// loaded: 진입점(main.tsx)이 앱 시작 때 한 번 읽은 결과. 읽기는 부작용(깨진 원본 옮기기)이 있어 렌더 중에 하지 않는다
export function useLedger(repository: LedgerRepository, loaded: LoadResult, options: UseLedgerOptions = {}): LedgerState {
  const now = options.now ?? (() => new Date())
  const createId = options.createId ?? (() => crypto.randomUUID())

  const [data, setData] = useState(loaded.data)
  const [year, setYear] = useState(() => now().getFullYear())
  const [saveFailure, setSaveFailure] = useState<SaveFailureReason | undefined>()
  // 시작 상태. 백업 파일을 불러오면 시작 때의 문제(깨진 기록·저장 막힘)가 풀려 ok 가 된다
  const [startup, setStartup] = useState(() => toStartupStatus(loaded))
  // 같은 이벤트 안에서 여러 번 바꿔도 앞 변경을 잃지 않게 최신 데이터를 따로 들고 있는다
  const latest = useRef(loaded.data)

  // 모든 변경은 즉시 저장한다. 실패해도 화면 데이터는 바뀐 대로 두고 이유를 알린다. 저장 성공 여부를 돌려준다
  function commit(change: (current: StoredData) => StoredData): boolean {
    const changed = change(latest.current)
    const next: StoredData = { ...changed, settings: { ...changed.settings, lastChangedAt: now().toISOString() } }
    latest.current = next
    setData(next)
    const result = repository.save(next)
    setSaveFailure(result.ok ? undefined : result.reason)
    return result.ok
  }

  // 변경 시각을 건드리지 않고 그대로 저장한다 (백업 불러오기·백업 시각 기록)
  function replace(next: StoredData, save: (data: StoredData) => SaveResult): SaveResult {
    const result = save(next)
    if (result.ok) {
      latest.current = next
      setData(next)
      setSaveFailure(undefined)
    }
    return result
  }

  // 지금 장부의 이 연도 장부를 바꾼다
  function changeLedger(change: (ledger: Ledger, book: Book) => Book): boolean {
    return commit((current) => {
      const target = currentBook(current)
      const ledger = target?.ledgers[String(year)]
      if (!target || !ledger) throw new Error(`${year}년 장부가 없다`)
      return replaceBook(current, change(ledger, target))
    })
  }

  function changeEntries(change: (ledger: Ledger) => Ledger): boolean {
    return changeLedger((ledger, target) => withLedger(target, change(ledger)))
  }

  // 장부가 없으면(첫 실행) 동아리·모임 장부를 새로 만들어 지금 장부로 정한다 (SPEC-005: 첫 실행에 만들어지는 장부는 동아리 하나)
  function startFirstBook(current: StoredData, info: LedgerInfo): StoredData {
    const created: Book = {
      id: createId(),
      name: info.name.trim(),
      kind: 'club',
      ledgers: { [String(year)]: createLedger(year, info.carryover) },
      createdAt: now().toISOString(),
    }
    return { ...current, books: [...current.books, created], settings: { ...current.settings, lastBookId: created.id } }
  }

  const book = currentBook(data)
  const ledger = book?.ledgers[String(year)]
  const years = Object.values(book?.ledgers ?? {})
    .map((item) => item.year)
    .sort((a, b) => b - a)

  return {
    book,
    year,
    years,
    yearChoices: [...new Set([...years, now().getFullYear()])].sort((a, b) => b - a),
    ledger,
    totals: ledger && calculateTotals(ledger),
    firstMonth: firstVisibleMonth(year, now()),
    isFirstRun: book === undefined,
    newLedgerDefaults: defaultsFor(book, year),
    startup,
    saveFailure,
    data,
    frequentChoices: (type) => pickFrequentChoices(entriesOldestFirst(book), type),
    lastUsedType: (name) => findLastUsedType(entriesOldestFirst(book), name),
    startLedger: (info) =>
      commit((current) => {
        const target = currentBook(current)
        if (!target) return startFirstBook(current, info)
        if (target.ledgers[String(year)]) throw new Error(`${year}년 장부가 이미 있다`)
        // 새 연도를 시작할 때 고친 이름은 장부 이름이 된다 (이름은 장부에 하나)
        return replaceBook(current, withLedger({ ...target, name: info.name.trim() }, createLedger(year, info.carryover)))
      }),
    addEntry: (input) => changeEntries((item) => addEntryTo(item, input, { createId, now })),
    updateEntry: (id, input) => changeEntries((item) => updateEntryIn(item, id, input)),
    deleteEntry: (id) => changeEntries((item) => deleteEntryFrom(item, id)),
    updateClubInfo: (info) =>
      changeLedger((item, target) => withLedger({ ...target, name: info.name.trim() }, updateCarryover(item, info.carryover))),
    changeYear: setYear,
    restoreBackup: (backup) => {
      // 저장하지 못하면 지금 기록을 그대로 둔다: 불러온 것처럼 보였다가 새로고침 때 사라지지 않게
      const result = replace(backup, (next) => repository.restore(next))
      if (result.ok) {
        setYear(now().getFullYear())
        setStartup({ status: 'ok' })
      }
      return result
    },
    recordBackup: () => {
      const next: StoredData = {
        ...latest.current,
        settings: { ...latest.current.settings, lastBackupAt: now().toISOString() },
      }
      return replace(next, (changed) => repository.save(changed)).ok
    },
  }
}
