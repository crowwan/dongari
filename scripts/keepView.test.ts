import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { keepIdOf as appKeepIdOf, sealKeep } from '../src/features/keep/keepCrypto'
import { CURRENT_SCHEMA_VERSION as APP_SCHEMA_VERSION, type StoredData } from '../src/domain/types'
import { createBackup } from '../src/storage/backup'
import { book, ledger, storedWith } from '../src/test/ledgerFixtures'
import {
  APP_ORIGIN,
  GONE_COPY,
  INVALID_CODE,
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
  copyPath,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PORT,
  envelopePreview,
  handleRequest,
  historyPath,
  isAllowedHost,
  listDevices,
  NO_DEVICE_NAMES,
  NO_KEEP_URL,
  noCloneNotice,
  NOT_THIS_DEVICE,
  openByCode,
  openCopy,
  openedInfo,
  outerInfo,
  parseViewArgs,
  staleCloneNotice,
  unlockDevice,
  type CopyAnswer,
  type CopyItem,
  type CopyRef,
  type DevicesAnswer,
  type DeviceView,
  type GitFn,
  type HistoryAnswer,
  type ViewServer,
  type ViewSources,
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
      child.stdin?.end(input ?? '')
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

function sourcesWith(overrides: Partial<ViewSources> = {}): ViewSources {
  return { keepUrl: KEEP_URL, backupDir: world.repo.dir, fetchFn: fakeKeep(world.routes).fetchFn, git: gitRunner(world.repo.dir).git, ...overrides }
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

describe('SPEC-013 보관본 들여다보기', () => {
  describe('AC-1 로컬 서버는 127.0.0.1 에만 열고 Host 를 검사한다', () => {
    it('기본 포트는 7788 이고 --port 로 바꾼다', () => {
      expect(parseViewArgs([])).toEqual({ ok: true, port: 7788 })
      expect(parseViewArgs(['--port', '7799'])).toEqual({ ok: true, port: 7799 })
      for (const args of [['--port', 'x'], ['--port', '70000'], ['--port'], ['--verbose']]) {
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

    it('클론 마지막 커밋이 8일 넘었으면 git pull 안내를 보이고, 8일 안이면 보이지 않는다', async () => {
      const lastCommit = Date.parse(WEEK_2)
      const minute = 60 * 1000

      const stale = await listDevices(sourcesWith(), lastCommit + 8 * DAY_MS + minute)
      const fresh = await listDevices(sourcesWith(), lastCommit + 8 * DAY_MS - minute)

      expect(stale.notices).toEqual([staleCloneNotice(8)])
      expect(stale.devices).toHaveLength(2)
      expect(fresh.notices).toEqual([])
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
      for (const envelope of [latestA, dayA, monthA, week1A, week2A]) {
        expect(await openCopy(unlocked.normalized, envelope)).toEqual({ ok: true, schemaVersion: 4, bookNames: ['꽃동아리'], entryCount: 2 })
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
  })

  describe('AC-10 이상한 사본에서도 멈추지 않는다', () => {
    it('옛 저장 형식(v3)은 옮기지 않고 형식 번호와 함께 그대로 센다', async () => {
      const v3 = { schemaVersion: 3, books: [{ id: 'a', name: '옛 장부', kind: 'club', ledgers: { 2026: { year: 2026, carryover: 0, entries: [{ id: 'e1' }] } } }], settings: {} }
      const envelope = await sealKeep(CODE_A, JSON.stringify(v3), LATEST_AT)

      const opened = await openCopy(CODE_A, envelope)

      expect(opened).toEqual({ ok: true, schemaVersion: 3, bookNames: ['옛 장부'], entryCount: 1 })
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
  })
})
