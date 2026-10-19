import { describe, expect, it } from 'vitest'
import { keepIdOf as appKeepIdOf, sealKeep } from '../src/features/keep/keepCrypto'
import { normalizeRecoveryCode as appNormalize } from '../src/features/keep/recoveryCode'
import { createBackup, readBackup } from '../src/storage/backup'
import { book, ledger, storedWith } from '../src/test/ledgerFixtures'
import {
  APP_ORIGIN,
  BROKEN_ENVELOPE,
  describeRescue,
  INVALID_CODE,
  keepIdOf,
  normalizeRecoveryCode,
  NOT_FOUND,
  rescueFileName,
  rescueKeep,
  SERVER_DOWN,
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

// 받은 요청을 적어 두고 정해 둔 답을 주는 가짜 서버
function fakeServer(answer: () => Promise<Response>): { fetchFn: FetchFn; sent: SentRequest[] } {
  const sent: SentRequest[] = []
  const fetchFn: FetchFn = (url, init) => {
    sent.push({ url, method: init.method, headers: init.headers })
    return answer()
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
    it('파일 이름 날짜는 보관한 날의 한국 날짜다', () => {
      expect(rescueFileName(SAVED_AT)).toBe('우리장부-기록-2026-10-19.txt')
    })

    it('요약에 보관 시각(한국 시간)·장부 이름·기록 건수를 넣고 복구 코드는 넣지 않는다', async () => {
      const { envelope } = await appEnvelope()
      const result = await rescueKeep(CODE, KEEP_URL, fakeServer(() => jsonResponse(envelope)).fetchFn)
      if (!result.ok) throw new Error(result.message)

      const text = describeRescue(result, rescueFileName(result.savedAt)).join('\n')

      expect(text).toContain('2026-10-19 01:30')
      expect(text).toContain('꽃동아리, 우리집 가계부')
      expect(text).toContain('3건')
      expect(text).not.toMatch(/HK7M|29QF|MX4P|8R2D/)
    })
  })
})
