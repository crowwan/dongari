import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { keepIdOf as appKeepIdOf, sealKeep } from '../src/features/keep/keepCrypto'
import { CURRENT_SCHEMA_VERSION as APP_SCHEMA_VERSION, type Entry, type Ledger, type StoredData } from '../src/domain/types'
import { createBackup } from '../src/storage/backup'
import { book, duesBook, ledger, storedWith } from '../src/test/ledgerFixtures'
import {
  APP_ORIGIN,
  GONE_COPY,
  INVALID_CODE,
  isRecord,
  NO_HISTORY_ROUTE,
  NOT_BACKUP,
  NOT_FOUND,
  SERVER_DOWN,
  type FetchFn,
  type KeepEnvelope,
} from './keepRescue.ts'
import {
  BAD_QUERY,
  BROKEN_DEVICE_NAMES,
  buildTables,
  compareCopies,
  compareMoreText,
  copyPath,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PORT,
  defaultPair,
  ENTRY_FIELDS,
  entryFill,
  envelopePreview,
  fitTableFilter,
  handleRequest,
  historyPath,
  isAllowedHost,
  listDevices,
  localAnswer,
  mergeDevices,
  NO_DEVICE_NAMES,
  NO_KEEP_URL,
  noCloneNotice,
  NOT_THIS_DEVICE,
  openByCode,
  openCopy,
  openedInfo,
  outerInfo,
  parseViewArgs,
  queryTable,
  SERVER_ERROR,
  staleCloneNotice,
  storedTree,
  strangeLocalAnswer,
  tableChoices,
  unlockDevice,
  won,
  type CopyAnswer,
  type CopyItem,
  type CopyRef,
  type DevicesAnswer,
  type DeviceView,
  type GitFn,
  type HistoryAnswer,
  type StoredView,
  type TableKey,
  type TableQuery,
  type ViewServer,
  type ViewSources,
  type ViewTable,
} from './keepView.ts'

// 모두 지어낸 코드·장부다 (실제 기기·서버·백업 레포는 쓰지 않는다)
const CODE_A = 'HK7M-29QF-MX4P-8R2D' // 예시 폰 A
const CODE_B = 'P4WN-7XKD-3MQA-9TJE' // 예시 폰 B
const CODE_C = 'Q7RT-5ZWX-K2MN-8HJF' // 지난 주간 사본 뒤 목록에서 빠진 기기 (코드로 열기)
const CODE_D = 'W8XY-3ABC-7DEF-2GHJ' // 어디에도 없는 기기
const KEEP_URL = 'https://keep.example.workers.dev'
const PORT = DEFAULT_PORT
const HOST = `127.0.0.1:${PORT}`
// 한국 시간 2026-11-26 09:00
const NOW = Date.parse('2026-11-26T00:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

const WEEK_1 = '2026-11-16T08:03:00+09:00'
const WEEK_2 = '2026-11-23T08:04:00+09:00'
const LATEST_AT = '2026-11-25T21:40:00.000Z'
const DAY_AT = '2026-11-24T13:12:00.000Z'
const MONTH_AT = '2026-10-28T11:00:00.000Z'

function clubData(code: string, name: string): StoredData {
  return {
    ...storedWith(),
    books: [book([ledger([[3, 'income', '회비', 10_000], [3, 'expense', '간식', 5_000]], { year: 2026 })], { id: 'a', name })],
    settings: { recoveryCode: code },
  }
}

// 앱의 자동 보관기가 올리는 것과 같은 보관본 (기록 파일 글자를 앱의 sealKeep 으로)
function seal(code: string, data: StoredData, savedAt: string): Promise<KeepEnvelope> {
  return sealKeep(code, createBackup(data, new Date(savedAt)).text, savedAt)
}

// 백업 레포 파일 모양: 겉봉투 JSON 한 줄 + 줄바꿈 (ops/keep-backup backupPlan)
function fileText(envelope: KeepEnvelope): string {
  return `${JSON.stringify(envelope)}\n`
}

function bytesOf(text: string): number {
  return new TextEncoder().encode(text).length
}

// ---------- 임시 백업 레포 ----------

const tempDirs: string[] = []

function gitIn(dir: string, args: readonly string[], at?: string): string {
  const env = at === undefined ? process.env : { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at }
  return execFileSync(
    'git',
    ['-c', 'user.name=시험', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: dir, encoding: 'utf8', env },
  )
}

interface RepoCommit {
  at: string
  // 경로 → 내용 (null 이면 지움)
  files: Record<string, string | null>
}

// 주간 워크플로가 만든 것처럼 커밋을 쌓은 임시 git 레포. 커밋 해시들을 같이 준다 (넣은 순서)
function makeBackupRepo(commits: readonly RepoCommit[]): { dir: string; hashes: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'keep-view-'))
  tempDirs.push(dir)
  gitIn(dir, ['init', '-q', '-b', 'main'])
  const hashes = commits.map(({ at, files }) => {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) rmSync(join(dir, path))
      else {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), text)
      }
    }
    gitIn(dir, ['add', '-A'])
    gitIn(dir, ['commit', '-q', '-m', `주간 보관본 ${at.slice(0, 10)}`], at)
    return gitIn(dir, ['rev-parse', 'HEAD']).trim()
  })
  return { dir, hashes }
}

interface GitCall {
  args: readonly string[]
  input?: string
}

// keep-view.mjs 와 같은 방식으로 그 레포에서 git 을 돌린다. 부른 인자를 적어 둔다
function gitRunner(dir: string): { git: GitFn; calls: GitCall[] } {
  const calls: GitCall[] = []
  const git: GitFn = (args, input) => {
    calls.push({ args, input })
    return new Promise((done) => {
      const child = execFile('git', ['-C', dir, ...args], { encoding: 'utf8' }, (error, stdout) => done(error ? undefined : stdout))
      // git 이 표준 입력을 읽기 전에 끝나면 쓰기가 EPIPE 로 실패한다 (keep-view.mjs 와 같게 삼킨다)
      child.stdin?.on('error', () => {})
      child.stdin?.end(input)
    })
  }
  return { git, calls }
}

// ---------- 가짜 보관 서버 ----------

interface SentRequest {
  url: string
  method: string
  headers: Record<string, string>
}

// 주소(KEEP_URL 뒤)별 답. 표에 없는 주소는 404. 받은 요청을 적어 둔다
function fakeKeep(routes: Record<string, unknown>): { fetchFn: FetchFn; sent: SentRequest[] } {
  const sent: SentRequest[] = []
  const fetchFn: FetchFn = (url, init) => {
    sent.push({ url, method: init.method, headers: init.headers })
    const path = url.slice(KEEP_URL.length)
    const found = Object.hasOwn(routes, path)
    return Promise.resolve(found ? new Response(JSON.stringify(routes[path])) : new Response(null, { status: 404 }))
  }
  return { fetchFn, sent }
}

const unreachable: FetchFn = () => Promise.reject(new TypeError('fetch failed'))

// ---------- 지어낸 기기 셋 ----------

interface World {
  idA: string
  idB: string
  idC: string
  idD: string
  repo: { dir: string; hashes: string[] }
  envelopes: { latestA: KeepEnvelope; dayA: KeepEnvelope; monthA: KeepEnvelope; week1A: KeepEnvelope; week2A: KeepEnvelope; weekB: KeepEnvelope; weekC: KeepEnvelope; latestC: KeepEnvelope }
  routes: Record<string, unknown>
}

let world: World

beforeAll(async () => {
  const [idA, idB, idC, idD] = await Promise.all([CODE_A, CODE_B, CODE_C, CODE_D].map((code) => appKeepIdOf(code)))
  const envelopes = {
    latestA: await seal(CODE_A, clubData(CODE_A, '꽃동아리'), LATEST_AT),
    dayA: await seal(CODE_A, clubData(CODE_A, '꽃동아리'), DAY_AT),
    monthA: await seal(CODE_A, clubData(CODE_A, '꽃동아리'), MONTH_AT),
    week1A: await seal(CODE_A, clubData(CODE_A, '꽃동아리'), '2026-11-15T10:00:00.000Z'),
    week2A: await seal(CODE_A, clubData(CODE_A, '꽃동아리'), '2026-11-22T10:00:00.000Z'),
    weekB: await seal(CODE_B, clubData(CODE_B, '새봄 산악회'), '2026-11-21T01:30:00.000Z'),
    weekC: await seal(CODE_C, clubData(CODE_C, '다른 모임'), '2026-11-14T03:00:00.000Z'),
    latestC: await seal(CODE_C, clubData(CODE_C, '다른 모임'), '2026-11-25T05:00:00.000Z'),
  }
  // 1주: A·C, 2주: A 바뀜·B 생김·C 지움([지우기]), 기기 이름표는 A 만
  const repo = makeBackupRepo([
    {
      at: WEEK_1,
      files: {
        [`keep/${idA}.json`]: fileText(envelopes.week1A),
        [`keep/${idC}.json`]: fileText(envelopes.weekC),
        'index.json': JSON.stringify([{ id: idA }, { id: idC }]),
      },
    },
    {
      at: WEEK_2,
      files: {
        [`keep/${idA}.json`]: fileText(envelopes.week2A),
        [`keep/${idB}.json`]: fileText(envelopes.weekB),
        [`keep/${idC}.json`]: null,
        'index.json': JSON.stringify([{ id: idA, savedAt: '2026-11-22T10:00:00.000Z', bytes: 1 }, { id: idB }]),
        'devices.json': JSON.stringify({ [idA.slice(0, 8)]: '예시 폰 A' }),
      },
    },
  ])
  const routes = {
    [`/v1/keep/${idA}/history`]: {
      latest: { savedAt: LATEST_AT },
      days: [{ date: '2026-11-24', savedAt: DAY_AT }],
      months: [{ month: '2026-10', savedAt: MONTH_AT }],
    },
    [`/v1/keep/${idA}`]: envelopes.latestA,
    [`/v1/keep/${idA}?day=2026-11-24`]: envelopes.dayA,
    [`/v1/keep/${idA}?month=2026-10`]: envelopes.monthA,
    // B 는 서버에 사본이 없다 (주간 사본만)
    [`/v1/keep/${idB}/history`]: { days: [], months: [] },
    [`/v1/keep/${idC}/history`]: { latest: { savedAt: '2026-11-25T05:00:00.000Z' }, days: [], months: [] },
    [`/v1/keep/${idC}`]: envelopes.latestC,
    [`/v1/keep/${idD}/history`]: { days: [], months: [] },
  }
  world = { idA, idB, idC, idD, repo, envelopes, routes }
})

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

// 받아 온 때(FETCH_HEAD)는 기본으로 모른다 → 마지막 커밋 시각이 기준 (시험마다 정해 준다)
const neverFetched = () => Promise.resolve(undefined)

function sourcesWith(overrides: Partial<ViewSources> = {}): ViewSources {
  return {
    keepUrl: KEEP_URL,
    backupDir: world.repo.dir,
    fetchFn: fakeKeep(world.routes).fetchFn,
    git: gitRunner(world.repo.dir).git,
    fetchedAt: neverFetched,
    ...overrides,
  }
}

const PAGE = new Map([['/', { type: 'text/html; charset=utf-8', body: '<p>페이지</p>' }]])

function serverWith(sources: ViewSources): ViewServer {
  return { port: PORT, files: PAGE, sources }
}

function get(path: string, sources: ViewSources, host: string = HOST) {
  return handleRequest({ method: 'GET', url: path, host }, serverWith(sources), NOW)
}

async function getJsonFrom<T>(path: string, sources: ViewSources): Promise<T> {
  return JSON.parse((await get(path, sources)).body)
}

function deviceOf(answer: DevicesAnswer, id: string): DeviceView {
  const device = answer.devices.find((item) => item.id === id)
  if (device === undefined) throw new Error(`${id.slice(0, 8)} 기기가 목록에 없다`)
  return device
}

function copyOf(device: DeviceView, kind: CopyItem['kind'], key?: string): CopyItem {
  const copy = device.copies.find((item) => item.kind === kind && (key === undefined || item.key === key))
  if (copy === undefined) throw new Error(`${kind} ${key ?? ''} 사본이 없다`)
  return copy
}

// ---------- 구조·표·비교 (#206): 지어낸 저장 데이터 ----------

// 페이지가 푼 글자를 JSON.parse 한 것과 같은 모양 (StoredData 는 interface 라 Record 로 바로 넘기지 못한다)
function viewOf(data: unknown): StoredView {
  const parsed: unknown = JSON.parse(JSON.stringify(data))
  if (!isRecord(parsed)) throw new Error('저장 데이터가 객체가 아니다')
  return parsed
}

function sizeOf(value: unknown): number {
  return bytesOf(JSON.stringify(value))
}

// 동아리(회비 칸이 든 duesBook 에 2025년 한 줄을 더함)와 가계부 하나, 복구 코드가 든 설정 — 내역 6줄
function richData(): StoredData {
  const club = duesBook({ id: 'club', name: '꽃동아리' })
  club.ledgers['2025'] = {
    year: 2025,
    carryover: 50_000,
    entries: [{ id: 'c25', month: 12, day: 20, type: 'expense', name: '송년회', amount: 30_000, createdAt: '2025-12-20T10:00:00.000Z', batchId: 'photo-1' }],
  }
  const home = book([ledger([[1, 'income', '용돈', 300_000], [1, 'expense', '장보기', 42_000], [2, 'expense', 'OTT 구독', 180_000]], { year: 2026, carryover: 0 })], {
    id: 'home',
    name: '우리집',
    kind: 'household',
    createdAt: '2026-01-03T00:00:00.000Z',
  })
  return { schemaVersion: APP_SCHEMA_VERSION, books: [club, home], settings: { recoveryCode: CODE_A, lastBookId: 'club', lastBackupAt: '2026-11-20T01:00:00.000Z' } }
}

function yearOf(data: StoredData, bookIndex: number, year: string): Ledger {
  const found = data.books[bookIndex]?.ledgers[year]
  if (found === undefined) throw new Error(`${bookIndex}번 장부에 ${year}년이 없다`)
  return found
}

// richData 뒤의 모습: 지운 줄·고친 줄 둘·더한 줄 하나, 비교하지 않는 칸만 바뀐 줄 하나, 회원 하나 빠지고 둘 더해짐, 새 해 하나
function laterData(): StoredData {
  const data = richData()
  const [club, home] = data.books
  const homeYear = yearOf(data, 1, '2026')
  homeYear.entries = homeYear.entries
    .filter(({ id }) => id !== 'e2')
    .map((entry): Entry => (entry.id === 'e3' ? { ...entry, month: 3, day: 10, type: 'income', name: 'OTT 환불' } : entry))
    .concat({ id: 'new-1', month: 11, day: 25, type: 'expense', name: '꽃바구니', amount: 35_000, createdAt: '2026-11-25T01:00:00.000Z' })
  const clubYear = yearOf(data, 0, '2026')
  // 엑셀에서 온 회비: 금액을 고치고 낸 분을 붙이고 엑셀 글은 지움
  clubYear.entries = clubYear.entries.map(
    (entry): Entry =>
      entry.id === 'dues-2'
        ? { id: entry.id, month: entry.month, day: entry.day, type: entry.type, name: entry.name, amount: 20_000, createdAt: entry.createdAt, payers: [{ memberId: 'm1', amount: 20_000 }] }
        : entry,
  )
  // 적은 때·사진 묶음은 비교하는 칸이 아니다
  const old = yearOf(data, 0, '2025').entries[0]
  old.createdAt = '2025-12-21T10:00:00.000Z'
  old.batchId = 'photo-2'
  club.members = [{ id: 'm1', name: '김도윤', joined: '2026-01', off: [] }, { id: 'm3', name: '이서준', joined: '2026-04', off: [] }]
  // 다른 장부의 같은 회원 번호(m1)는 다른 회원이다 (장부 id + Member.id 로 맞춘다)
  home.members = [{ id: 'm1', name: '김도윤', joined: '2026-11', off: [] }]
  home.ledgers['2027'] = { year: 2027, carryover: 85_000, entries: [] }
  return data
}

// 옛 저장 형식 v3 (회원·회비·낸 분·엑셀 글 칸이 없다)
const V3_DATA = {
  schemaVersion: 3,
  books: [
    {
      id: 'old',
      name: '옛 장부',
      kind: 'club',
      createdAt: '2025-10-08T00:00:00.000Z',
      ledgers: { 2025: { year: 2025, carryover: 120_000, entries: [{ id: 'o1', month: 3, type: 'income', name: '회비', amount: 10_000, createdAt: '2025-03-01T00:00:00.000Z' }] } },
    },
  ],
  settings: { recoveryCode: CODE_A },
}

// 내역 n 줄인 장부 하나 (7줄마다 수입 한 줄, 나머지는 지출)
function manyEntries(count: number): StoredData {
  const items = Array.from({ length: count }, (_, index): Entry => ({
    id: `n${index}`,
    month: (index % 12) + 1,
    day: (index % 28) + 1,
    type: index % 7 === 0 ? 'income' : 'expense',
    name: index % 7 === 0 ? '회비' : '간식',
    amount: 1_000 + index,
    createdAt: '2026-01-01T00:00:00.000Z',
  }))
  return { schemaVersion: APP_SCHEMA_VERSION, books: [book([{ year: 2026, carryover: 0, entries: items }], { id: 'big', name: '큰 장부' })], settings: {} }
}

function tableOf(data: StoredView, key: TableKey): ViewTable {
  const found = buildTables(data).find((table) => table.key === key)
  if (found === undefined) throw new Error(`${key} 표가 없다`)
  return found
}

const ALL: TableQuery = { book: '', year: '', search: '' }

// 표의 한 칸만 줄마다 (보이는 줄 순서)
function columnOf(data: StoredView, key: TableKey, column: string, query: TableQuery = ALL): unknown[] {
  return queryTable(tableOf(data, key), query).rows.map(({ cells }) => cells[column])
}

// Entry 칸 (src/domain/types.ts). Entry 에 칸이 생기거나 빠지면, 또는 필수·선택이 바뀌면 이 두 줄이 타입 검사에서 깨진다
type OptionalKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T]
const ENTRY_KEYS: Record<keyof Entry, true> = { id: true, month: true, day: true, type: true, name: true, amount: true, createdAt: true, batchId: true, payers: true, sourceText: true }
const ENTRY_OPTIONAL: Record<OptionalKeys<Entry>, true> = { day: true, batchId: true, payers: true, sourceText: true }

describe('SPEC-013 보관본 들여다보기', () => {
  describe('AC-1 로컬 서버는 127.0.0.1 에만 열고 Host 를 검사한다', () => {
    it('기본 포트는 7788 이고 --port 로 바꾼다', () => {
      expect(parseViewArgs([])).toEqual({ ok: true, port: 7788 })
      expect(parseViewArgs(['--port', '7799'])).toEqual({ ok: true, port: 7799 })
      expect(parseViewArgs(['--port', '1024'])).toEqual({ ok: true, port: 1024 })
      // 80 이면 브라우저가 Host 에서 포트를 빼서 모든 요청이 Host 검사에 걸린다. 1023 아래는 받지 않는다 (0 은 빈 포트, 시험용)
      expect(parseViewArgs(['--port', '0'])).toEqual({ ok: true, port: 0 })
      for (const args of [['--port', 'x'], ['--port', '70000'], ['--port', '80'], ['--port', '1023'], ['--port'], ['--verbose']]) {
        expect(parseViewArgs(args).ok).toBe(false)
      }
    })

    it('Host 가 127.0.0.1:<포트>·localhost:<포트> 일 때만 받는다', () => {
      expect(isAllowedHost('127.0.0.1:7788', 7788)).toBe(true)
      expect(isAllowedHost('localhost:7788', 7788)).toBe(true)
      for (const host of ['127.0.0.1:7789', 'evil.example:7788', 'rebind.evil.example', '127.0.0.1', '[::1]:7788', '192.168.0.10:7788', undefined]) {
        expect(isAllowedHost(host, 7788)).toBe(false)
      }
    })

    it('Host 가 다르면 git 도 서버도 부르지 않고 거절한다', async () => {
      const keep = fakeKeep(world.routes)
      const runner = gitRunner(world.repo.dir)
      const answer = await get('/api/devices', sourcesWith({ fetchFn: keep.fetchFn, git: runner.git }), 'rebind.evil.example:7788')

      expect(answer.status).toBe(403)
      expect(keep.sent).toEqual([])
      expect(runner.calls).toEqual([])
    })

    it('GET 말고는 받지 않고, 모든 응답에 Cache-Control: no-store 를 붙인다', async () => {
      const sources = sourcesWith()
      const answers = [
        await get('/', sources),
        await get('/api/devices', sources),
        await get(`/api/copy?id=${world.idA}&kind=latest&key=`, sources),
        await get('/api/history?id=nope', sources),
        await get('/nope', sources),
        await get('/', sources, 'evil.example:7788'),
        await handleRequest({ method: 'POST', url: '/api/devices', host: HOST }, serverWith(sources), NOW),
      ]

      expect(answers.map(({ status }) => status)).toEqual([200, 200, 200, 400, 404, 403, 405])
      for (const { headers } of answers) expect(headers['Cache-Control']).toBe('no-store')
    })
  })

  describe('입력 형식 검사', () => {
    it('id·종류·날·달·커밋 형식이 틀리면 git 도 서버도 부르지 않고 400 으로 답한다', async () => {
      const keep = fakeKeep(world.routes)
      const runner = gitRunner(world.repo.dir)
      const sources = sourcesWith({ fetchFn: keep.fetchFn, git: runner.git })
      const id = world.idA
      const paths = [
        '/api/history?id=../../etc/passwd',
        `/api/history?id=${id.toUpperCase()}`,
        `/api/copy?id=${id}&kind=week&key=--output=/tmp/x`,
        `/api/copy?id=${id}&kind=week&key=HEAD`,
        `/api/copy?id=${id}&kind=day&key=2026-11-24;rm`,
        `/api/copy?id=${id}&kind=day&key=2026-13-01`,
        `/api/copy?id=${id}&kind=month&key=2026-13`,
        `/api/copy?id=${id}&kind=latest&key=x`,
        `/api/copy?id=${id}&kind=preview&key=`,
        `/api/copy?id=${id.slice(1)}&kind=latest&key=`,
      ]

      for (const path of paths) {
        const answer = await get(path, sources)
        expect(answer.status).toBe(400)
        expect(JSON.parse(answer.body)).toEqual({ ok: false, message: BAD_QUERY })
      }
      expect(keep.sent).toEqual([])
      expect(runner.calls).toEqual([])
    })
  })

  describe('AC-2 사본 목록', () => {
    it('백업 레포 index.json·커밋 이력과 서버 사본 목록으로 기기별 최신본·날짜별·달별·주간 사본을 시각·크기와 함께 만든다', async () => {
      const answer = await getJsonFrom<DevicesAnswer>('/api/devices', sourcesWith())
      const { envelopes, repo } = world
      const [week1, week2] = repo.hashes

      expect(answer.notices).toEqual([])
      expect(answer.devices.map(({ id }) => id)).toEqual([world.idA, world.idB])
      expect(deviceOf(answer, world.idA).copies).toEqual([
        { kind: 'latest', key: '', at: LATEST_AT, bytes: bytesOf(JSON.stringify(envelopes.latestA)) },
        { kind: 'day', key: '2026-11-24', at: DAY_AT, bytes: bytesOf(JSON.stringify(envelopes.dayA)) },
        { kind: 'month', key: '2026-10', at: MONTH_AT, bytes: bytesOf(JSON.stringify(envelopes.monthA)) },
        { kind: 'week', key: week2, at: WEEK_2, bytes: bytesOf(fileText(envelopes.week2A)) },
        { kind: 'week', key: week1, at: WEEK_1, bytes: bytesOf(fileText(envelopes.week1A)) },
      ])
      expect(deviceOf(answer, world.idB).copies).toEqual([{ kind: 'week', key: week2, at: WEEK_2, bytes: bytesOf(fileText(envelopes.weekB)) }])
    })

    it('devices.json 이름을 붙이고, 이름표에 없는 기기는 이름 없이 둔다', async () => {
      const answer = await getJsonFrom<DevicesAnswer>('/api/devices', sourcesWith())

      expect(deviceOf(answer, world.idA).name).toBe('예시 폰 A')
      expect(deviceOf(answer, world.idB).name).toBeUndefined()
      expect(outerInfo(deviceOf(answer, world.idB), copyOf(deviceOf(answer, world.idB), 'week'), NOW)[0]).toEqual({
        label: '기기',
        value: `이름 없음 — devices.json 에 "${world.idB.slice(0, 8)}" 이름을 붙이면 보여요`,
      })
    })

    it('보관 서버에는 본 주소 출처를 붙인 GET 만 보낸다', async () => {
      const keep = fakeKeep(world.routes)
      await listDevices(sourcesWith({ fetchFn: keep.fetchFn }), NOW)

      expect(keep.sent.length).toBeGreaterThan(0)
      for (const sent of keep.sent) {
        expect(sent.method).toBe('GET')
        expect(sent.headers).toEqual({ Origin: APP_ORIGIN })
      }
    })
  })

  describe('AC-3 출처를 못 쓸 때는 그 출처만 빼고 안내 한 줄', () => {
    it('KEEP_URL 이 없으면 서버를 부르지 않고 백업 레포만 쓴다', async () => {
      const keep = fakeKeep(world.routes)
      const answer = await listDevices(sourcesWith({ keepUrl: '', fetchFn: keep.fetchFn }), NOW)

      expect(answer.notices).toEqual([NO_KEEP_URL])
      expect(deviceOf(answer, world.idA).copies.map(({ kind }) => kind)).toEqual(['week', 'week'])
      expect(keep.sent).toEqual([])
    })

    it('서버에 닿지 못하면 꺼내기와 같은 문구를 한 번만 보이고 주간 사본은 그대로 보인다', async () => {
      const answer = await listDevices(sourcesWith({ fetchFn: unreachable }), NOW)

      expect(answer.notices).toEqual([SERVER_DOWN])
      expect(deviceOf(answer, world.idA)).toMatchObject({ serverProblem: SERVER_DOWN })
      expect(deviceOf(answer, world.idA).copies.map(({ kind }) => kind)).toEqual(['week', 'week'])
    })

    it('예전 서버(목록 경로 404)면 꺼내기와 같은 문구를 보인다', async () => {
      const answer = await listDevices(sourcesWith({ fetchFn: fakeKeep({}).fetchFn }), NOW)

      expect(answer.notices).toEqual([NO_HISTORY_ROUTE])
      expect(deviceOf(answer, world.idB).copies.map(({ kind }) => kind)).toEqual(['week'])
    })

    it('클론이 없으면 주간 사본·기기 목록 없이 안내하고, 코드로 열기는 서버 사본으로 된다', async () => {
      const missing = join(tmpdir(), 'keep-view-no-such-clone')
      const sources = sourcesWith({ backupDir: missing, git: gitRunner(missing).git })

      expect(await listDevices(sources, NOW)).toEqual({ notices: [noCloneNotice(missing)], devices: [] })
      const opened = await openByCode(CODE_A, [], (path) => getJsonFrom<HistoryAnswer>(path, sources))
      if (!opened.ok) throw new Error(opened.message)
      expect(opened.device.copies.map(({ kind }) => kind)).toEqual(['latest', 'day', 'month'])
    })

    it('클론을 마지막으로 받아 온 때(FETCH_HEAD)가 8일 넘었으면 git pull 안내를 보이고, 8일 안이면 보이지 않는다', async () => {
      const minute = 60 * 1000
      const fetchedAt = (at: number) => () => Promise.resolve(new Date(at).toISOString())

      const stale = await listDevices(sourcesWith({ fetchedAt: fetchedAt(NOW - 8 * DAY_MS - minute) }), NOW)
      const fresh = await listDevices(sourcesWith({ fetchedAt: fetchedAt(NOW - 8 * DAY_MS + minute) }), NOW)

      expect(stale.notices).toEqual([staleCloneNotice(8)])
      expect(stale.devices).toHaveLength(2)
      expect(fresh.notices).toEqual([])
    })

    it('바뀐 게 없어 주간 커밋이 오래돼도 막 받아 왔으면 안내하지 않는다', async () => {
      // 마지막 커밋은 20일 전, git pull 은 어제
      const now = Date.parse(WEEK_2) + 20 * DAY_MS
      const answer = await listDevices(sourcesWith({ fetchedAt: () => Promise.resolve(new Date(now - DAY_MS).toISOString()) }), now)

      expect(answer.notices).toEqual([])
    })

    it('받아 온 적 없는 클론(FETCH_HEAD 없음)은 마지막 커밋 시각으로 본다', async () => {
      const lastCommit = Date.parse(WEEK_2)
      const minute = 60 * 1000

      expect((await listDevices(sourcesWith(), lastCommit + 8 * DAY_MS + minute)).notices).toEqual([staleCloneNotice(8)])
      expect((await listDevices(sourcesWith(), lastCommit + 8 * DAY_MS - minute)).notices).toEqual([])
    })

    it('devices.json 이 없거나 모양이 틀리면 이름 없이 보이고 안내한다', async () => {
      const { idA } = world
      const listWith = (extra: Record<string, string>) => {
        const files = { [`keep/${idA}.json`]: fileText(world.envelopes.week2A), 'index.json': JSON.stringify([{ id: idA }]), ...extra }
        const repo = makeBackupRepo([{ at: WEEK_2, files }])
        return listDevices(sourcesWith({ backupDir: repo.dir, git: gitRunner(repo.dir).git }), NOW)
      }

      const noNames = await listWith({})
      expect(noNames.notices).toEqual([NO_DEVICE_NAMES])
      expect(deviceOf(noNames, idA).name).toBeUndefined()

      // 모양 규칙은 보관 지켜보기와 같다: 키는 소문자 16진수 8자, 값은 빈칸 아닌 글자
      for (const broken of ['{ "엄마": "폰" }', JSON.stringify({ [idA.slice(0, 8)]: '  ' }), '이름표 아님']) {
        const brokenNames = await listWith({ 'devices.json': broken })
        expect(brokenNames.notices).toEqual([BROKEN_DEVICE_NAMES])
        expect(deviceOf(brokenNames, idA).name).toBeUndefined()
      }
    })
  })

  describe('AC-4 겉 정보는 코드 없이 보인다', () => {
    const ID = `1a2b3c4d${'0'.repeat(56)}`
    const COMMIT = 'c0ffee'.padEnd(40, '0')
    const device: DeviceView = {
      id: ID,
      name: '예시 폰 A',
      copies: [
        { kind: 'latest', key: '', at: LATEST_AT, bytes: 524_288 },
        { kind: 'day', key: '2026-11-24', at: DAY_AT, bytes: 12_601 },
        { kind: 'month', key: '2026-10', at: MONTH_AT, bytes: 900 },
        { kind: 'week', key: COMMIT, at: WEEK_2, bytes: 1_048_576 },
      ],
    }
    const row = (copy: CopyItem, label: string) => outerInfo(device, copy, NOW).find((item) => item.label === label)?.value

    it('사본 종류마다 있는 곳·남는 기간·1MB 대비 %가 맞다', () => {
      const [latest, day, month, week] = device.copies

      expect([latest, day, month, week].map((copy) => row(copy, '있는 곳'))).toEqual([
        `서버 KV keep:${ID}`,
        `서버 KV snap:${ID}:2026-11-24`,
        `서버 KV month:${ID}:2026-10`,
        `백업 레포 ${COMMIT}:keep/${ID}.json`,
      ])
      // 날짜별: 11-24 사본은 빨라도 11-25 0시에 생겨 31일 → 12-26 0시. 달별: 10월 사본은 빨라도 11-01 0시에 생겨 400일 → 2027-12-06 0시 (한국 시간)
      expect([latest, day, month, week].map((copy) => row(copy, '남는 기간'))).toEqual([
        '다음 보관 때 바뀌어요',
        '만든 때부터 31일 · 적어도 2026-12-26 0시까지 남아요 (앞으로 29일 이상)',
        '만든 때부터 400일 · 적어도 2027-12-06 0시까지 남아요 (앞으로 374일 이상)',
        '계속 남아요 (백업 레포 커밋 이력)',
      ])
      expect([latest, day, month, week].map((copy) => row(copy, '크기'))).toEqual([
        '512.0 KB · 1MB 한도의 50.0%',
        '12.3 KB · 1MB 한도의 1.2%',
        '900 B · 1MB 한도의 0.1%',
        '1024.0 KB · 1MB 한도의 100.0%',
      ])
    })

    it('기기·id·사본·받은 때(한국 시간)·이 기기 사본 개수를 보인다', () => {
      const [latest, , , week] = device.copies

      expect(outerInfo(device, latest, NOW)).toEqual([
        { label: '기기', value: '예시 폰 A' },
        { label: '보관 자리 id', value: ID },
        { label: '사본', value: '최신본' },
        { label: '있는 곳', value: `서버 KV keep:${ID}` },
        { label: '서버가 받은 때', value: '2026-11-26 06:40 (한국 시간)' },
        { label: '크기', value: '512.0 KB · 1MB 한도의 50.0%' },
        { label: '남는 기간', value: '다음 보관 때 바뀌어요' },
        { label: '이 기기 사본', value: '최신본 1 · 날짜별 1 · 달별 1 · 주간 1' },
      ])
      expect(row(week, '백업 레포에 넣은 때')).toBe('2026-11-23 08:04 (한국 시간)')
      expect(row(week, '사본')).toBe('주간 2026-11-23')
    })

    it('날짜별 사본이 곧 사라질 때는 그렇게 적는다', () => {
      const [, day] = device.copies
      expect(outerInfo(device, day, Date.parse('2026-12-26T00:00:00+09:00')).find(({ label }) => label === '남는 기간')?.value).toBe(
        '만든 때부터 31일 · 적어도 2026-12-26 0시까지 남아요 (곧 사라질 수 있어요)',
      )
    })

    it('겉봉투는 v·savedAt·iv 그대로, data 는 앞부분만 보인다', () => {
      const envelope: KeepEnvelope = { v: 1, savedAt: LATEST_AT, iv: 'aXY=', data: 'D'.repeat(100) }
      expect(JSON.parse(envelopePreview(envelope))).toEqual({ v: 1, savedAt: LATEST_AT, iv: 'aXY=', data: `${'D'.repeat(48)}…(모두 100자)` })
    })

    it('사본마다 코드 없이 겉봉투와 크기를 받아 온다 (서버 사본은 서버에서, 주간 사본은 git 에서)', async () => {
      const { idA, envelopes, repo } = world
      const sources = sourcesWith()
      const read = (copy: CopyRef) => getJsonFrom<CopyAnswer>(copyPath(idA, copy), sources)

      expect(await read({ kind: 'latest', key: '' })).toEqual({ ok: true, envelope: envelopes.latestA, bytes: bytesOf(JSON.stringify(envelopes.latestA)) })
      expect(await read({ kind: 'day', key: '2026-11-24' })).toEqual({ ok: true, envelope: envelopes.dayA, bytes: bytesOf(JSON.stringify(envelopes.dayA)) })
      expect(await read({ kind: 'month', key: '2026-10' })).toEqual({ ok: true, envelope: envelopes.monthA, bytes: bytesOf(JSON.stringify(envelopes.monthA)) })
      expect(await read({ kind: 'week', key: repo.hashes[0] })).toEqual({ ok: true, envelope: envelopes.week1A, bytes: bytesOf(fileText(envelopes.week1A)) })
    })
  })

  describe('AC-5 풀기는 페이지 안에서', () => {
    it('그 기기의 코드면 풀리고, 이 기기의 사본이 모두 그 코드로 열린다', async () => {
      const unlocked = await unlockDevice('hk7m 29qf mx4p 8r2d', world.idA)
      if (!unlocked.ok) throw new Error(unlocked.message)

      const { latestA, dayA, monthA, week1A, week2A } = world.envelopes
      const { books } = viewOf(clubData(CODE_A, '꽃동아리'))
      for (const envelope of [latestA, dayA, monthA, week1A, week2A]) {
        expect(await openCopy(unlocked.normalized, envelope)).toMatchObject({ ok: true, schemaVersion: 4, bookNames: ['꽃동아리'], entryCount: 2, data: { books } })
      }
      expect(openedInfo(await openCopy(unlocked.normalized, latestA))).toEqual([
        { label: '저장 형식', value: 'v4' },
        { label: '장부', value: '꽃동아리 — 1개' },
        { label: '기록', value: '2건' },
      ])
    })

    it('다른 기기의 코드면 거절 문구와 그 코드의 id 앞 8자를 보인다', async () => {
      expect(await unlockDevice(CODE_B, world.idA)).toEqual({ ok: false, message: `${NOT_THIS_DEVICE} (이 코드의 id 는 ${world.idB.slice(0, 8)}…)` })
      expect(await unlockDevice('HK7M-29QF', world.idA)).toEqual({ ok: false, message: INVALID_CODE })
    })

    it('로컬 서버로 가는 어떤 요청에도 코드가 없다 (주소에는 코드에서 만든 id 만)', async () => {
      const paths: string[] = []
      const keep = fakeKeep(world.routes)
      const sources = sourcesWith({ fetchFn: keep.fetchFn })
      const getLocal = <T>(path: string) => {
        paths.push(path)
        return getJsonFrom<T>(path, sources)
      }

      // 페이지가 하는 순서: 목록 → 코드로 열기 → 사본 고르기 → 풀기
      const listed = await getLocal<DevicesAnswer>('/api/devices')
      const opened = await openByCode('q7rt 5zwx k2mn 8hjf', listed.devices, (path) => getLocal<HistoryAnswer>(path))
      if (!opened.ok) throw new Error(opened.message)
      for (const copy of opened.device.copies) await getLocal<CopyAnswer>(copyPath(opened.device.id, copy))
      await unlockDevice(CODE_A, world.idA)

      expect(paths[1]).toBe(historyPath(world.idC))
      const codeParts = [CODE_A, CODE_C, 'HK7M', 'Q7RT', 'q7rt', '5ZWX', '5zwx', CODE_C.replaceAll('-', '')]
      for (const sent of [...paths, ...keep.sent.map(({ url }) => url)]) {
        for (const part of codeParts) expect(sent).not.toContain(part)
      }
    })
  })

  describe('AC-6 코드로 열기', () => {
    it('목록에 없는 기기도 코드로 id 를 계산해 서버 사본(과 백업 레포에 남은 주간 사본)을 연다', async () => {
      const sources = sourcesWith()
      const listed = await getJsonFrom<DevicesAnswer>('/api/devices', sources)
      expect(listed.devices.map(({ id }) => id)).not.toContain(world.idC)

      const opened = await openByCode(CODE_C, listed.devices, (path) => getJsonFrom<HistoryAnswer>(path, sources))
      if (!opened.ok) throw new Error(opened.message)
      // 주간 사본은 파일이 생긴 커밋만 (지운 커밋은 빼고)
      expect(opened.device.copies.map(({ kind, key }) => ({ kind, key }))).toEqual([
        { kind: 'latest', key: '' },
        { kind: 'week', key: world.repo.hashes[0] },
      ])
      const copy = await getJsonFrom<CopyAnswer>(copyPath(world.idC, opened.device.copies[0]), sources)
      if (!copy.ok) throw new Error(copy.message)
      expect(await openCopy(opened.normalized, copy.envelope)).toMatchObject({ ok: true, bookNames: ['다른 모임'] })
    })

    it('목록에 있는 기기의 코드면 서버에 다시 묻지 않고 그 기기를 연다', async () => {
      const listed = await getJsonFrom<DevicesAnswer>('/api/devices', sourcesWith())
      const asked: string[] = []

      const opened = await openByCode(CODE_A, listed.devices, (path) => {
        asked.push(path)
        return Promise.reject(new Error('부르지 않아야 한다'))
      })

      expect(opened).toMatchObject({ ok: true, device: { id: world.idA, name: '예시 폰 A' }, normalized: CODE_A })
      expect(asked).toEqual([])
    })

    it('서버에도 백업 레포에도 없는 코드면 꺼내기와 같은 없음 문구를 보인다', async () => {
      const sources = sourcesWith()
      expect(await openByCode(CODE_D, [], (path) => getJsonFrom<HistoryAnswer>(path, sources))).toEqual({ ok: false, message: NOT_FOUND })
    })

    it('목록에 있어도 사본이 하나도 없으면 열었다고 하지 않고 그 기기의 서버 문구(없으면 없음 문구)를 보인다', async () => {
      const noCopies: DeviceView = { id: world.idA, name: '예시 폰 A', copies: [] }
      const ask = () => Promise.reject(new Error('부르지 않아야 한다'))

      expect(await openByCode(CODE_A, [noCopies], ask)).toEqual({ ok: false, message: NOT_FOUND })
      expect(await openByCode(CODE_A, [{ ...noCopies, serverProblem: SERVER_DOWN }], ask)).toEqual({ ok: false, message: SERVER_DOWN })
    })

    it('처음 목록을 받는 동안 코드로 먼저 연 기기는 받은 목록이 지우지 않는다', () => {
      const deviceA: DeviceView = { id: world.idA, name: '예시 폰 A', copies: [] }
      const deviceB: DeviceView = { id: world.idB, copies: [] }
      const openedC: DeviceView = { id: world.idC, copies: [{ kind: 'latest', key: '', at: LATEST_AT }] }
      const openedA: DeviceView = { id: world.idA, copies: [] }

      // 받은 목록 뒤에 남기고, 받은 목록에도 있는 기기는 받은 것으로
      expect(mergeDevices([deviceA, deviceB], [openedC, openedA])).toEqual([deviceA, deviceB, openedC])
      expect(mergeDevices([], [openedC])).toEqual([openedC])
      expect(mergeDevices([deviceA], [])).toEqual([deviceA])
    })
  })

  describe('로컬 서버 오류도 같은 모양으로', () => {
    it('요청을 처리하다 오류가 나면 다른 답과 같은 헤더를 붙인 500 JSON { ok: false, message } 로 답한다', async () => {
      const broken: GitFn = () => Promise.reject(new Error('git 이 이상하다'))
      const answer = await get('/api/devices', sourcesWith({ git: broken }))
      const page = await get('/', sourcesWith())

      expect(answer.status).toBe(500)
      expect(JSON.parse(answer.body)).toEqual({ ok: false, message: SERVER_ERROR })
      expect(answer.headers).toEqual({ ...page.headers, 'Content-Type': 'application/json; charset=utf-8' })
      expect(answer.headers['Content-Security-Policy']).toContain("connect-src 'self'")
    })

    it('페이지는 로컬 서버 답의 상태와 형식을 먼저 보고, JSON 이 아니면 이유를 적은 { ok: false, message } 로 바꾼다', () => {
      expect(localAnswer(200, JSON.stringify({ notices: [], devices: [] }))).toEqual({ notices: [], devices: [] })
      expect(localAnswer(500, JSON.stringify({ ok: false, message: SERVER_ERROR }))).toEqual({ ok: false, message: SERVER_ERROR })
      expect(localAnswer(400, JSON.stringify({ ok: false, message: BAD_QUERY }))).toEqual({ ok: false, message: BAD_QUERY })
      expect(localAnswer(500, '도구 안에서 오류가 났어요')).toEqual({ ok: false, message: strangeLocalAnswer(500) })
      expect(localAnswer(403, '이 도구는 http://127.0.0.1:7788/ 로만 열어요')).toEqual({ ok: false, message: strangeLocalAnswer(403) })
      expect(localAnswer(502, JSON.stringify({ devices: [] }))).toEqual({ ok: false, message: strangeLocalAnswer(502) })
      expect(localAnswer(200, '[1, 2]')).toEqual({ ok: false, message: strangeLocalAnswer(200) })
    })
  })

  describe('AC-10 이상한 사본에서도 멈추지 않는다', () => {
    it('옛 저장 형식(v3)은 옮기지 않고 형식 번호와 함께 그대로 센다', async () => {
      const v3 = { schemaVersion: 3, books: [{ id: 'a', name: '옛 장부', kind: 'club', ledgers: { 2026: { year: 2026, carryover: 0, entries: [{ id: 'e1' }] } } }], settings: {} }
      const envelope = await sealKeep(CODE_A, JSON.stringify(v3), LATEST_AT)

      const opened = await openCopy(CODE_A, envelope)

      // 구조·표·비교가 쓰는 저장 데이터도 옮기지 않은 그대로 준다 (#206)
      expect(opened).toEqual({ ok: true, schemaVersion: 3, bookNames: ['옛 장부'], entryCount: 1, data: v3 })
      expect(openedInfo(opened)[0]).toEqual({ label: '저장 형식', value: 'v3 (옛 형식 — 옮기지 않고 그대로 보여요)' })
    })

    it('풀었지만 JSON 이 아니거나 장부 모양이 아니면 기록 파일 형식이 아니라는 문구를 보인다', async () => {
      for (const plain of ['장부 아님', JSON.stringify({ hello: 1 })]) {
        const opened = await openCopy(CODE_A, await sealKeep(CODE_A, plain, LATEST_AT))
        expect(opened).toEqual({ ok: false, message: NOT_BACKUP })
        expect(openedInfo(opened)).toEqual([{ label: '풀기', value: NOT_BACKUP }])
      }
    })

    it('목록을 받은 사이 사라진 사본은 그 줄에 문구를 두고, 고르면 같은 문구를 보인다', async () => {
      const { [`/v1/keep/${world.idA}?day=2026-11-24`]: gone, ...rest } = world.routes
      expect(gone).toBeDefined()
      const sources = sourcesWith({ fetchFn: fakeKeep(rest).fetchFn })

      const listed = await getJsonFrom<DevicesAnswer>('/api/devices', sources)
      const device = deviceOf(listed, world.idA)
      const day = copyOf(device, 'day')

      expect(day).toEqual({ kind: 'day', key: '2026-11-24', at: DAY_AT, problem: GONE_COPY })
      expect(copyOf(device, 'latest').bytes).toBeGreaterThan(0)
      expect(outerInfo(device, day, NOW).find(({ label }) => label === '크기')?.value).toBe(GONE_COPY)
      expect(await getJsonFrom<CopyAnswer>(copyPath(world.idA, day), sources)).toEqual({ ok: false, message: GONE_COPY })
    })

    it('앱의 지금 저장 형식 번호와 같은 값을 기준으로 옛 형식을 가른다', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(APP_SCHEMA_VERSION)
    })
  })

  describe('AC-7 구조: 나무와 내역 칸 채움', () => {
    it('나무는 StoredData → books → 장부마다 ledgers(내역 수·이월금·월 회비)·members·dues → settings 이고, 마디마다 JSON 크기를 붙인다', () => {
      const stored = richData()
      const [club, home] = stored.books

      expect(storedTree(viewOf(stored))).toEqual({
        label: 'StoredData',
        kind: '{ }',
        bytes: sizeOf(stored),
        children: [
          { label: 'schemaVersion', value: '4', children: [] },
          {
            label: 'books',
            kind: '[2]',
            bytes: sizeOf(stored.books),
            children: [
              {
                label: '꽃동아리',
                kind: 'club',
                note: '해 2 · 내역 3',
                bytes: sizeOf(club),
                children: [
                  { label: 'id', value: 'club', children: [] },
                  { label: 'createdAt', value: '2025-01-01 09:00', children: [] },
                  {
                    label: 'ledgers',
                    kind: '{2}',
                    bytes: sizeOf(club.ledgers),
                    children: [
                      { label: '2025', note: '내역 1 · 이월금 50,000', bytes: sizeOf(club.ledgers['2025']), children: [] },
                      { label: '2026', note: '내역 2 · 이월금 0 · 월 회비 20,000', bytes: sizeOf(club.ledgers['2026']), children: [] },
                    ],
                  },
                  { label: 'members', kind: '[2]', bytes: sizeOf(club.members), children: [] },
                  { label: 'dues', kind: '{ }', note: 'startMonth: 2026-01', bytes: sizeOf(club.dues), children: [] },
                ],
              },
              {
                label: '우리집',
                kind: 'household',
                note: '해 1 · 내역 3',
                bytes: sizeOf(home),
                children: [
                  { label: 'id', value: 'home', children: [] },
                  { label: 'createdAt', value: '2026-01-03 09:00', children: [] },
                  {
                    label: 'ledgers',
                    kind: '{1}',
                    bytes: sizeOf(home.ledgers),
                    children: [{ label: '2026', note: '내역 3 · 이월금 0', bytes: sizeOf(home.ledgers['2026']), children: [] }],
                  },
                ],
              },
            ],
          },
          {
            label: 'settings',
            kind: '{ }',
            bytes: sizeOf(stored.settings),
            children: [
              { label: 'recoveryCode', masked: true, children: [] },
              { label: 'lastBookId', value: 'club', children: [] },
              { label: 'lastBackupAt', value: '2026-11-20 10:00', children: [] },
            ],
          },
        ],
      })
    })

    it('settings.recoveryCode 는 가리고, 나무 어디에도 복구 코드가 없다', () => {
      const tree = JSON.stringify(storedTree(viewOf(richData())))

      for (const part of CODE_A.split('-')) expect(tree).not.toContain(part)
    })

    it('내역 칸 채움 표는 Entry 칸마다 종류·필수/선택·채운 줄 수·비율을 보인다', () => {
      const fill = entryFill(viewOf(richData()))

      expect(fill.total).toBe(6)
      expect(fill.fields.map(({ field, filled, share }) => [field, filled, share])).toEqual([
        ['id', 6, '100.0%'],
        ['month', 6, '100.0%'],
        ['day', 3, '50.0%'],
        ['type', 6, '100.0%'],
        ['name', 6, '100.0%'],
        ['amount', 6, '100.0%'],
        ['createdAt', 6, '100.0%'],
        ['batchId', 1, '16.7%'],
        ['payers', 1, '16.7%'],
        ['sourceText', 1, '16.7%'],
      ])
      expect(fill.fields.find(({ field }) => field === 'payers')).toMatchObject({ type: 'Payer[]', need: '선택 (낸 분, v4)' })
      expect(fill.fields.find(({ field }) => field === 'id')).toMatchObject({ type: 'string', need: '필수' })
    })

    it('칸 채움 표의 칸·필수/선택은 앱의 Entry 칸과 같다', () => {
      expect(ENTRY_FIELDS.map(({ field }) => field).sort()).toEqual(Object.keys(ENTRY_KEYS).sort())
      expect(ENTRY_FIELDS.filter(({ required }) => !required).map(({ field }) => field).sort()).toEqual(Object.keys(ENTRY_OPTIONAL).sort())
    })

    it('내역이 없으면 채운 줄은 0 이고 비율은 비운다', () => {
      const fill = entryFill(viewOf(manyEntries(0)))

      expect(fill.total).toBe(0)
      expect(new Set(fill.fields.map(({ filled, share }) => `${filled} ${share}`))).toEqual(new Set(['0 —']))
    })

    it('옛 저장 형식(v3)은 있는 칸만: 회원·회비 마디와 v4 칸(payers·sourceText) 줄이 없다', () => {
      const data = viewOf(V3_DATA)
      const tree = storedTree(data)
      const oldBook = tree.children[1].children[0]

      expect(tree.children[0]).toEqual({ label: 'schemaVersion', value: '3', children: [] })
      expect(oldBook.children.map(({ label }) => label)).toEqual(['id', 'createdAt', 'ledgers'])
      expect(oldBook.children[2].children).toEqual([{ label: '2025', note: '내역 1 · 이월금 120,000', bytes: sizeOf(V3_DATA.books[0].ledgers[2025]), children: [] }])
      expect(entryFill(data).fields.map(({ field }) => field)).toEqual(['id', 'month', 'day', 'type', 'name', 'amount', 'createdAt', 'batchId'])
    })
  })

  describe('AC-8 표: 다섯 표와 거르기·찾기·정렬·300줄', () => {
    it('다섯 표의 칸은 스펙 표 그대로다', () => {
      const tables = buildTables(viewOf(richData()))

      expect(tables.map(({ label, columns }) => [label, columns.map((column) => column.label)])).toEqual([
        ['장부', ['이름', '종류', '해 범위', '내역 수', '회원 수', '만든 때']],
        ['해', ['장부', '해', '이월금', '월 회비', '내역 수', '수입', '지출', '남은 돈']],
        ['내역', ['장부', '해', '월', '일', '종류', '이름', '금액', '낸 분', '엑셀 글', '적은 때']],
        ['회원', ['장부', '이름', '들어온 달', '그만둔 달', '쉬는 달', '시작 남은 돈']],
        ['낸 분', ['장부', '해', '월', '내역 이름', '회원', '몫']],
      ])
    })

    it('다섯 표의 줄은 저장 데이터와 맞다 (시각은 한국 시간, 없는 칸은 비움)', () => {
      const data = viewOf(richData())
      const cells = (key: TableKey) => queryTable(tableOf(data, key), ALL).rows.map((row) => row.cells)

      expect(cells('books')).toEqual([
        { name: '꽃동아리', kind: '동아리', years: '2025~2026', entries: 3, members: 2, createdAt: '2025-01-01 09:00' },
        { name: '우리집', kind: '가계부', years: '2026', entries: 3, members: undefined, createdAt: '2026-01-03 09:00' },
      ])
      expect(cells('ledgers')).toEqual([
        { book: '꽃동아리', year: 2025, carryover: 50_000, monthlyFee: undefined, count: 1, income: 0, expense: 30_000, balance: 20_000 },
        { book: '꽃동아리', year: 2026, carryover: 0, monthlyFee: 20_000, count: 2, income: 70_000, expense: 0, balance: 70_000 },
        { book: '우리집', year: 2026, carryover: 0, monthlyFee: undefined, count: 3, income: 300_000, expense: 222_000, balance: 78_000 },
      ])
      expect(cells('entries')).toEqual([
        { book: '꽃동아리', year: 2025, month: 12, day: 20, type: '지출', name: '송년회', amount: 30_000, payers: undefined, sourceText: undefined, createdAt: '2025-12-20 19:00' },
        { book: '꽃동아리', year: 2026, month: 3, day: 5, type: '수입', name: '회비', amount: 40_000, payers: '김도윤, 강민지', sourceText: undefined, createdAt: '2026-03-05 09:00' },
        { book: '꽃동아리', year: 2026, month: 4, day: 1, type: '수입', name: '회비', amount: 30_000, payers: undefined, sourceText: '4월 -2명: 김도윤(1만원),이서준', createdAt: '2026-04-01 09:00' },
        { book: '우리집', year: 2026, month: 1, day: undefined, type: '수입', name: '용돈', amount: 300_000, payers: undefined, sourceText: undefined, createdAt: '2025-01-01 09:00' },
        { book: '우리집', year: 2026, month: 1, day: undefined, type: '지출', name: '장보기', amount: 42_000, payers: undefined, sourceText: undefined, createdAt: '2025-01-01 09:00' },
        { book: '우리집', year: 2026, month: 2, day: undefined, type: '지출', name: 'OTT 구독', amount: 180_000, payers: undefined, sourceText: undefined, createdAt: '2025-01-01 09:00' },
      ])
      expect(cells('members')).toEqual([
        { book: '꽃동아리', name: '김도윤', joined: '2026-01', left: undefined, off: undefined, opening: undefined },
        { book: '꽃동아리', name: '강민지', joined: '2025-07', left: '2026-12', off: '2026-02', opening: -30_000 },
      ])
      expect(cells('payers')).toEqual([
        { book: '꽃동아리', year: 2026, month: 3, entry: '회비', member: '김도윤', amount: 20_000 },
        { book: '꽃동아리', year: 2026, month: 3, entry: '회비', member: '강민지', amount: 20_000 },
      ])
    })

    it('줄을 누르면 보일 원본 JSON 은 저장된 그 줄이고, 장부·해 줄은 안의 긴 목록을 줄여 보인다', () => {
      const stored = richData()
      const data = viewOf(stored)
      const raw = (key: TableKey, index: number) => queryTable(tableOf(data, key), ALL).rows[index]?.raw

      expect(raw('books', 0)).toEqual({
        id: 'club',
        name: '꽃동아리',
        kind: 'club',
        createdAt: '2025-01-01T00:00:00.000Z',
        dues: { startMonth: '2026-01' },
        ledgers: '{… 2개 해}',
        members: '[… 2명]',
      })
      expect(raw('books', 1)).toEqual({ id: 'home', name: '우리집', kind: 'household', createdAt: '2026-01-03T00:00:00.000Z', ledgers: '{… 1개 해}' })
      expect(raw('ledgers', 1)).toEqual({ year: 2026, carryover: 0, monthlyFee: 20_000, entries: '[… 2줄]' })
      expect(raw('entries', 1)).toEqual(yearOf(stored, 0, '2026').entries[0])
      expect(raw('members', 1)).toEqual(stored.books[0].members?.[1])
      expect(raw('payers', 1)).toEqual({ memberId: 'm2', amount: 20_000 })
    })

    it('장부·해로 거르면 그 장부·해 줄만 남고, 해 칸이 없는 표(장부·회원)는 해로 거르지 않는다', () => {
      const data = viewOf(richData())

      expect(tableChoices(data)).toEqual({ books: [{ id: 'club', name: '꽃동아리' }, { id: 'home', name: '우리집' }], years: ['2025', '2026'] })
      expect(columnOf(data, 'entries', 'name', { ...ALL, book: 'home' })).toEqual(['용돈', '장보기', 'OTT 구독'])
      expect(columnOf(data, 'entries', 'name', { ...ALL, year: '2025' })).toEqual(['송년회'])
      expect(columnOf(data, 'ledgers', 'balance', { ...ALL, book: 'club', year: '2026' })).toEqual([70_000])
      expect(columnOf(data, 'payers', 'member', { ...ALL, year: '2025' })).toEqual([])
      expect(columnOf(data, 'books', 'name', { ...ALL, year: '2025' })).toEqual(['꽃동아리', '우리집'])
      expect(columnOf(data, 'members', 'name', { ...ALL, book: 'home', year: '2025' })).toEqual([])
    })

    it('찾기는 보이는 글과 숫자(쉼표 있든 없든)에서 대소문자 없이 찾는다', () => {
      const data = viewOf(richData())
      const names = (search: string) => columnOf(data, 'entries', 'name', { ...ALL, search })

      expect(names('42,000')).toEqual(['장보기'])
      expect(names('42000')).toEqual(['장보기'])
      expect(names('ott')).toEqual(['OTT 구독'])
      // 낸 분 이름과 엑셀 글에서도 찾는다
      expect(columnOf(data, 'entries', 'amount', { ...ALL, search: '김도윤' })).toEqual([40_000, 30_000])
      expect(names('  지출  ')).toEqual(['송년회', '장보기', 'OTT 구독'])
      expect(names('없는 글')).toEqual([])
    })

    it('칸 머리로 정렬하면 오름·내림차순이고, 빈 칸은 늘 뒤에 두고, 같은 값은 원래 순서를 지킨다', () => {
      const data = viewOf(richData())
      const sorted = (column: string, descending: boolean, show: string) => columnOf(data, 'entries', show, { ...ALL, sort: { column, descending } })

      expect(sorted('day', false, 'day')).toEqual([1, 5, 20, undefined, undefined, undefined])
      expect(sorted('day', true, 'day')).toEqual([20, 5, 1, undefined, undefined, undefined])
      expect(sorted('day', false, 'name').slice(3)).toEqual(['용돈', '장보기', 'OTT 구독'])
      expect(sorted('amount', true, 'name')).toEqual(['용돈', 'OTT 구독', '장보기', '회비', '송년회', '회비'])
      expect(sorted('name', false, 'name')).toEqual(['OTT 구독', '송년회', '용돈', '장보기', '회비', '회비'])
      // 숫자는 글자 순이 아니라 크기 순 (5 < 20 < 300,000)
      expect(columnOf(data, 'ledgers', 'income', { ...ALL, sort: { column: 'income', descending: false } })).toEqual([0, 70_000, 300_000])
    })

    it('한 번에 300줄까지 그리고 "N / 모두 M줄"을 보인다', () => {
      const big = tableOf(viewOf(manyEntries(350)), 'entries')
      const all = queryTable(big, ALL)
      const income = queryTable(big, { ...ALL, search: '수입' })

      expect(all.rows).toHaveLength(300)
      expect(all).toMatchObject({ matched: 350, total: 350, countText: '350 / 모두 350줄 · 앞 300줄만' })
      expect(income.rows).toHaveLength(50)
      expect(income.countText).toBe('50 / 모두 350줄')
      expect(queryTable(tableOf(viewOf(manyEntries(300)), 'entries'), ALL).countText).toBe('300 / 모두 300줄')
      expect(queryTable(tableOf(viewOf(manyEntries(1_200)), 'entries'), ALL).countText).toBe('1,200 / 모두 1,200줄 · 앞 300줄만')
    })

    it('돈은 정수 부분에만 세 자리 쉼표를 찍는다 (음수·소수도)', () => {
      expect([won(0), won(999), won(1_000), won(-30_000), won(1_234_567)]).toEqual(['0', '999', '1,000', '-30,000', '1,234,567'])
      expect([won(1234.5678), won(-1234.5)]).toEqual(['1,234.5678', '-1,234.5'])
    })

    it('옛 저장 형식(v3)은 회원·낸 분 표가 비고, 나머지 표는 있는 칸으로 채운다', () => {
      const data = viewOf(V3_DATA)

      expect(queryTable(tableOf(data, 'members'), ALL).total).toBe(0)
      expect(queryTable(tableOf(data, 'payers'), ALL).total).toBe(0)
      expect(columnOf(data, 'books', 'members')).toEqual([undefined])
      expect(columnOf(data, 'entries', 'payers')).toEqual([undefined])
      expect(columnOf(data, 'ledgers', 'balance')).toEqual([130_000])
    })

    it('다른 사본으로 바꿨을 때 그 사본에 없는 장부·해로는 거르지 않는다 (고르기 칸은 모든 장부·모든 해로)', () => {
      const choices = tableChoices(viewOf(richData()))

      expect(fitTableFilter({ book: 'home', year: '2025' }, choices)).toEqual({ book: 'home', year: '2025' })
      expect(fitTableFilter({ book: 'gone-book', year: '2024' }, choices)).toEqual({ book: '', year: '' })
      expect(fitTableFilter({ book: '', year: '' }, choices)).toEqual({ book: '', year: '' })
    })

    it('원본에 ledgers 가 없는 장부 줄은 ledgers 를 지어 넣지 않는다 (저장된 그대로)', () => {
      const data = viewOf({ schemaVersion: 4, books: [{ id: 'bare', name: '칸 빠진 장부', kind: 'club' }], settings: {} })

      expect(queryTable(tableOf(data, 'books'), ALL).rows[0].raw).toEqual({ id: 'bare', name: '칸 빠진 장부', kind: 'club' })
    })

    it('숫자가 아닌 해 키도 키 글자로 거르고, 정렬하면 숫자 해 뒤에 둔다', () => {
      const odd = richData()
      odd.books[1].ledgers.old = { year: 0, carryover: 0, entries: [{ id: 'odd-1', month: 1, type: 'income', name: '옛 키 줄', amount: 1_000, createdAt: '2026-01-01T00:00:00.000Z' }] }
      const data = viewOf(odd)

      expect(tableChoices(data).years).toEqual(['2025', '2026', 'old'])
      expect(columnOf(data, 'entries', 'name', { ...ALL, year: 'old' })).toEqual(['옛 키 줄'])
      expect(columnOf(data, 'entries', 'year', { ...ALL, book: 'home' })).toEqual([2026, 2026, 2026, 'old'])
      expect(columnOf(data, 'ledgers', 'year', { ...ALL, sort: { column: 'year', descending: false } })).toEqual([2025, 2026, 2026, 'old'])
    })
  })

  describe('AC-9 비교: 두 사본의 내역·회원·해별 남은 돈', () => {
    it('내역을 Entry.id 로 맞춰 빠진·바뀐·더해진 줄과 바뀐 칸(앞 → 뒤)을 보인다 — 비교하지 않는 칸만 바뀐 줄은 빼고', () => {
      const comparison = compareCopies(viewOf(richData()), viewOf(laterData()))

      expect(comparison).toMatchObject({ removed: 1, changed: 2, added: 1, total: 4 })
      expect(comparison.rows).toEqual([
        { status: 'removed', book: '우리집', date: '2026-01', type: '지출', name: '장보기', amount: 42_000, changes: [] },
        {
          status: 'changed',
          book: '꽃동아리',
          date: '2026-04-01',
          type: '수입',
          name: '회비',
          amount: 20_000,
          changes: [
            { label: '금액', before: '30,000', after: '20,000' },
            { label: '낸 분', before: '(없음)', after: '김도윤 20,000' },
            { label: '엑셀 글', before: '4월 -2명: 김도윤(1만원),이서준', after: '(없음)' },
          ],
        },
        {
          status: 'changed',
          book: '우리집',
          date: '2026-03-10',
          type: '수입',
          name: 'OTT 환불',
          amount: 180_000,
          changes: [
            { label: '월', before: '2', after: '3' },
            { label: '일', before: '(없음)', after: '10' },
            { label: '종류', before: '지출', after: '수입' },
            { label: '이름', before: 'OTT 구독', after: 'OTT 환불' },
          ],
        },
        { status: 'added', book: '우리집', date: '2026-11-25', type: '지출', name: '꽃바구니', amount: 35_000, changes: [] },
      ])
    })

    it('회원은 장부 id + Member.id 로 맞춰 더해짐·빠짐을 보인다', () => {
      const comparison = compareCopies(viewOf(richData()), viewOf(laterData()))

      expect(comparison.membersAdded).toEqual([
        { book: '꽃동아리', name: '이서준', joined: '2026-04' },
        { book: '우리집', name: '김도윤', joined: '2026-11' },
      ])
      expect(comparison.membersRemoved).toEqual([{ book: '꽃동아리', name: '강민지', joined: '2025-07' }])
    })

    it('해별 남은 돈(이월금 + 수입 − 지출)이 달라진 해만 앞·뒤·차이로 보인다', () => {
      const comparison = compareCopies(viewOf(richData()), viewOf(laterData()))

      expect(comparison.balances).toEqual([
        { book: '꽃동아리', year: '2026', before: 70_000, after: 60_000, diff: -10_000 },
        { book: '우리집', year: '2026', before: 78_000, after: 445_000, diff: 367_000 },
        { book: '우리집', year: '2027', before: undefined, after: 85_000, diff: undefined },
      ])
    })

    it('같은 id 의 내역이 다른 해나 다른 장부로 옮겨 가면 바뀐 줄이고, 장부·해도 앞 → 뒤로 보인다', () => {
      const before = richData()
      const after = richData()
      // 우리집 2026 의 용돈(e1)을 2027 로, 꽃동아리 2025 의 송년회(c25)를 우리집 2025 로
      const homeYear = yearOf(after, 1, '2026')
      const [allowance] = homeYear.entries.splice(0, 1)
      after.books[1].ledgers['2027'] = { year: 2027, carryover: 0, entries: [allowance] }
      const party = yearOf(after, 0, '2025').entries.splice(0, 1)
      after.books[1].ledgers['2025'] = { year: 2025, carryover: 0, entries: party }

      const comparison = compareCopies(viewOf(before), viewOf(after))

      expect(comparison).toMatchObject({ removed: 0, changed: 2, added: 0 })
      expect(comparison.rows.map(({ name, date, changes }) => ({ name, date, changes }))).toEqual([
        { name: '용돈', date: '2027-01', changes: [{ label: '해', before: '2026', after: '2027' }] },
        { name: '송년회', date: '2025-12-20', changes: [{ label: '장부', before: '꽃동아리', after: '우리집' }] },
      ])
    })

    it('숫자가 아닌 해 키의 줄은 같은 무리 안에서 맨 뒤에 둔다', () => {
      const after = richData()
      // 먼저 훑는 장부(꽃동아리)에 두어, 날짜를 못 재면 넣은 순서대로 앞에 남는다
      after.books[0].ledgers.old = { year: 0, carryover: 0, entries: [{ id: 'odd-1', month: 12, day: 31, type: 'income', name: '옛 키 줄', amount: 1_000, createdAt: '2026-01-01T00:00:00.000Z' }] }
      yearOf(after, 1, '2026').entries.push({ id: 'new-2', month: 1, day: 2, type: 'expense', name: '새 줄', amount: 2_000, createdAt: '2026-01-02T00:00:00.000Z' })

      const comparison = compareCopies(viewOf(richData()), viewOf(after))

      expect(comparison.rows.map(({ name, date }) => [name, date])).toEqual([
        ['새 줄', '2026-01-02'],
        ['옛 키 줄', 'old-12-31'],
      ])
    })

    it('같은 사본끼리는 바뀐 것이 없다', () => {
      const data = viewOf(richData())

      expect(compareCopies(data, data)).toEqual({ removed: 0, changed: 0, added: 0, total: 0, rows: [], membersAdded: [], membersRemoved: [], balances: [] })
    })

    it('바뀐 줄은 120줄까지 (빠짐 → 바뀜 → 더해짐, 그 안에서는 날짜가 늦은 것부터) 그리고 "모두 N줄"을 보인다', () => {
      const empty = viewOf(manyEntries(0))
      const later = manyEntries(130)
      const many = compareCopies(empty, viewOf(later))
      const exact = compareCopies(empty, viewOf(manyEntries(120)))
      const pad = (value: number | undefined) => String(value).padStart(2, '0')
      const allDates = yearOf(later, 0, '2026').entries.map(({ month, day }) => `2026-${pad(month)}-${pad(day)}`)

      expect(many).toMatchObject({ added: 130, total: 130 })
      expect(many.rows).toHaveLength(120)
      expect(many.rows[0].date).toBe('2026-12-28')
      // 줄을 다 줄 세운 뒤에 자른다: 날짜가 가장 이른 10줄이 빠진다
      expect(many.rows.map(({ date }) => date)).toEqual(allDates.sort().reverse().slice(0, 120))
      expect(compareMoreText(many)).toBe('앞 120줄만 보여요 (모두 130줄)')
      expect(exact.rows).toHaveLength(120)
      expect(compareMoreText(exact)).toBeUndefined()
    })

    it('같은 코드로 푼 두 사본(앱의 sealKeep 으로 만든 보관본)을 비교한다', async () => {
      const [before, after] = await Promise.all([
        openCopy(CODE_A, await seal(CODE_A, richData(), DAY_AT)),
        openCopy(CODE_A, await seal(CODE_A, laterData(), LATEST_AT)),
      ])
      if (!before.ok || !after.ok) throw new Error('지어낸 보관본을 풀지 못했다')

      expect(compareCopies(before.data, after.data)).toMatchObject({ removed: 1, changed: 2, added: 1 })
      expect(JSON.stringify(storedTree(after.data))).not.toContain(CODE_A)
    })

    it('비교의 처음 앞·뒤: 뒤는 고른 사본, 앞은 그보다 먼저 받은 가장 가까운 사본 (받지 못한 사본은 빼고)', () => {
      const copies: CopyItem[] = [
        { kind: 'latest', key: '', at: LATEST_AT, bytes: 1 },
        { kind: 'day', key: '2026-11-24', at: DAY_AT, bytes: 1 },
        { kind: 'month', key: '2026-10', at: MONTH_AT, bytes: 1 },
        { kind: 'week', key: 'a'.repeat(40), at: WEEK_2, bytes: 1 },
        { kind: 'week', key: 'b'.repeat(40), at: WEEK_1, bytes: 1 },
      ]

      expect(defaultPair(copies, 0)).toEqual({ before: 1, after: 0 })
      expect(defaultPair(copies, 1)).toEqual({ before: 3, after: 1 })
      expect(defaultPair(copies, 4)).toEqual({ before: 2, after: 4 })
      // 가장 오래된 사본을 고르면 그것을 앞에, 그다음에 받은 사본을 뒤에
      expect(defaultPair(copies, 2)).toEqual({ before: 2, after: 4 })
      const gone = copies.map((copy, index): CopyItem => (index === 1 ? { kind: copy.kind, key: copy.key, at: copy.at, problem: GONE_COPY } : copy))
      expect(defaultPair(gone, 0)).toEqual({ before: 3, after: 0 })
      expect(defaultPair(copies.slice(0, 1), 0)).toBeUndefined()
      // 고른 사본과 같은 때 받은 사본은 같은 모습이라 앞으로 고르지 않는다
      const same: CopyItem[] = [copies[0], { kind: 'week', key: 'c'.repeat(40), at: LATEST_AT, bytes: 1 }, copies[1]]
      expect(defaultPair(same, 0)).toEqual({ before: 2, after: 0 })
      const sameOldest: CopyItem[] = [copies[0], { kind: 'week', key: 'c'.repeat(40), at: MONTH_AT, bytes: 1 }, copies[2]]
      expect(defaultPair(sameOldest, 2)).toEqual({ before: 2, after: 0 })
    })
  })

  describe('keep-view.mjs 를 실제로 켜기 (가짜 보관 서버·임시 백업 레포)', () => {
    let child: ChildProcess
    let keepServer: Server
    let base = ''
    const received: { method: string; origin: string | undefined; url: string }[] = []

    interface Answer {
      status: number
      headers: Record<string, string | string[] | undefined>
      body: string
    }

    function request(host: string, path: string, headers: Record<string, string> = {}): Promise<Answer> {
      const url = new URL(path, base)
      return new Promise((done, fail) => {
        const sent = httpRequest({ host, port: url.port, path: url.pathname + url.search, headers }, (response) => {
          let body = ''
          response.setEncoding('utf8')
          response.on('data', (chunk: string) => (body += chunk))
          response.on('end', () => done({ status: response.statusCode ?? 0, headers: response.headers, body }))
        })
        sent.on('error', fail)
        sent.end()
      })
    }

    beforeAll(async () => {
      // 가짜 보관 서버: 출처 헤더·메서드를 적어 두고 world.routes 대로 답한다
      keepServer = createServer((incoming, response) => {
        const path = incoming.url ?? ''
        received.push({ method: incoming.method ?? '', origin: incoming.headers.origin, url: path })
        const found = Object.hasOwn(world.routes, path)
        response.writeHead(found ? 200 : 404, { 'Content-Type': 'application/json' }).end(found ? JSON.stringify(world.routes[path]) : '')
      })
      await new Promise<void>((done) => keepServer.listen(0, '127.0.0.1', done))
      const keepAddress = keepServer.address()
      if (keepAddress === null || typeof keepAddress === 'string') throw new Error('가짜 보관 서버 주소를 모른다')

      // 막 git pull 한 클론처럼 FETCH_HEAD 를 지금 시각으로 둔다 — 실제 시계로 도는 도구가 커밋 날짜(11월)만 보고 오래됐다고 하지 않게
      writeFileSync(join(world.repo.dir, '.git', 'FETCH_HEAD'), '')

      // vitest 는 레포 맨 위에서 돈다 (다른 테스트처럼 레포 기준 경로)
      child = spawn(process.execPath, ['scripts/keep-view.mjs', '--port', '0'], {
        env: { ...process.env, KEEP_URL: `http://127.0.0.1:${keepAddress.port}`, KEEP_BACKUP_DIR: world.repo.dir },
      })
      // 켜졌다고 찍은 주소를 기다린다 (시간이 아니라 출력으로)
      base = await new Promise<string>((done, fail) => {
        let out = ''
        let err = ''
        child.stdout?.on('data', (chunk: Buffer) => {
          out += chunk.toString()
          const match = /http:\/\/127\.0\.0\.1:\d+\//.exec(out)
          if (match) done(match[0])
        })
        child.stderr?.on('data', (chunk: Buffer) => (err += chunk.toString()))
        child.on('exit', (code) => fail(new Error(`keep-view.mjs 가 끝났다 (${code}): ${err}`)))
      })
    })

    afterAll(async () => {
      if (child !== undefined && child.exitCode === null) {
        const exited = new Promise((done) => child.once('exit', done))
        child.kill()
        await exited
      }
      await new Promise((done) => keepServer.close(done))
    })

    it('127.0.0.1 에만 열리고, 이 맥의 바깥 주소로는 닿지 않는다', async () => {
      const page = await request('127.0.0.1', '/')
      expect(page.status).toBe(200)
      expect(page.headers['content-type']).toBe('text/html; charset=utf-8')
      expect(page.headers['cache-control']).toBe('no-store')
      expect(page.body).toContain('<title>보관본 들여다보기</title>')

      const outside = Object.values(networkInterfaces())
        .flat()
        .find((address) => address !== undefined && address.family === 'IPv4' && !address.internal)
      if (outside !== undefined) {
        await expect(request(outside.address, '/')).rejects.toMatchObject({ code: 'ECONNREFUSED' })
      }
    })

    it('Host 가 127.0.0.1:<포트>·localhost:<포트> 가 아니면 거절한다', async () => {
      const port = new URL(base).port
      expect((await request('127.0.0.1', '/', { Host: `localhost:${port}` })).status).toBe(200)
      const rebound = await request('127.0.0.1', '/api/devices', { Host: `rebind.evil.example:${port}` })
      expect(rebound.status).toBe(403)
      expect(rebound.headers['cache-control']).toBe('no-store')
    })

    it('페이지 모듈(keepView.ts·keepRescue.ts)은 타입만 지운 ES 모듈로 text/javascript 로 보낸다', async () => {
      for (const path of ['/keepView.ts', '/keepRescue.ts']) {
        const module = await request('127.0.0.1', path)
        expect(module.status).toBe(200)
        expect(module.headers['content-type']).toBe('text/javascript; charset=utf-8')
        expect(module.body).not.toMatch(/export (interface|type) /)
        // 브라우저가 ES 모듈로 읽을 수 있는 문법인지 Node 로 문법만 검사한다
        expect(() => execFileSync(process.execPath, ['--input-type=module', '--check'], { input: module.body })).not.toThrow()
      }
    })

    it('가짜 보관 서버와 임시 백업 레포로 사본 목록을 만들고, 보관 서버에는 본 주소 출처의 GET 만 보낸다', async () => {
      const listed: DevicesAnswer = JSON.parse((await request('127.0.0.1', '/api/devices')).body)

      expect(listed.notices).toEqual([])
      expect(listed.devices.map(({ id, name }) => ({ id, name }))).toEqual([{ id: world.idA, name: '예시 폰 A' }, { id: world.idB }])
      expect(listed.devices[0].copies.map(({ kind }) => kind)).toEqual(['latest', 'day', 'month', 'week', 'week'])
      expect(received.length).toBeGreaterThan(0)
      for (const sent of received) expect(sent).toMatchObject({ method: 'GET', origin: APP_ORIGIN })

      const week: CopyAnswer = JSON.parse((await request('127.0.0.1', copyPath(world.idB, listed.devices[1].copies[0]))).body)
      expect(week).toEqual({ ok: true, envelope: world.envelopes.weekB, bytes: bytesOf(fileText(world.envelopes.weekB)) })
    })

    it('클론을 마지막으로 받아 온 때는 FETCH_HEAD 수정 시각으로 본다', async () => {
      const fetchHead = join(world.repo.dir, '.git', 'FETCH_HEAD')
      // 20일 하고 한 시간 전에 받아 온 클론 (도구는 실제 시계로 잰다)
      const old = new Date(Date.now() - 20 * DAY_MS - 60 * 60 * 1000)
      utimesSync(fetchHead, old, old)
      try {
        const listed: DevicesAnswer = JSON.parse((await request('127.0.0.1', '/api/devices')).body)
        expect(listed.notices).toEqual([staleCloneNotice(20)])
      } finally {
        const now = new Date()
        utimesSync(fetchHead, now, now)
      }
    })
  })
})
