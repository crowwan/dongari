import { describe, expect, it, vi } from 'vitest'
import type { KeepEnvelope } from './keepCrypto'
import { createKeepServer, KEEP_SIZE_LIMIT } from './keepServer'

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
