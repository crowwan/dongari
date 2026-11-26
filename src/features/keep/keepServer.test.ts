import { describe, expect, it, vi } from 'vitest'
import { handleKeepRequest, MAX_STATUS_BYTES, type KeepStore } from '../../../worker/src/keep'
import type { AppError } from '../errors/appErrors'
import type { KeepEnvelope } from './keepCrypto'
import { createKeepServer, KEEP_SIZE_LIMIT, STATUS_SIZE_LIMIT, statusBody, type KeepStatus } from './keepServer'

const ID = 'a'.repeat(64)
const ENVELOPE: KeepEnvelope = { v: 1, savedAt: '2026-10-12T06:20:00.000Z', iv: 'aXY=', data: 'ZGF0YQ==' }

function respond(status: number, body?: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))
}

function offline() {
  return vi.fn<typeof fetch>(async () => {
    throw new TypeError('Failed to fetch')
  })
}

describe('SPEC-006 자동 보관 서버 (Worker API v1)', () => {
  it('올리기는 PUT {주소}/v1/keep/:id 에 본문 JSON 을 보내고 204 면 성공', async () => {
    const fetchFn = respond(204)
    const server = createKeepServer('https://keep.example.dev/', fetchFn)

    await expect(server.put(ID, ENVELOPE)).resolves.toBe('ok')
    const [url, init] = fetchFn.mock.calls[0] ?? []
    expect(url).toBe(`https://keep.example.dev/v1/keep/${ID}`)
    expect(init?.method).toBe('PUT')
    expect(init?.body).toBe(JSON.stringify(ENVELOPE))
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
  })

  it('413 이면 너무 크다, 그 밖의 실패·인터넷 없음은 실패', async () => {
    await expect(createKeepServer('https://k.dev', respond(413)).put(ID, ENVELOPE)).resolves.toBe('too-large')
    await expect(createKeepServer('https://k.dev', respond(500)).put(ID, ENVELOPE)).resolves.toBe('failed')
    await expect(createKeepServer('https://k.dev', offline()).put(ID, ENVELOPE)).resolves.toBe('failed')
  })

  it('1MB 를 넘는 본문은 보내지 않고 너무 크다', async () => {
    const fetchFn = respond(204)
    const big: KeepEnvelope = { ...ENVELOPE, data: 'A'.repeat(KEEP_SIZE_LIMIT) }
    await expect(createKeepServer('https://k.dev', fetchFn).put(ID, big)).resolves.toBe('too-large')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('받기는 GET 200 이면 본문, 404 면 없음', async () => {
    const found = respond(200, ENVELOPE)
    await expect(createKeepServer('https://k.dev', found).get(ID)).resolves.toEqual({ status: 'found', envelope: ENVELOPE })
    expect(found.mock.calls[0]?.[0]).toBe(`https://k.dev/v1/keep/${ID}`)
    await expect(createKeepServer('https://k.dev', respond(404)).get(ID)).resolves.toEqual({ status: 'not-found' })
  })

  it('받기: 인터넷이 없으면 offline, 서버 오류·모양이 다른 본문은 failed', async () => {
    await expect(createKeepServer('https://k.dev', offline()).get(ID)).resolves.toEqual({ status: 'offline' })
    await expect(createKeepServer('https://k.dev', respond(500)).get(ID)).resolves.toEqual({ status: 'failed' })
    await expect(createKeepServer('https://k.dev', respond(200, { v: 2 })).get(ID)).resolves.toEqual({ status: 'failed' })
  })

  it('지우기는 DELETE 204 면 성공, 아니면 실패', async () => {
    const fetchFn = respond(204)
    await expect(createKeepServer('https://k.dev', fetchFn).remove(ID)).resolves.toBe(true)
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe('DELETE')
    await expect(createKeepServer('https://k.dev', offline()).remove(ID)).resolves.toBe(false)
  })
})

describe('SPEC-007 보관 상태 신호 (PUT /v1/status/:id)', () => {
  const STATUS: KeepStatus = {
    v: 2,
    enabled: true,
    pendingSince: '2026-10-14T00:00:00.000Z',
    lastKeptAt: '2026-10-13T00:00:00.000Z',
    tooLarge: false,
    appVersion: '2.6.0',
  }

  it('AC-1 PUT {주소}/v1/status/:id 에 상태를 JSON 으로 한 번 보낸다', async () => {
    const fetchFn = respond(204)
    await createKeepServer('https://keep.example.dev/', fetchFn).sendStatus(ID, STATUS)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] ?? []
    expect(url).toBe(`https://keep.example.dev/v1/status/${ID}`)
    expect(init?.method).toBe('PUT')
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual(STATUS)
  })

  it('AC-1 선택 칸이 없는 상태는 키 없이 보낸다 (null 로 보내지 않는다)', async () => {
    const fetchFn = respond(204)
    await createKeepServer('https://k.dev', fetchFn).sendStatus(ID, { v: 2, enabled: false, tooLarge: false, appVersion: '2.6.0' })
    expect(fetchFn.mock.calls[0]?.[1]?.body).toBe('{"v":2,"enabled":false,"tooLarge":false,"appVersion":"2.6.0"}')
  })

  it('AC-2 인터넷이 없거나 서버 오류여도 예외 없이 끝나고 다시 보내지 않는다', async () => {
    const noNetwork = offline()
    await expect(createKeepServer('https://k.dev', noNetwork).sendStatus(ID, STATUS)).resolves.toBeUndefined()
    expect(noNetwork).toHaveBeenCalledTimes(1)

    const serverError = respond(500)
    await expect(createKeepServer('https://k.dev', serverError).sendStatus(ID, STATUS)).resolves.toBeUndefined()
    expect(serverError).toHaveBeenCalledTimes(1)
  })
})

// 앱 오류 한 줄 (SPEC-012 2절). n: 몇 번째 줄인지(마지막 때가 n 시)
function appError(n: number, overrides: Partial<AppError> = {}): AppError {
  const at = `2026-11-26T${String(n).padStart(2, '0')}:00:00.000Z`
  return { kind: 'render', name: 'TypeError', message: `boom ${'#'.repeat(n)}`, screen: 'dues', count: 1, firstAt: at, lastAt: at, ...overrides }
}

// 서버 칸 상한을 꽉 채운 줄: 3바이트 글자(…)와 JSON 이 두 배로 늘리는 글자(")만으로 (한 줄 약 800바이트, 5줄이면 4KB 를 넘는다)
function widestError(n: number): AppError {
  return appError(n, { name: '…'.repeat(40), message: '…'.repeat(120), screen: '…'.repeat(32), where: '"'.repeat(80), count: 999_999 })
}

const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength

describe('SPEC-012 상태 신호 v2 (앱 오류 목록)', () => {
  const BASE: KeepStatus = { v: 2, enabled: true, lastKeptAt: '2026-11-26T00:00:00.000Z', tooLarge: false, appVersion: '2.9.0' }

  it('오류가 없으면 errors 칸을 뺀다 (빈 목록으로도 보내지 않는다)', () => {
    expect(statusBody({ ...BASE, errors: [] })).toBe(JSON.stringify(BASE))
    expect(statusBody(BASE)).toBe(JSON.stringify(BASE))
  })

  it('오류가 있으면 v: 2 와 함께 errors 에 그대로 싣는다', () => {
    const errors = [appError(1), appError(2, { where: 'index-abc.js:1:2' })]
    expect(JSON.parse(statusBody({ ...BASE, errors }))).toEqual({ ...BASE, errors })
  })

  it('상한은 서버와 같은 4KB 다', () => {
    expect(STATUS_SIZE_LIMIT).toBe(MAX_STATUS_BYTES)
  })

  it('본문 UTF-8 바이트가 4KB 를 넘으면 마지막 때가 오래된 오류 줄부터 뺀다', () => {
    const errors = [widestError(3), widestError(1), widestError(5), widestError(2), widestError(4)]
    expect(utf8Bytes(JSON.stringify({ ...BASE, errors }))).toBeGreaterThan(STATUS_SIZE_LIMIT)

    const body = statusBody({ ...BASE, errors })
    expect(utf8Bytes(body)).toBeLessThanOrEqual(STATUS_SIZE_LIMIT)
    // 가장 오래된 한 줄(1시)만 빼면 들어간다. 남은 줄은 받은 순서 그대로
    expect(JSON.parse(body)).toEqual({ ...BASE, errors: [widestError(3), widestError(5), widestError(2), widestError(4)] })
  })

  it('오류 줄을 다 빼도 넘으면 errors 없이 보낸다 (보관 상태는 꼭 닿게)', () => {
    const huge = appError(1, { message: 'x'.repeat(5000) })
    expect(statusBody({ ...BASE, errors: [huge] })).toBe(JSON.stringify(BASE))
  })

  it('sendStatus 는 그렇게 줄인 본문을 보낸다', async () => {
    const fetchFn = respond(204)
    const errors = [widestError(1), widestError(2), widestError(3), widestError(4), widestError(5)]
    await createKeepServer('https://k.dev', fetchFn).sendStatus(ID, { ...BASE, errors })
    expect(fetchFn.mock.calls[0]?.[1]?.body).toBe(statusBody({ ...BASE, errors }))
  })

  describe('진짜 보관 서버 처리(worker/src/keep.ts)가 받는다', () => {
    // 상태 신호에 쓰는 동작만 있는 KV 가짜
    function memoryKv(): KeepStore & { values: Map<string, string> } {
      const values = new Map<string, string>()
      return {
        values,
        get: async (key) => values.get(key) ?? null,
        getWithMetadata: async (key) => ({ value: values.get(key) ?? null, metadata: null }),
        put: async (key, value) => void values.set(key, value),
        delete: async (key) => void values.delete(key),
        list: async () => ({ keys: [], list_complete: true }),
      }
    }

    // 앱의 fetch 를 서버 처리 함수로 바로 잇는다 (미리보기 출처에서 보낸 것처럼)
    function serverFetch(kv: KeepStore): typeof fetch {
      return async (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set('Origin', 'https://uri-jangbu-preview.pages.dev')
        const request = new Request(String(input), { ...init, headers })
        return handleKeepRequest(request, { KEEP: kv }, () => new Date('2026-11-26T06:00:00.000Z'))
      }
    }

    it('칸 상한을 꽉 채운 오류 5줄도 4KB 안으로 줄여 받아지고, 미리보기 자리(preview:status:)에 남는다', async () => {
      const kv = memoryKv()
      const errors = [widestError(1), widestError(2), widestError(3), widestError(4), widestError(5)]
      await createKeepServer('https://keep.example.workers.dev', serverFetch(kv)).sendStatus(ID, { ...BASE, errors })

      expect(JSON.parse(kv.values.get(`preview:status:${ID}`) ?? 'null')).toEqual({
        ...BASE,
        errors: errors.slice(1),
        seenAt: '2026-11-26T06:00:00.000Z',
      })
    })

    it('오류가 없는 v2 신호도 받는다', async () => {
      const kv = memoryKv()
      await createKeepServer('https://keep.example.workers.dev', serverFetch(kv)).sendStatus(ID, BASE)
      expect(JSON.parse(kv.values.get(`preview:status:${ID}`) ?? 'null')).toEqual({ ...BASE, seenAt: '2026-11-26T06:00:00.000Z' })
    })
  })
})
