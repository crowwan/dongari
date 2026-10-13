import { beforeEach, describe, expect, it } from 'vitest'
import worker from './index'
import { type KeepStore, MAX_BODY_BYTES } from './keep'

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
  options: { url?: string; origin?: string | null; body?: string; contentType?: string } = {},
): Request {
  const headers = new Headers()
  const origin = options.origin === undefined ? ORIGIN : options.origin
  if (origin !== null) headers.set('Origin', origin)
  if (options.body !== undefined) headers.set('Content-Type', options.contentType ?? 'application/json')
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
