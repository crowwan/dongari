import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index'
import { type KeepStore, MAX_BODY_BYTES, MAX_STATUS_BYTES } from './keep'

// KV 가짜: 키·값을 메모리에 둔다
class FakeKeepStore implements KeepStore {
  readonly values = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key)
  }

  async list(options: { prefix: string }): Promise<{ keys: { name: string }[] }> {
    const names = [...this.values.keys()].filter((name) => name.startsWith(options.prefix))
    return { keys: names.map((name) => ({ name })) }
  }
}

const ORIGIN = 'https://crowwan.github.io'
const ID = 'a'.repeat(64)
const URL_FOR_ID = `https://keep.example.workers.dev/v1/keep/${ID}`

function keepBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    v: 1,
    savedAt: '2026-10-12T06:20:00.000Z',
    iv: 'AAECAwQFBgcICQoL',
    data: 'c2VjcmV0',
    ...overrides,
  })
}

function request(
  method: string,
  options: {
    url?: string
    origin?: string | null
    body?: string
    contentType?: string
    authorization?: string
  } = {},
): Request {
  const headers = new Headers()
  const origin = options.origin === undefined ? ORIGIN : options.origin
  if (origin !== null) headers.set('Origin', origin)
  if (options.body !== undefined) headers.set('Content-Type', options.contentType ?? 'application/json')
  if (options.authorization !== undefined) headers.set('Authorization', options.authorization)
  return new Request(options.url ?? URL_FOR_ID, { method, headers, body: options.body })
}

describe('SPEC-006 자동 보관 서버 (Worker)', () => {
  let store: FakeKeepStore
  const send = (req: Request) => worker.fetch(req, { KEEP: store })

  beforeEach(() => {
    store = new FakeKeepStore()
  })

  describe('AC-9 올리기와 받기', () => {
    it('올리면 204 를 주고 keep:<id> 에 받은 JSON 그대로 저장한다', async () => {
      const body = keepBody()
      const res = await send(request('PUT', { body }))

      expect(res.status).toBe(204)
      expect(store.values.get(`keep:${ID}`)).toBe(body)
    })

    it('같은 이름으로 다시 올리면 덮어쓰고, 받으면 마지막 것을 준다', async () => {
      await send(request('PUT', { body: keepBody({ data: 'Zmlyc3Q=' }) }))
      const last = keepBody({ data: 'bGFzdA==', savedAt: '2026-10-13T01:00:00.000Z' })
      await send(request('PUT', { body: last }))

      const res = await send(request('GET'))

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('application/json')
      expect(await res.text()).toBe(last)
    })

    it('보관본이 없으면 404 를 준다', async () => {
      const res = await send(request('GET'))

      expect(res.status).toBe(404)
    })

    it('지우면 204 를 주고 이후 받기는 404 다', async () => {
      await send(request('PUT', { body: keepBody() }))

      const res = await send(request('DELETE'))

      expect(res.status).toBe(204)
      expect((await send(request('GET'))).status).toBe(404)
    })

    it('없는 것을 지워도 204 를 준다', async () => {
      const res = await send(request('DELETE'))

      expect(res.status).toBe(204)
    })
  })

  describe('AC-9 크기 상한 1MB', () => {
    it('본문이 1MB 를 넘으면 413 으로 거부하고 저장하지 않는다', async () => {
      const body = keepBody({ data: 'A'.repeat(MAX_BODY_BYTES) })

      const res = await send(request('PUT', { body }))

      expect(res.status).toBe(413)
      expect(store.values.size).toBe(0)
    })

    it('본문이 딱 1MB 면 받는다', async () => {
      // data 는 4의 배수 길이여야 base64 라서, 남는 자리는 savedAt 소수 자릿수로 채운다
      const room = MAX_BODY_BYTES - keepBody({ data: '' }).length
      const extra = room % 4
      const body = keepBody({
        data: 'A'.repeat(room - extra),
        savedAt: `2026-10-12T06:20:00.000${'0'.repeat(extra)}Z`,
      })
      expect(new TextEncoder().encode(body).byteLength).toBe(MAX_BODY_BYTES)

      const res = await send(request('PUT', { body }))

      expect(res.status).toBe(204)
    })
  })

  describe('AC-9 형식 검사', () => {
    it('이름이 64자 소문자 16진수가 아니면 400 을 준다', async () => {
      const badIds = ['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64)]
      for (const badId of badIds) {
        const url = `https://keep.example.workers.dev/v1/keep/${badId}`
        expect((await send(request('PUT', { url, body: keepBody() }))).status).toBe(400)
        expect((await send(request('GET', { url }))).status).toBe(400)
        expect((await send(request('DELETE', { url }))).status).toBe(400)
      }
    })

    it('본문 형식이 틀리면 400 을 주고 저장하지 않는다', async () => {
      const badBodies = [
        'not json',
        '[]',
        keepBody({ v: 2 }),
        keepBody({ savedAt: '어제' }),
        keepBody({ savedAt: 123 }),
        keepBody({ iv: '' }),
        keepBody({ iv: '***' }),
        keepBody({ data: 42 }),
        keepBody({ data: 'abc' }),
        JSON.stringify({ v: 1, savedAt: '2026-10-12T06:20:00.000Z', iv: 'AAECAwQFBgcICQoL' }),
      ]
      for (const body of badBodies) {
        expect((await send(request('PUT', { body }))).status).toBe(400)
      }
      expect(store.values.size).toBe(0)
    })

    it('Content-Type 이 application/json 이 아니면 400 을 준다', async () => {
      const res = await send(request('PUT', { body: keepBody(), contentType: 'text/plain' }))

      expect(res.status).toBe(400)
    })
  })

  describe('AC-9 허용한 출처만', () => {
    it('허용한 출처에는 Access-Control-Allow-Origin 을 그 값으로 준다', async () => {
      const res = await send(request('PUT', { body: keepBody() }))

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    })

    it('다른 출처는 403 으로 거부하고 저장하지 않는다', async () => {
      const res = await send(request('PUT', { origin: 'https://evil.example', body: keepBody() }))

      expect(res.status).toBe(403)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
      expect(store.values.size).toBe(0)
    })

    it('출처가 없는 요청도 403 으로 거부한다', async () => {
      const res = await send(request('GET', { origin: null }))

      expect(res.status).toBe(403)
    })

    it('미리 요청(OPTIONS)에 204 와 허용 메서드·헤더를 준다', async () => {
      const res = await send(request('OPTIONS'))

      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, PUT, DELETE, OPTIONS')
      expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    })

    it('다른 출처의 미리 요청은 403 이다', async () => {
      const res = await send(request('OPTIONS', { origin: 'https://evil.example' }))

      expect(res.status).toBe(403)
    })
  })

  describe('그 밖의 요청', () => {
    it('다른 경로는 404 를 준다', async () => {
      const paths = ['/', '/v1/keep', '/v1/keep/', `/v2/keep/${ID}`, `/v1/keep/${ID}/more`]
      for (const path of paths) {
        const res = await send(request('GET', { url: `https://keep.example.workers.dev${path}` }))
        expect(res.status).toBe(404)
      }
    })

    it('허용하지 않는 메서드는 405 를 준다', async () => {
      const res = await send(request('POST', { body: keepBody() }))

      expect(res.status).toBe(405)
    })
  })
})

const STATUS_URL = `https://keep.example.workers.dev/v1/status/${ID}`
const REPORT_URL = 'https://keep.example.workers.dev/v1/report'
const TOKEN = 'f'.repeat(64)
const NOW = '2026-10-15T00:00:00.000Z'

function statusBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    v: 1,
    enabled: true,
    pendingSince: '2026-10-14T03:00:00.000Z',
    lastKeptAt: '2026-10-13T09:00:00.000Z',
    tooLarge: false,
    appVersion: '2.6.0',
    ...overrides,
  })
}

describe('SPEC-007 자동 보관 지켜보기 서버 (Worker)', () => {
  let store: FakeKeepStore
  const send = (req: Request, reportToken?: string) =>
    worker.fetch(req, { KEEP: store, REPORT_TOKEN: reportToken })
  const putStatus = (body: string, url = STATUS_URL, origin?: string | null) =>
    send(request('PUT', { url, body, origin }))
  const getReport = (authorization?: string, reportToken: string | undefined = TOKEN) =>
    send(request('GET', { url: REPORT_URL, origin: null, authorization }), reportToken)

  beforeEach(() => {
    store = new FakeKeepStore()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('AC-3 상태 신호 받기', () => {
    it('형식이 맞으면 204 를 주고 받은 때(seenAt)를 붙여 status:<id> 에 저장한다', async () => {
      const res = await putStatus(statusBody())

      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
      expect(JSON.parse(store.values.get(`status:${ID}`) ?? 'null')).toEqual({
        v: 1,
        enabled: true,
        pendingSince: '2026-10-14T03:00:00.000Z',
        lastKeptAt: '2026-10-13T09:00:00.000Z',
        tooLarge: false,
        appVersion: '2.6.0',
        seenAt: NOW,
      })
    })

    it('같은 이름으로 다시 보내면 덮어쓰고 받은 때도 새로 붙인다', async () => {
      await putStatus(statusBody())
      vi.setSystemTime(new Date('2026-10-16T00:00:00.000Z'))

      await putStatus(statusBody({ enabled: false, pendingSince: undefined }))

      expect(JSON.parse(store.values.get(`status:${ID}`) ?? 'null')).toEqual({
        v: 1,
        enabled: false,
        lastKeptAt: '2026-10-13T09:00:00.000Z',
        tooLarge: false,
        appVersion: '2.6.0',
        seenAt: '2026-10-16T00:00:00.000Z',
      })
    })

    it('밀린 때·마지막 보관 시각이 없어도 받는다', async () => {
      const res = await putStatus(statusBody({ pendingSince: undefined, lastKeptAt: undefined }))

      expect(res.status).toBe(204)
    })

    it('보관본(keep:<id>)은 건드리지 않는다', async () => {
      store.values.set(`keep:${ID}`, keepBody())

      await putStatus(statusBody())

      expect(store.values.get(`keep:${ID}`)).toBe(keepBody())
    })

    it('본문 형식이 틀리면 400 을 주고 저장하지 않는다', async () => {
      const badBodies = [
        'not json',
        '[]',
        statusBody({ v: 2 }),
        statusBody({ enabled: 'yes' }),
        statusBody({ enabled: undefined }),
        statusBody({ tooLarge: 0 }),
        statusBody({ tooLarge: undefined }),
        statusBody({ pendingSince: '어제' }),
        statusBody({ pendingSince: null }),
        statusBody({ lastKeptAt: 123 }),
        statusBody({ appVersion: '' }),
        statusBody({ appVersion: 260 }),
        statusBody({ appVersion: 'x'.repeat(33) }),
        statusBody({ appVersion: undefined }),
        statusBody({ ledger: '장부 내용' }),
      ]
      for (const body of badBodies) {
        expect((await putStatus(body)).status).toBe(400)
      }
      expect(store.values.size).toBe(0)
    })

    it('앱 버전이 딱 32자면 받는다', async () => {
      const res = await putStatus(statusBody({ appVersion: 'x'.repeat(32) }))

      expect(res.status).toBe(204)
    })

    it('Content-Type 이 application/json 이 아니면 400 을 준다', async () => {
      const res = await send(
        request('PUT', { url: STATUS_URL, body: statusBody(), contentType: 'text/plain' }),
      )

      expect(res.status).toBe(400)
    })

    it('본문이 4KB 를 넘으면 413 으로 거부하고 저장하지 않는다', async () => {
      const room = MAX_STATUS_BYTES - statusBody({ appVersion: '' }).length
      const body = statusBody({ appVersion: '', pad: ' '.repeat(room + 1) })

      const res = await putStatus(body)

      expect(res.status).toBe(413)
      expect(store.values.size).toBe(0)
    })

    it('이름이 64자 소문자 16진수가 아니면 400 을 준다', async () => {
      const res = await putStatus(statusBody(), `https://keep.example.workers.dev/v1/status/${'A'.repeat(64)}`)

      expect(res.status).toBe(400)
    })

    it('다른 출처나 출처 없는 요청은 403 으로 거부하고 저장하지 않는다', async () => {
      expect((await putStatus(statusBody(), STATUS_URL, 'https://evil.example')).status).toBe(403)
      expect((await putStatus(statusBody(), STATUS_URL, null)).status).toBe(403)
      expect(store.values.size).toBe(0)
    })

    it('허용한 출처의 미리 요청(OPTIONS)에 204 와 CORS 헤더를 준다', async () => {
      const res = await send(request('OPTIONS', { url: STATUS_URL }))

      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    })

    it('PUT 말고는 405 를 준다', async () => {
      for (const method of ['GET', 'DELETE']) {
        expect((await send(request(method, { url: STATUS_URL }))).status).toBe(405)
      }
    })
  })

  describe('AC-4 요약 주기', () => {
    const OTHER_ID = '0123456789abcdef'.repeat(4)

    it('맞는 토큰이면 기기별 요약(id 앞 8자)과 지금 시각을 준다', async () => {
      await putStatus(statusBody())
      vi.setSystemTime(new Date('2026-10-15T01:00:00.000Z'))
      await putStatus(
        statusBody({ enabled: false, pendingSince: undefined, lastKeptAt: undefined, tooLarge: true }),
        `https://keep.example.workers.dev/v1/status/${OTHER_ID}`,
      )
      store.values.set(`keep:${ID}`, keepBody())
      vi.setSystemTime(new Date('2026-10-15T02:00:00.000Z'))

      const res = await getReport(`Bearer ${TOKEN}`)

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('application/json')
      const report: unknown = await res.json()
      expect(report).toEqual({
        now: '2026-10-15T02:00:00.000Z',
        devices: expect.arrayContaining([
          {
            id: 'aaaaaaaa',
            seenAt: NOW,
            enabled: true,
            pendingSince: '2026-10-14T03:00:00.000Z',
            lastKeptAt: '2026-10-13T09:00:00.000Z',
            tooLarge: false,
            appVersion: '2.6.0',
          },
          {
            id: '01234567',
            seenAt: '2026-10-15T01:00:00.000Z',
            enabled: false,
            tooLarge: true,
            appVersion: '2.6.0',
          },
        ]),
      })
      expect(report).toHaveProperty('devices.length', 2)
    })

    it('신호가 하나도 없으면 빈 목록을 준다', async () => {
      const res = await getReport(`Bearer ${TOKEN}`)

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ now: NOW, devices: [] })
    })

    it('토큰이 없거나 틀리면 401 을 준다', async () => {
      await putStatus(statusBody())
      const badAuthorizations = [
        undefined,
        '',
        TOKEN,
        `Basic ${TOKEN}`,
        `Bearer ${'e'.repeat(64)}`,
        `Bearer ${TOKEN.slice(1)}`,
        `Bearer ${TOKEN}0`,
        'Bearer ',
      ]
      for (const authorization of badAuthorizations) {
        const res = await getReport(authorization)
        expect(res.status).toBe(401)
        expect(await res.text()).toBe('')
      }
    })

    it('서버 비밀값 REPORT_TOKEN 이 비어 있으면 늘 401 을 준다', async () => {
      expect((await getReport('Bearer ', '')).status).toBe(401)
      expect((await getReport('Bearer undefined', undefined)).status).toBe(401)
      expect((await getReport(undefined, undefined)).status).toBe(401)
    })

    it('출처 검사를 하지 않고 CORS 헤더도 주지 않는다', async () => {
      const fromApp = await send(
        request('GET', { url: REPORT_URL, authorization: `Bearer ${TOKEN}` }),
        TOKEN,
      )
      const fromElsewhere = await send(
        request('GET', { url: REPORT_URL, origin: 'https://evil.example', authorization: `Bearer ${TOKEN}` }),
        TOKEN,
      )
      const withoutOrigin = await getReport(`Bearer ${TOKEN}`)

      for (const res of [fromApp, fromElsewhere, withoutOrigin]) {
        expect(res.status).toBe(200)
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
      }
      expect((await getReport()).headers.get('Access-Control-Allow-Origin')).toBeNull()
    })

    it('GET 말고는 405 를 준다', async () => {
      const res = await send(
        request('PUT', { url: REPORT_URL, authorization: `Bearer ${TOKEN}`, body: '{}' }),
        TOKEN,
      )

      expect(res.status).toBe(405)
    })
  })

  describe('AC-5 보관본을 지우면 상태 신호도 지운다', () => {
    it('DELETE /v1/keep/:id 는 keep:<id> 와 status:<id> 를 함께 지운다', async () => {
      const OTHER_ID = 'b'.repeat(64)
      await send(request('PUT', { body: keepBody() }))
      await putStatus(statusBody())
      await putStatus(statusBody(), `https://keep.example.workers.dev/v1/status/${OTHER_ID}`)

      const res = await send(request('DELETE'))

      expect(res.status).toBe(204)
      expect([...store.values.keys()]).toEqual([`status:${OTHER_ID}`])
    })
  })

  describe('그 밖의 요청', () => {
    it('비슷하지만 다른 경로는 404 를 준다', async () => {
      const paths = ['/v1/status', '/v1/status/', `/v1/status/${ID}/more`, '/v1/report/', '/v1/reports']
      for (const path of paths) {
        const url = `https://keep.example.workers.dev${path}`
        const res = await send(request('GET', { url, authorization: `Bearer ${TOKEN}` }), TOKEN)
        expect(res.status).toBe(404)
      }
    })
  })
})
