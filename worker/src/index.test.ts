import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index'
import {
  handleKeepRequest,
  type KeepPutOptions,
  type KeepStore,
  MAX_BODY_BYTES,
  MAX_STATUS_BYTES,
} from './keep'

// KV 가짜: 키·값과 metadata·TTL 을 메모리에 둔다 (Cloudflare KV 처럼 다시 쓰면 metadata·TTL 도 새로, list 는 이름순)
class FakeKeepStore implements KeepStore {
  readonly values = new Map<string, string>()
  readonly metadata = new Map<string, unknown>()
  readonly ttls = new Map<string, number>()
  // 이 키에 쓰면 실패하게 한다 (KV 쓰기 실패 흉내)
  failPut: (key: string) => boolean = () => false

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async getWithMetadata(key: string): Promise<{ value: string | null; metadata: unknown }> {
    return { value: this.values.get(key) ?? null, metadata: this.metadata.get(key) ?? null }
  }

  async put(key: string, value: string, options: KeepPutOptions = {}): Promise<void> {
    if (this.failPut(key)) throw new Error('KV 쓰기 실패')
    this.values.set(key, value)
    this.metadata.delete(key)
    this.ttls.delete(key)
    if (options.metadata !== undefined) this.metadata.set(key, options.metadata)
    if (options.expirationTtl !== undefined) this.ttls.set(key, options.expirationTtl)
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key)
    this.metadata.delete(key)
    this.ttls.delete(key)
  }

  async list(options: { prefix: string }): Promise<{ keys: { name: string; metadata?: unknown }[] }> {
    const names = [...this.values.keys()].filter((name) => name.startsWith(options.prefix)).sort()
    return {
      keys: names.map((name) => (this.metadata.has(name) ? { name, metadata: this.metadata.get(name) } : { name })),
    }
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

const PREVIEW_ORIGIN = 'https://uri-jangbu-preview.pages.dev'

describe('SPEC-006·SPEC-007 미리보기 주소는 저장 자리를 나눈다 (#128)', () => {
  let store: FakeKeepStore
  const send = (req: Request, reportToken?: string) =>
    worker.fetch(req, { KEEP: store, REPORT_TOKEN: reportToken })
  const fromPreview = (method: string, options: { url?: string; body?: string } = {}) =>
    send(request(method, { ...options, origin: PREVIEW_ORIGIN }))

  beforeEach(() => {
    store = new FakeKeepStore()
  })

  it('미리보기에서 올린 보관본은 preview:keep:<id> 에만 저장하고 본 사본(keep:<id>)은 그대로 둔다', async () => {
    const main = keepBody({ data: 'bWFpbg==' })
    store.values.set(`keep:${ID}`, main)
    const preview = keepBody({ data: 'cHJldmlldw==' })

    const res = await fromPreview('PUT', { body: preview })

    expect(res.status).toBe(204)
    expect(store.values.get(`preview:keep:${ID}`)).toBe(preview)
    expect(store.values.get(`keep:${ID}`)).toBe(main)
  })

  it('미리보기에서 받으면 미리보기 자리의 것만 준다 (같은 복구 코드라도 본 사본을 주지 않는다)', async () => {
    store.values.set(`keep:${ID}`, keepBody({ data: 'bWFpbg==' }))

    expect((await fromPreview('GET')).status).toBe(404)

    const preview = keepBody({ data: 'cHJldmlldw==' })
    store.values.set(`preview:keep:${ID}`, preview)
    const res = await fromPreview('GET')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(preview)
  })

  it('미리보기에서 지우면 미리보기 자리의 보관본·상태 신호만 지운다', async () => {
    store.values.set(`keep:${ID}`, keepBody())
    store.values.set(`status:${ID}`, statusBody())
    store.values.set(`preview:keep:${ID}`, keepBody())
    store.values.set(`preview:status:${ID}`, statusBody())

    const res = await fromPreview('DELETE')

    expect(res.status).toBe(204)
    expect([...store.values.keys()].sort()).toEqual([`keep:${ID}`, `status:${ID}`])
  })

  it('미리보기에서 보낸 상태 신호는 preview:status:<id> 에 저장한다', async () => {
    const res = await fromPreview('PUT', { url: STATUS_URL, body: statusBody() })

    expect(res.status).toBe(204)
    expect([...store.values.keys()]).toEqual([`preview:status:${ID}`])
  })

  it('본 주소 요청은 지금처럼 keep:<id>·status:<id> 에 저장한다', async () => {
    await send(request('PUT', { body: keepBody() }))
    await send(request('PUT', { url: STATUS_URL, body: statusBody() }))

    expect([...store.values.keys()].sort()).toEqual([`keep:${ID}`, `status:${ID}`])
  })

  it('요약(/v1/report)은 본 자리(status:)만 보고 미리보기 신호는 넣지 않는다', async () => {
    await send(request('PUT', { url: STATUS_URL, body: statusBody() }))
    const PREVIEW_ONLY_ID = 'c'.repeat(64)
    await fromPreview('PUT', {
      url: `https://keep.example.workers.dev/v1/status/${PREVIEW_ONLY_ID}`,
      body: statusBody(),
    })
    // 미리보기 신호가 실제로 저장된 뒤에도 요약에 안 들어가는지 본다
    expect(store.values.has(`preview:status:${PREVIEW_ONLY_ID}`)).toBe(true)

    const res = await send(
      request('GET', { url: REPORT_URL, origin: null, authorization: `Bearer ${TOKEN}` }),
      TOKEN,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toHaveProperty('devices', [expect.objectContaining({ id: 'aaaaaaaa' })])
  })

  it('미리보기 출처에는 Access-Control-Allow-Origin 을 그 출처 그대로 준다 (미리 요청 포함)', async () => {
    const options = await fromPreview('OPTIONS')
    const put = await fromPreview('PUT', { body: keepBody() })

    expect(options.status).toBe(204)
    for (const res of [options, put]) {
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PREVIEW_ORIGIN)
      expect(res.headers.get('Vary')).toBe('Origin')
    }
  })

  it('미리보기의 배포별 주소·비슷한 주소·http 는 403 으로 거부하고 저장하지 않는다', async () => {
    const origins = [
      'https://0a1b2c3d.uri-jangbu-preview.pages.dev',
      'http://uri-jangbu-preview.pages.dev',
      'https://uri-jangbu-preview.pages.dev.evil.example',
      'https://uri-jangbu-preview.pages.dev/',
      'https://evil-uri-jangbu-preview.pages.dev',
    ]
    for (const origin of origins) {
      const res = await send(request('PUT', { origin, body: keepBody() }))
      expect(res.status).toBe(403)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
    }
    expect(store.values.size).toBe(0)
  })
})

const DAY_TTL = 2_678_400 // 31일
const MONTH_TTL = 34_560_000 // 400일
const HISTORY_URL = `${URL_FOR_ID}/history`

describe('SPEC-011 보관본 날짜별 사본 (Worker)', () => {
  let store: FakeKeepStore

  // 서버 시각을 정해 두고 보낸다 (날짜는 한국 시간으로 가르므로 UTC 와 날이 다른 시각을 일부러 쓴다)
  const sendAt = (now: string, req: Request) => handleKeepRequest(req, { KEEP: store }, () => new Date(now))
  const putAt = (now: string, body: string, origin?: string) => sendAt(now, request('PUT', { body, origin }))
  const getFrom = (url: string, origin?: string) => sendAt('2026-11-24T00:00:00.000Z', request('GET', { url, origin }))
  const keysStartingWith = (prefix: string) => [...store.values.keys()].filter((key) => key.startsWith(prefix)).sort()

  beforeEach(() => {
    store = new FakeKeepStore()
  })

  describe('AC-1 날·달이 바뀐 뒤 첫 보관에 사본을 남긴다', () => {
    it('날(KST)이 바뀐 뒤 첫 PUT 은 기존 최신본을 그 보관일 사본으로 31일 TTL·보관 시각과 함께 남긴다', async () => {
      const first = keepBody({ data: 'Zmlyc3Q=' })
      const second = keepBody({ data: 'c2Vjb25k' })
      // 한국 시간 11월 20일 23:00 → 11월 21일 00:30 (UTC 로는 둘 다 11월 20일)
      await putAt('2026-11-20T14:00:00.000Z', first)

      const res = await putAt('2026-11-20T15:30:00.000Z', second)

      expect(res.status).toBe(204)
      expect(store.values.get(`snap:${ID}:2026-11-20`)).toBe(first)
      expect(store.ttls.get(`snap:${ID}:2026-11-20`)).toBe(DAY_TTL)
      expect(store.metadata.get(`snap:${ID}:2026-11-20`)).toEqual({ savedAt: '2026-11-20T14:00:00.000Z' })
      expect(store.values.get(`keep:${ID}`)).toBe(second)
      expect(store.metadata.get(`keep:${ID}`)).toEqual({ savedAt: '2026-11-20T15:30:00.000Z' })
      expect(store.ttls.has(`keep:${ID}`)).toBe(false)
      // 같은 달이라 달 사본은 없다
      expect(keysStartingWith('month:')).toEqual([])
    })

    it('같은 날(KST) 두 번째 PUT 은 사본을 만들지 않는다', async () => {
      // 한국 시간 11월 21일 00:30 → 23:30 (UTC 로는 11월 20일 → 21일)
      await putAt('2026-11-20T15:30:00.000Z', keepBody({ data: 'Zmlyc3Q=' }))

      await putAt('2026-11-21T14:30:00.000Z', keepBody({ data: 'c2Vjb25k' }))

      expect(keysStartingWith('snap:')).toEqual([])
      expect(keysStartingWith('month:')).toEqual([])
      expect(store.metadata.get(`keep:${ID}`)).toEqual({ savedAt: '2026-11-21T14:30:00.000Z' })
    })

    it('사본은 그날 마지막으로 보관된 모습이고, 그 날 사본이 이미 있으면 덮어쓴다', async () => {
      store.values.set(`snap:${ID}:2026-11-20`, keepBody({ data: 'b3RoZXI=' }))
      await putAt('2026-11-20T01:00:00.000Z', keepBody({ data: 'bW9ybmluZw==' }))
      const last = keepBody({ data: 'bmlnaHQ=' })
      await putAt('2026-11-20T14:00:00.000Z', last)

      await putAt('2026-11-21T01:00:00.000Z', keepBody({ data: 'bmV4dA==' }))

      expect(keysStartingWith('snap:')).toEqual([`snap:${ID}:2026-11-20`])
      expect(store.values.get(`snap:${ID}:2026-11-20`)).toBe(last)
    })

    it('달(KST)이 바뀐 첫 PUT 은 지난 보관 달 사본도 400일 TTL·보관 시각과 함께 남긴다', async () => {
      const october = keepBody({ data: 'b2N0' })
      // 한국 시간 10월 31일 23:00 → 11월 1일 00:10
      await putAt('2026-10-31T14:00:00.000Z', october)

      await putAt('2026-10-31T15:10:00.000Z', keepBody({ data: 'bm92' }))

      expect(store.values.get(`month:${ID}:2026-10`)).toBe(october)
      expect(store.ttls.get(`month:${ID}:2026-10`)).toBe(MONTH_TTL)
      expect(store.metadata.get(`month:${ID}:2026-10`)).toEqual({ savedAt: '2026-10-31T14:00:00.000Z' })
      expect(store.values.get(`snap:${ID}:2026-10-31`)).toBe(october)
      expect(store.ttls.get(`snap:${ID}:2026-10-31`)).toBe(DAY_TTL)
    })

    it('최신본이 없던 첫 PUT 은 사본 없이 최신본만 쓴다', async () => {
      await putAt('2026-11-20T14:00:00.000Z', keepBody())

      expect([...store.values.keys()]).toEqual([`keep:${ID}`])
    })

    it('형식이 틀려 받지 않은 PUT 은 사본도 만들지 않는다', async () => {
      await putAt('2026-11-20T14:00:00.000Z', keepBody())

      const res = await putAt('2026-11-21T14:00:00.000Z', keepBody({ v: 2 }))

      expect(res.status).toBe(400)
      expect([...store.values.keys()]).toEqual([`keep:${ID}`])
    })
  })

  describe('AC-2 옛 최신본과 복사 실패', () => {
    it('metadata 없는 옛 최신본은 겉봉투 savedAt(한국 시간)으로 보관일을 정한다', async () => {
      // 이 기능 전에 저장된 최신본: metadata 없음. 겉봉투 savedAt 은 한국 시간 11월 20일 01:00 (UTC 19일)
      const old = keepBody({ savedAt: '2026-11-19T16:00:00.000Z' })
      store.values.set(`keep:${ID}`, old)

      const res = await putAt('2026-11-21T01:00:00.000Z', keepBody({ data: 'bmV3' }))

      expect(res.status).toBe(204)
      expect(store.values.get(`snap:${ID}:2026-11-20`)).toBe(old)
      expect(store.metadata.get(`snap:${ID}:2026-11-20`)).toEqual({ savedAt: '2026-11-19T16:00:00.000Z' })
      expect(keysStartingWith('month:')).toEqual([])
    })

    it('metadata 없는 옛 최신본이 오늘(KST) 보관된 것이면 사본을 만들지 않는다', async () => {
      store.values.set(`keep:${ID}`, keepBody({ savedAt: '2026-11-20T16:00:00.000Z' }))

      await putAt('2026-11-21T01:00:00.000Z', keepBody({ data: 'bmV3' }))

      expect(keysStartingWith('snap:')).toEqual([])
    })

    it('날짜 사본 복사가 실패하면 최신본을 바꾸지 않고 5xx 로 답한다', async () => {
      const first = keepBody({ data: 'Zmlyc3Q=' })
      await putAt('2026-11-20T14:00:00.000Z', first)
      store.failPut = (key) => key.startsWith('snap:')

      const res = await putAt('2026-11-21T14:00:00.000Z', keepBody({ data: 'c2Vjb25k' }))

      expect(res.status).toBeGreaterThanOrEqual(500)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
      expect(store.values.get(`keep:${ID}`)).toBe(first)
      expect(store.metadata.get(`keep:${ID}`)).toEqual({ savedAt: '2026-11-20T14:00:00.000Z' })
    })

    it('달 사본 복사가 실패해도 최신본을 바꾸지 않고 5xx 로 답한다', async () => {
      const october = keepBody({ data: 'b2N0' })
      await putAt('2026-10-31T14:00:00.000Z', october)
      store.failPut = (key) => key.startsWith('month:')

      const res = await putAt('2026-10-31T15:10:00.000Z', keepBody({ data: 'bm92' }))

      expect(res.status).toBeGreaterThanOrEqual(500)
      expect(store.values.get(`keep:${ID}`)).toBe(october)
    })

    it('복사가 실패한 뒤 다시 보내면 사본과 최신본이 모두 생긴다', async () => {
      const first = keepBody({ data: 'Zmlyc3Q=' })
      await putAt('2026-11-20T14:00:00.000Z', first)
      store.failPut = (key) => key.startsWith('snap:')
      await putAt('2026-11-21T14:00:00.000Z', keepBody({ data: 'c2Vjb25k' }))
      store.failPut = () => false

      const second = keepBody({ data: 'c2Vjb25k' })
      const res = await putAt('2026-11-21T14:01:00.000Z', second)

      expect(res.status).toBe(204)
      expect(store.values.get(`snap:${ID}:2026-11-20`)).toBe(first)
      expect(store.values.get(`keep:${ID}`)).toBe(second)
    })
  })

  describe('AC-3 사본 목록과 고른 사본 받기', () => {
    // 10월 31일·11월 20일·11월 21일(KST)에 보관하고 11월 22일에 마지막으로 보관한 모습
    async function keepFourDays(origin?: string) {
      await putAt('2026-10-31T14:00:00.000Z', keepBody({ data: 'b2N0' }), origin)
      await putAt('2026-11-20T03:00:00.000Z', keepBody({ data: 'MjA=' }), origin)
      await putAt('2026-11-21T03:00:00.000Z', keepBody({ data: 'MjE=' }), origin)
      await putAt('2026-11-22T03:00:00.000Z', keepBody({ data: 'MjI=' }), origin)
    }

    it('GET …/history 가 최신본·날짜별·달별 목록을 최신 것부터 준다', async () => {
      await keepFourDays()

      const res = await getFrom(HISTORY_URL)

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('application/json')
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
      expect(await res.json()).toEqual({
        latest: { savedAt: '2026-11-22T03:00:00.000Z' },
        days: [
          { date: '2026-11-21', savedAt: '2026-11-21T03:00:00.000Z' },
          { date: '2026-11-20', savedAt: '2026-11-20T03:00:00.000Z' },
          { date: '2026-10-31', savedAt: '2026-10-31T14:00:00.000Z' },
        ],
        months: [{ month: '2026-10', savedAt: '2026-10-31T14:00:00.000Z' }],
      })
    })

    it('보관본이 없으면 최신본 없이 빈 목록을 준다', async () => {
      const res = await getFrom(HISTORY_URL)

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ days: [], months: [] })
    })

    it('metadata 없는 옛 최신본의 보관 시각은 겉봉투 savedAt 으로 준다', async () => {
      store.values.set(`keep:${ID}`, keepBody({ savedAt: '2026-11-19T16:00:00.000Z' }))

      const res = await getFrom(HISTORY_URL)

      expect(await res.json()).toEqual({ latest: { savedAt: '2026-11-19T16:00:00.000Z' }, days: [], months: [] })
    })

    it('다른 이름의 사본은 목록에 넣지 않는다', async () => {
      const OTHER_ID = 'b'.repeat(64)
      store.values.set(`snap:${OTHER_ID}:2026-11-20`, keepBody())
      store.metadata.set(`snap:${OTHER_ID}:2026-11-20`, { savedAt: '2026-11-20T03:00:00.000Z' })

      const res = await getFrom(HISTORY_URL)

      expect(await res.json()).toEqual({ days: [], months: [] })
    })

    it('?day= 는 그 날 사본을, ?month= 는 그 달 사본을, 쿼리가 없으면 최신본을 준다', async () => {
      await keepFourDays()

      const day = await getFrom(`${URL_FOR_ID}?day=2026-11-20`)
      const month = await getFrom(`${URL_FOR_ID}?month=2026-10`)
      const latest = await getFrom(URL_FOR_ID)

      expect(day.status).toBe(200)
      expect(day.headers.get('Content-Type')).toContain('application/json')
      expect(await day.text()).toBe(keepBody({ data: 'MjA=' }))
      expect(await month.text()).toBe(keepBody({ data: 'b2N0' }))
      expect(await latest.text()).toBe(keepBody({ data: 'MjI=' }))
    })

    it('없는 날·달 사본은 404 다', async () => {
      await keepFourDays()

      expect((await getFrom(`${URL_FOR_ID}?day=2026-11-19`)).status).toBe(404)
      expect((await getFrom(`${URL_FOR_ID}?month=2026-09`)).status).toBe(404)
    })

    it('날·달 형식이 틀리거나 둘을 함께 주면 400 이다', async () => {
      const queries = ['day=2026-11', 'day=20261120', 'day=', 'month=2026-10-31', 'month=2026', 'day=2026-11-20&month=2026-11']
      for (const query of queries) {
        expect((await getFrom(`${URL_FOR_ID}?${query}`)).status).toBe(400)
      }
    })

    it('미리보기 출처의 보관은 미리보기 자리에 사본을 두고, 목록·사본 받기도 미리보기 자리만 본다', async () => {
      await keepFourDays()
      await putAt('2026-11-23T03:00:00.000Z', keepBody({ data: 'cDE=' }), PREVIEW_ORIGIN)
      await putAt('2026-11-24T03:00:00.000Z', keepBody({ data: 'cDI=' }), PREVIEW_ORIGIN)

      expect(keysStartingWith('preview:snap:')).toEqual([`preview:snap:${ID}:2026-11-23`])
      expect(keysStartingWith('preview:month:')).toEqual([])
      const previewHistory = await getFrom(HISTORY_URL, PREVIEW_ORIGIN)
      expect(await previewHistory.json()).toEqual({
        latest: { savedAt: '2026-11-24T03:00:00.000Z' },
        days: [{ date: '2026-11-23', savedAt: '2026-11-23T03:00:00.000Z' }],
        months: [],
      })
      expect((await getFrom(`${URL_FOR_ID}?day=2026-11-20`, PREVIEW_ORIGIN)).status).toBe(404)
      expect(await (await getFrom(`${URL_FOR_ID}?day=2026-11-23`, PREVIEW_ORIGIN)).text()).toBe(keepBody({ data: 'cDE=' }))
      // 본 자리 목록에는 미리보기 사본이 섞이지 않는다
      const mainHistory: unknown = await (await getFrom(HISTORY_URL)).json()
      expect(mainHistory).toHaveProperty('days.length', 3)
      expect(mainHistory).toHaveProperty('latest.savedAt', '2026-11-22T03:00:00.000Z')
    })

    it('목록은 허용한 출처만, GET 만 받고 이름 형식이 틀리면 400 이다', async () => {
      expect((await getFrom(HISTORY_URL, 'https://evil.example')).status).toBe(403)
      expect((await sendAt('2026-11-24T00:00:00.000Z', request('GET', { url: HISTORY_URL, origin: null }))).status).toBe(403)
      expect((await sendAt('2026-11-24T00:00:00.000Z', request('DELETE', { url: HISTORY_URL }))).status).toBe(405)
      expect((await sendAt('2026-11-24T00:00:00.000Z', request('OPTIONS', { url: HISTORY_URL }))).status).toBe(204)
      expect((await getFrom(`https://keep.example.workers.dev/v1/keep/${'A'.repeat(64)}/history`)).status).toBe(400)
      expect((await getFrom(`${HISTORY_URL}/more`)).status).toBe(404)
    })
  })

  describe('AC-4 지우면 사본까지', () => {
    it('DELETE 가 그 이름의 최신본·상태 신호·날짜별·달별 사본을 지우고 다른 이름과 미리보기 자리는 남긴다', async () => {
      const OTHER_ID = 'b'.repeat(64)
      await putAt('2026-10-31T14:00:00.000Z', keepBody())
      await putAt('2026-11-20T03:00:00.000Z', keepBody())
      await putAt('2026-11-21T03:00:00.000Z', keepBody())
      store.values.set(`status:${ID}`, statusBody())
      store.values.set(`snap:${OTHER_ID}:2026-11-20`, keepBody())
      store.values.set(`month:${OTHER_ID}:2026-10`, keepBody())
      store.values.set(`preview:snap:${ID}:2026-11-20`, keepBody())
      store.values.set(`preview:month:${ID}:2026-10`, keepBody())
      expect(keysStartingWith('snap:')).toHaveLength(3)

      const res = await sendAt('2026-11-24T00:00:00.000Z', request('DELETE'))

      expect(res.status).toBe(204)
      expect([...store.values.keys()].sort()).toEqual([
        `month:${OTHER_ID}:2026-10`,
        `preview:month:${ID}:2026-10`,
        `preview:snap:${ID}:2026-11-20`,
        `snap:${OTHER_ID}:2026-11-20`,
      ])
    })

    it('미리보기에서 지우면 미리보기 자리의 사본만 지운다', async () => {
      store.values.set(`snap:${ID}:2026-11-20`, keepBody())
      store.values.set(`preview:keep:${ID}`, keepBody())
      store.values.set(`preview:snap:${ID}:2026-11-20`, keepBody())
      store.values.set(`preview:month:${ID}:2026-10`, keepBody())

      const res = await sendAt('2026-11-24T00:00:00.000Z', request('DELETE', { origin: PREVIEW_ORIGIN }))

      expect(res.status).toBe(204)
      expect([...store.values.keys()]).toEqual([`snap:${ID}:2026-11-20`])
    })
  })
})
