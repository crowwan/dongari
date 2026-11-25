import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { parseDeviceNames } from '../ops/keep-backup/scripts/keepWatch.ts'
import { keepIdOf as appKeepIdOf, sealKeep } from '../src/features/keep/keepCrypto'
import { normalizeRecoveryCode as appNormalize } from '../src/features/keep/recoveryCode'
import { createBackup, readBackup } from '../src/storage/backup'
import type { Book } from '../src/domain/types'
import { book, duesBook, ledger, storedWith, type EntrySpec } from '../src/test/ledgerFixtures'
import {
  APP_ORIGIN,
  BROKEN_ENVELOPE,
  BROKEN_FILE,
  BROKEN_HISTORY,
  describeList,
  describeRescue,
  GONE_COPY,
  INVALID_CODE,
  keepIdOf,
  listKeep,
  NO_HISTORY_ROUTE,
  normalizeRecoveryCode,
  NOT_FOUND,
  NOT_THIS_CODE_FILE,
  parseRescueArgs,
  RESCUE_USAGE,
  rescueDir,
  rescueFile,
  rescueFileName,
  rescueKeep,
  SERVER_DOWN,
  whichKeep,
  WRONG_CODE,
} from './keepRescue.ts'
import type { FetchFn } from './keepRescue.ts'

const CODE = 'HK7M-29QF-MX4P-8R2D'
const KEEP_URL = 'https://keep.example.workers.dev/'
const SAVED_AT = '2026-10-18T16:30:00.000Z' // 한국 시간 10월 19일 01:30

interface SentRequest {
  url: string
  method: string
  headers: Record<string, string>
}

// 받은 요청을 적어 두고 정해 둔 답을 주는 가짜 서버 (주소에 따라 답을 고를 수 있다)
function fakeServer(answer: (url: string) => Promise<Response>): { fetchFn: FetchFn; sent: SentRequest[] } {
  const sent: SentRequest[] = []
  const fetchFn: FetchFn = (url, init) => {
    sent.push({ url, method: init.method, headers: init.headers })
    return answer(url)
  }
  return { fetchFn, sent }
}

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

// 앱의 자동 보관기가 올리는 것과 같은 보관본: 기록 파일 글자를 앱의 sealKeep 으로 암호화
async function appEnvelope(code: string = CODE) {
  const data = {
    ...storedWith(),
    books: [
      book([ledger([[3, 'income', '회비', 10_000], [3, 'expense', '간식', 5_000]], { year: 2026 })], { id: 'a', name: '꽃동아리' }),
      book([ledger([[1, 'expense', '장보기', 30_000]], { year: 2026 })], { id: 'b', name: '우리집 가계부', kind: 'household' }),
    ],
    settings: { recoveryCode: code },
  }
  const plain = createBackup(data, new Date(SAVED_AT)).text
  return { plain, envelope: await sealKeep(code, plain, SAVED_AT) }
}

describe('#154 보관본 꺼내기 스크립트', () => {
  describe('앱과 같은 암호 방식', () => {
    it('복구 코드 정규화가 앱과 같다', () => {
      for (const input of [CODE, 'hk7m 29qf mx4p 8r2d', 'HK7M29QFMX4P8R2D', 'HK7M-29QF-MX4P-8R2', 'HK7M-29QF-MX4P-8R2O']) {
        expect(normalizeRecoveryCode(input)).toBe(appNormalize(input))
      }
    })

    it('같은 코드로 앱과 같은 서버 이름을 만든다', async () => {
      expect(await keepIdOf(CODE)).toBe(await appKeepIdOf(CODE))
    })

    it('앱이 만든 보관본을 같은 코드로 풀면 앱의 [기록 파일 불러오기](readBackup)로 그대로 읽힌다', async () => {
      const { plain, envelope } = await appEnvelope()
      const server = fakeServer(() => jsonResponse(envelope))

      const result = await rescueKeep('hk7m 29qf mx4p 8r2d', KEEP_URL, server.fetchFn)

      if (!result.ok) throw new Error(result.message)
      expect(result.plain).toBe(plain)
      expect(readBackup(result.plain)).toMatchObject({ ok: true, summary: { bookCount: 2, entryCount: 3 } })
      expect(result.savedAt).toBe(SAVED_AT)
      expect(result.summary).toEqual({ bookNames: ['꽃동아리', '우리집 가계부'], entryCount: 3 })
    })
  })

  describe('SPEC-010 저장 형식 v4', () => {
    it('AC-3 앱이 만든 v4 보관본(회원 명단·월 회비·낸 분·엑셀 글)을 풀면 기록 파일로 그대로 읽힌다', async () => {
      const data = { ...storedWith(), books: [duesBook()], settings: { recoveryCode: CODE } }
      const plain = createBackup(data, new Date(SAVED_AT)).text
      const server = fakeServer(async () => jsonResponse(await sealKeep(CODE, plain, SAVED_AT)))

      const result = await rescueKeep(CODE, KEEP_URL, server.fetchFn)

      if (!result.ok) throw new Error(result.message)
      expect(result.summary).toEqual({ bookNames: ['한랑드림'], entryCount: 2 })
      const read = readBackup(result.plain)
      if (!read.ok) throw new Error(read.reason)
      expect(read.data.schemaVersion).toBe(4)
      expect(read.data.books).toEqual(data.books)
    })
  })

  describe('서버에는 읽기만', () => {
    it('본 주소 출처로 GET 하나만 보내고, 주소에는 코드가 아니라 코드에서 만든 이름을 쓴다', async () => {
      const { envelope } = await appEnvelope()
      const server = fakeServer(() => jsonResponse(envelope))

      await rescueKeep(CODE, KEEP_URL, server.fetchFn)

      expect(server.sent).toEqual([
        { url: `https://keep.example.workers.dev/v1/keep/${await appKeepIdOf(CODE)}`, method: 'GET', headers: { Origin: APP_ORIGIN } },
      ])
      expect(server.sent[0].url).not.toContain('HK7M')
    })
  })

  describe('실패마다 다른 안내', () => {
    it('형식이 틀린 코드는 서버를 부르지 않고 형식 안내를 한다', async () => {
      const server = fakeServer(() => jsonResponse({}))
      expect(await rescueKeep('HK7M-29QF', KEEP_URL, server.fetchFn)).toEqual({ ok: false, message: INVALID_CODE })
      expect(server.sent).toEqual([])
    })

    it('보관본이 없으면(404) 없음 안내를 한다', async () => {
      const server = fakeServer(() => Promise.resolve(new Response(null, { status: 404 })))
      expect(await rescueKeep(CODE, KEEP_URL, server.fetchFn)).toEqual({ ok: false, message: NOT_FOUND })
    })

    it('다른 코드로 잠긴 보관본이면 풀기 실패 안내를 한다', async () => {
      const { envelope } = await appEnvelope('ABCD-EFGH-JKMN-PQRS')
      const server = fakeServer(() => jsonResponse(envelope))
      expect(await rescueKeep(CODE, KEEP_URL, server.fetchFn)).toEqual({ ok: false, message: WRONG_CODE })
    })

    it('서버 오류(5xx)면 상태 코드를 넣은 서버 오류 안내를 한다', async () => {
      const server = fakeServer(() => Promise.resolve(new Response(null, { status: 503 })))
      const result = await rescueKeep(CODE, KEEP_URL, server.fetchFn)
      expect(result).toEqual({ ok: false, message: expect.stringContaining('HTTP 503') })
    })

    it('서버에 닿지 못하면 연결 실패 안내를 한다', async () => {
      const server = fakeServer(() => Promise.reject(new TypeError('fetch failed')))
      expect(await rescueKeep(CODE, KEEP_URL, server.fetchFn)).toEqual({ ok: false, message: SERVER_DOWN })
    })

    it('서버 답이 보관본 모양이 아니면 그렇게 안내한다', async () => {
      const server = fakeServer(() => jsonResponse({ hello: 'world' }))
      expect(await rescueKeep(CODE, KEEP_URL, server.fetchFn)).toEqual({ ok: false, message: BROKEN_ENVELOPE })
    })
  })

  describe('파일 이름과 요약', () => {
    it('최신본 파일 이름은 보관한 날의 한국 날짜에 "-최신" 을 붙여 같은 날 날짜별 사본 파일과 겹치지 않는다 (#190 리뷰)', () => {
      expect(rescueFileName(SAVED_AT)).toBe('우리장부-기록-2026-10-19-최신.txt')
      expect(rescueFileName(SAVED_AT, { kind: 'day', date: '2026-10-19' })).toBe('우리장부-기록-2026-10-19.txt')
    })

    it('기록 파일은 기본으로 레포 밖 ~/Downloads 에, 없으면 홈에 둔다 (지금 폴더가 아니다)', () => {
      expect(rescueDir({}, '/Users/me', true)).toBe('/Users/me/Downloads')
      expect(rescueDir({}, '/Users/me', false)).toBe('/Users/me')
    })

    it('RESCUE_DIR 이 있으면 그 폴더에 둔다', () => {
      expect(rescueDir({ RESCUE_DIR: '/tmp/rescue' }, '/Users/me', true)).toBe('/tmp/rescue')
    })

    it('요약에 보관 시각(한국 시간)·장부 이름·기록 건수를 넣고 복구 코드는 넣지 않는다', async () => {
      const { envelope } = await appEnvelope()
      const result = await rescueKeep(CODE, KEEP_URL, fakeServer(() => jsonResponse(envelope)).fetchFn)
      if (!result.ok) throw new Error(result.message)

      const text = describeRescue(result, rescueFileName(result.savedAt)).join('\n')

      expect(text).toContain('2026-10-19 01:30')
      expect(text).toContain('꽃동아리, 우리집 가계부')
      expect(text).toContain('3건')
      expect(text).toContain('다 보냈으면 이 파일을 지우세요')
      expect(text).not.toMatch(/HK7M|29QF|MX4P|8R2D/)
    })
  })
})

// 장부들을 기록 파일 글자로 만들어 앱의 sealKeep 으로 잠근 보관본
async function sealedBooks(books: Book[], savedAt: string, code: string = CODE) {
  const plain = createBackup({ ...storedWith(), books, settings: { recoveryCode: code } }, new Date(savedAt)).text
  return { plain, envelope: await sealKeep(code, plain, savedAt) }
}

const flowerClub = (specs: EntrySpec[]) => book([ledger(specs, { year: 2026 })], { id: 'a', name: '꽃동아리' })

describe('SPEC-011 꺼내기 스크립트 날짜 고르기', () => {
  // 서버의 사본 목록 (GET /v1/keep/<id>/history): 최신본 11월 24일, 날짜별 21일·20일, 달별 10월
  const HISTORY = {
    latest: { savedAt: '2026-11-24T00:30:00.000Z' }, // 한국 시간 09:30
    days: [
      { date: '2026-11-21', savedAt: '2026-11-21T13:10:00.000Z' }, // 22:10
      { date: '2026-11-20', savedAt: '2026-11-20T03:00:00.000Z' }, // 12:00
    ],
    months: [{ month: '2026-10', savedAt: '2026-10-31T12:00:00.000Z' }], // 21:00
  }

  // 주소에 따라 목록·최신본·날짜별·달별 사본을 주는 가짜 서버. 11월 20일 사본은 다른 코드로 잠겨 있다
  async function historyServer(history: unknown = HISTORY) {
    const base = `https://keep.example.workers.dev/v1/keep/${await appKeepIdOf(CODE)}`
    const latest = await appEnvelope()
    const day21 = await sealedBooks([flowerClub([[11, 'income', '회비', 10_000]])], HISTORY.days[0].savedAt)
    const day20 = await sealedBooks([flowerClub([])], HISTORY.days[1].savedAt, 'ABCD-EFGH-JKMN-PQRS')
    const october = await sealedBooks(
      [flowerClub([[10, 'income', '회비', 10_000], [10, 'expense', '꽃', 3_000]])],
      HISTORY.months[0].savedAt,
    )
    const answers = new Map<string, unknown>([
      [`${base}/history`, history],
      [base, latest.envelope],
      [`${base}?day=2026-11-21`, day21.envelope],
      [`${base}?day=2026-11-20`, day20.envelope],
      [`${base}?month=2026-10`, october.envelope],
    ])
    const server = fakeServer((url) => {
      const answer = answers.get(url)
      return answer === undefined ? Promise.resolve(new Response(null, { status: 404 })) : jsonResponse(answer)
    })
    return { ...server, base, plains: { day21: day21.plain, october: october.plain } }
  }

  describe('AC-7 명령줄', () => {
    it('옵션이 없으면 최신본, --list 는 목록, --day·--month 는 그 날·달 사본을 고르고 남은 인자 하나는 복구 코드다', () => {
      expect(parseRescueArgs([])).toEqual({ ok: true, command: { action: 'rescue', target: { kind: 'latest' } } })
      expect(parseRescueArgs([CODE])).toEqual({
        ok: true,
        command: { action: 'rescue', target: { kind: 'latest' }, code: CODE },
      })
      expect(parseRescueArgs(['--list'])).toEqual({ ok: true, command: { action: 'list' } })
      expect(parseRescueArgs(['--day', '2026-11-21'])).toEqual({
        ok: true,
        command: { action: 'rescue', target: { kind: 'day', date: '2026-11-21' } },
      })
      expect(parseRescueArgs(['--month', '2026-10', CODE])).toEqual({
        ok: true,
        command: { action: 'rescue', target: { kind: 'month', month: '2026-10' }, code: CODE },
      })
    })

    it('--file 은 뒤의 경로로 백업 레포 파일을 고른다', () => {
      expect(parseRescueArgs(['--file', 'keep/abc.json'])).toEqual({ ok: true, command: { action: 'file', path: 'keep/abc.json' } })
      expect(parseRescueArgs([CODE, '--file', '../backup/keep/abc.json'])).toEqual({
        ok: true,
        command: { action: 'file', path: '../backup/keep/abc.json', code: CODE },
      })
    })

    it('날·달 형식이 틀리거나, 옵션을 함께 주거나, 모르는 옵션·남는 인자가 있으면 쓰는 법을 안내한다', () => {
      const badArgs = [
        ['--day'],
        ['--day', '2026-11'],
        ['--day', '2026-13-01'],
        ['--day', CODE],
        ['--month', '2026-10-31'],
        ['--month', '2026-13'],
        ['--list', '--day', '2026-11-21'],
        ['--day', '2026-11-21', '--month', '2026-10'],
        ['--all'],
        [CODE, 'extra'],
        ['--file'],
        ['--file', '--list'],
        ['--file', 'keep/abc.json', '--list'],
        ['--day', '2026-11-21', '--file', 'keep/abc.json'],
      ]
      for (const args of badArgs) {
        expect(parseRescueArgs(args)).toEqual({ ok: false, message: expect.stringContaining(RESCUE_USAGE) })
      }
    })

    it('달력에 없는 날(2월 30일 등)은 서버에 묻지 않고 쓰는 법을 안내하고, 윤년 2월 29일은 받는다 (#190 리뷰)', () => {
      for (const day of ['2026-02-29', '2026-02-30', '2026-04-31']) {
        expect(parseRescueArgs(['--day', day])).toEqual({ ok: false, message: expect.stringContaining(RESCUE_USAGE) })
      }
      expect(parseRescueArgs(['--day', '2028-02-29'])).toMatchObject({ ok: true })
    })
  })

  describe('AC-7 --day·--month 로 사본 꺼내기', () => {
    it('--day 는 그 날 사본을 ?day= 로 받아 풀고, 기록 파일 이름에 그 날을 넣는다', async () => {
      const server = await historyServer()
      const target = { kind: 'day', date: '2026-11-21' } as const

      const result = await rescueKeep(CODE, KEEP_URL, server.fetchFn, target)

      expect(server.sent).toEqual([{ url: `${server.base}?day=2026-11-21`, method: 'GET', headers: { Origin: APP_ORIGIN } }])
      if (!result.ok) throw new Error(result.message)
      expect(result.plain).toBe(server.plains.day21)
      expect(readBackup(result.plain)).toMatchObject({ ok: true, summary: { bookCount: 1, entryCount: 1 } })
      expect(rescueFileName(result.savedAt, target)).toBe('우리장부-기록-2026-11-21.txt')
    })

    it('--month 는 그 달 사본을 ?month= 로 받아 풀고, 기록 파일 이름에 그 달을 넣는다', async () => {
      const server = await historyServer()
      const target = { kind: 'month', month: '2026-10' } as const

      const result = await rescueKeep(CODE, KEEP_URL, server.fetchFn, target)

      expect(server.sent.map(({ url }) => url)).toEqual([`${server.base}?month=2026-10`])
      if (!result.ok) throw new Error(result.message)
      expect(result.plain).toBe(server.plains.october)
      expect(result.summary).toEqual({ bookNames: ['꽃동아리'], entryCount: 2 })
      expect(rescueFileName(result.savedAt, target)).toBe('우리장부-기록-2026-10.txt')
    })

    it('고른 날·달 사본이 없으면(404) 그 날·달을 넣어 --list 로 있는 것을 보라고 안내한다', async () => {
      const server = await historyServer()

      const day = await rescueKeep(CODE, KEEP_URL, server.fetchFn, { kind: 'day', date: '2026-11-19' })
      const month = await rescueKeep(CODE, KEEP_URL, server.fetchFn, { kind: 'month', month: '2026-09' })

      expect(day).toEqual({ ok: false, message: expect.stringMatching(/2026-11-19.*--list/) })
      expect(month).toEqual({ ok: false, message: expect.stringMatching(/2026-09.*--list/) })
    })

    it('꺼낸 요약에 어떤 사본인지 적고 복구 코드는 넣지 않는다', async () => {
      const server = await historyServer()
      const target = { kind: 'day', date: '2026-11-21' } as const
      const result = await rescueKeep(CODE, KEEP_URL, server.fetchFn, target)
      if (!result.ok) throw new Error(result.message)

      const text = describeRescue(result, rescueFileName(result.savedAt, target), target).join('\n')

      expect(text).toContain('꺼낸 사본: 2026-11-21 날짜별 사본')
      expect(text).toContain('2026-11-21 22:10')
      expect(text).toContain('우리장부-기록-2026-11-21.txt')
      expect(text).not.toMatch(/HK7M|29QF|MX4P|8R2D/)
    })
  })

  describe('AC-7 --list 사본 목록', () => {
    it('최신본·날짜별·달별 사본을 최신 것부터 한국 시각과 함께, 풀어 본 장부 이름·기록 건수로 보인다', async () => {
      const server = await historyServer()

      const result = await listKeep('hk7m 29qf mx4p 8r2d', KEEP_URL, server.fetchFn)

      if (!result.ok) throw new Error(result.message)
      const lines = describeList(result.rows)
      expect(lines).toContain('최신본: 2026-11-24 09:30 보관 · 꽃동아리, 우리집 가계부 · 기록 3건')
      expect(lines).toContain('  2026-11-21: 2026-11-21 22:10 보관 · 꽃동아리 · 기록 1건')
      expect(lines).toContain('  2026-10: 2026-10-31 21:00 보관 · 꽃동아리 · 기록 2건')
      expect(lines.findIndex((line) => line.includes('2026-11-21:'))).toBeLessThan(
        lines.findIndex((line) => line.includes('2026-11-20:')),
      )
      expect(lines.join('\n')).not.toMatch(/HK7M|29QF|MX4P|8R2D/)
      // 목록 하나 + 사본마다 하나씩, 모두 본 주소 출처의 GET
      expect(server.sent.map(({ url }) => url).sort()).toEqual(
        [server.base, `${server.base}/history`, `${server.base}?day=2026-11-20`, `${server.base}?day=2026-11-21`, `${server.base}?month=2026-10`].sort(),
      )
      expect(server.sent.every(({ method, headers }) => method === 'GET' && headers.Origin === APP_ORIGIN)).toBe(true)
    })

    it('풀지 못한 사본은 그 줄에 이유를 적고 나머지 줄은 그대로 보인다', async () => {
      const server = await historyServer()

      const result = await listKeep(CODE, KEEP_URL, server.fetchFn)

      if (!result.ok) throw new Error(result.message)
      expect(describeList(result.rows)).toContain(`  2026-11-20: 2026-11-20 12:00 보관 · 풀지 못했어요 (${WRONG_CODE})`)
    })

    it('목록을 받은 뒤 사라진 사본(404)은 그 줄에 목록용 문구를 적는다 (#190 리뷰)', async () => {
      const gone = { date: '2026-11-19', savedAt: '2026-11-19T03:00:00.000Z' }
      const server = await historyServer({ ...HISTORY, days: [...HISTORY.days, gone] })

      const result = await listKeep(CODE, KEEP_URL, server.fetchFn)

      if (!result.ok) throw new Error(result.message)
      const line = describeList(result.rows).find((text) => text.startsWith('  2026-11-19:'))
      expect(line).toBe(`  2026-11-19: 2026-11-19 12:00 보관 · 풀지 못했어요 (${GONE_COPY})`)
      expect(line).not.toContain('--list')
    })

    it('사본이 하나도 없으면 없음 안내를 한다', async () => {
      const server = await historyServer({ days: [], months: [] })

      expect(await listKeep(CODE, KEEP_URL, server.fetchFn)).toEqual({ ok: false, message: NOT_FOUND })
    })

    it('목록 답이 모양이 아니거나 목록 경로가 없는 예전 서버·서버 오류·연결 실패·코드 형식 틀림이면 각각 안내한다', async () => {
      const broken = await historyServer({ days: 'x' })
      const oldServer = fakeServer(() => Promise.resolve(new Response(null, { status: 404 })))
      const down = fakeServer(() => Promise.reject(new TypeError('fetch failed')))
      const failing = fakeServer(() => Promise.resolve(new Response(null, { status: 503 })))

      expect(await listKeep(CODE, KEEP_URL, broken.fetchFn)).toEqual({ ok: false, message: BROKEN_HISTORY })
      expect(await listKeep(CODE, KEEP_URL, oldServer.fetchFn)).toEqual({ ok: false, message: NO_HISTORY_ROUTE })
      expect(await listKeep(CODE, KEEP_URL, down.fetchFn)).toEqual({ ok: false, message: SERVER_DOWN })
      expect(await listKeep(CODE, KEEP_URL, failing.fetchFn)).toEqual({ ok: false, message: expect.stringContaining('HTTP 503') })
      expect(await listKeep('HK7M', KEEP_URL, down.fetchFn)).toEqual({ ok: false, message: INVALID_CODE })
    })
  })

  // 백업 레포 파일 keep/<id>.json: 서버 내보내기의 겉봉투를 그대로 쓴 JSON (ops/keep-backup)
  async function backupFile(code: string = CODE) {
    const { plain, envelope } = await appEnvelope(code)
    return { plain, fileName: `${await appKeepIdOf(code)}.json`, text: `${JSON.stringify(envelope)}\n` }
  }

  describe('AC-7 --file 로 백업 레포 파일 꺼내기', () => {
    it('서버 없이 백업 레포의 keep/<id>.json 을 풀어 앱의 [기록 파일 불러오기]로 읽히는 기록 파일을 만든다', async () => {
      const file = await backupFile()

      const result = await rescueFile('hk7m 29qf mx4p 8r2d', file.fileName, file.text)

      if (!result.ok) throw new Error(result.message)
      expect(result.plain).toBe(file.plain)
      expect(readBackup(result.plain)).toMatchObject({ ok: true, summary: { bookCount: 2, entryCount: 3 } })
      expect(result.savedAt).toBe(SAVED_AT)
      expect(rescueFileName(result.savedAt, { kind: 'file' })).toBe('우리장부-기록-2026-10-19-주간사본.txt')
    })

    it('파일 이름의 id 가 이 코드에서 만든 id 와 다르면 "이 코드의 파일이 아니에요" 로 멈추고 이 코드의 파일 이름(id 앞 8자)을 알려 준다', async () => {
      const other = await backupFile('ABCD-EFGH-JKMN-PQRS')
      const ownId = await appKeepIdOf(CODE)

      for (const fileName of [other.fileName, 'backup.json', `${ownId}.json.bak`]) {
        const result = await rescueFile(CODE, fileName, other.text)
        expect(result).toEqual({ ok: false, message: expect.stringContaining(NOT_THIS_CODE_FILE) })
        expect(result).toEqual({ ok: false, message: expect.stringContaining(`keep/${ownId.slice(0, 8)}`) })
      }
    })

    it('파일이 보관본 모양이 아니면 그렇게 안내하고, 코드 형식이 틀리면 형식 안내를 한다', async () => {
      const { fileName } = await backupFile()

      for (const text of ['not json', '{"hello":"world"}', '[]']) {
        expect(await rescueFile(CODE, fileName, text)).toEqual({ ok: false, message: BROKEN_FILE })
      }
      expect(await rescueFile('HK7M', fileName, '{}')).toEqual({ ok: false, message: INVALID_CODE })
    })

    it('꺼낸 요약에 서버 밖 주간 사본이라고 적고 복구 코드는 넣지 않는다', async () => {
      const file = await backupFile()
      const result = await rescueFile(CODE, file.fileName, file.text)
      if (!result.ok) throw new Error(result.message)

      const text = describeRescue(result, rescueFileName(result.savedAt, { kind: 'file' }), { kind: 'file' }).join('\n')

      expect(text).toContain('꺼낸 사본: 서버 밖 주간 사본 (백업 레포 파일)')
      expect(text).toContain('우리장부-기록-2026-10-19-주간사본.txt')
      expect(text).not.toMatch(/HK7M|29QF|MX4P|8R2D/)
    })
  })
})

describe('SPEC-012 AC-3 꺼내기 스크립트 --which (기기 이름표의 앞 8자)', () => {
  // 명령줄을 그대로 돌린다(레포 맨 위에서, 다른 테스트의 파일 읽기와 같이). KEEP_URL 은 넘기지 않는다(서버를 부르지 않으니 필요 없어야 한다)
  function runRescue(args: string[], input: string) {
    return spawnSync(process.execPath, ['scripts/keep-rescue.mjs', ...args], {
      input,
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    })
  }

  it('--which 는 앞 8자 보기를 고르고, 복구 코드는 다른 일처럼 인자로도 받는다', () => {
    expect(parseRescueArgs(['--which'])).toEqual({ ok: true, command: { action: 'which' } })
    expect(parseRescueArgs([CODE, '--which'])).toEqual({ ok: true, command: { action: 'which', code: CODE } })
    expect(RESCUE_USAGE).toContain('--which')
  })

  it('--which 를 다른 옵션과 같이 쓰면 쓰는 법을 안내한다', () => {
    const badArgs = [
      ['--which', '--list'],
      ['--day', '2026-11-21', '--which'],
      ['--which', '--month', '2026-10'],
      ['--file', 'keep/abc.json', '--which'],
      ['--which', '--which'],
    ]
    for (const args of badArgs) {
      const parsed = parseRescueArgs(args)
      expect(parsed).toEqual({ ok: false, message: expect.stringContaining(RESCUE_USAGE) })
      expect(parsed).toEqual({ ok: false, message: expect.stringContaining('--which 은 하나만 써요') })
    }
  })

  it('복구 코드에서 앱과 같은 서버 이름을 만들어 앞 8자만 돌려주고, 서버는 부르지 않는다', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const result = await whichKeep('hk7m 29qf mx4p 8r2d')

      expect(result).toEqual({ ok: true, prefix: (await appKeepIdOf(CODE)).slice(0, 8) })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('찍는 앞 8자는 그대로 devices.json 의 키로 쓸 수 있다', async () => {
    const result = await whichKeep(CODE)
    if (!result.ok) throw new Error(result.message)

    expect(parseDeviceNames(JSON.stringify({ [result.prefix]: '엄마 폰' }))).toEqual({
      ok: true,
      names: new Map([[result.prefix, '엄마 폰']]),
    })
  })

  it('형식이 틀린 코드는 거절한다', async () => {
    expect(await whichKeep('HK7M-29QF')).toEqual({ ok: false, message: INVALID_CODE })
    expect(await whichKeep('HK7M-29QF-MX4P-8R2O')).toEqual({ ok: false, message: INVALID_CODE })
  })

  it('명령줄: 표준 입력으로 받은 코드의 앞 8자 한 줄만 찍고, KEEP_URL 없이 돌며 코드는 어디에도 찍지 않는다', { timeout: 30_000 }, async () => {
    const run = runRescue(['--which'], `${CODE}\n`)

    expect(run.status).toBe(0)
    expect(run.stdout).toBe(`${(await appKeepIdOf(CODE)).slice(0, 8)}\n`)
    expect(`${run.stdout}${run.stderr}`).not.toMatch(/HK7M|29QF|MX4P|8R2D/)
  })

  it('명령줄: 형식이 틀린 코드는 형식 안내와 함께 실패(종료 코드 1)한다', { timeout: 30_000 }, () => {
    const run = runRescue(['--which'], 'HK7M-29QF\n')

    expect(run.status).toBe(1)
    expect(run.stdout).toBe('')
    expect(run.stderr).toContain(INVALID_CODE)
  })

  it('명령줄: 다른 옵션과 같이 쓰면 코드를 묻기 전에 쓰는 법을 찍고 멈춘다', { timeout: 30_000 }, () => {
    const run = runRescue(['--which', '--list'], `${CODE}\n`)

    expect(run.status).toBe(1)
    expect(run.stdout).toBe('')
    expect(run.stderr).toContain('--which 은 하나만 써요')
    expect(run.stderr).toContain(RESCUE_USAGE)
  })
})
