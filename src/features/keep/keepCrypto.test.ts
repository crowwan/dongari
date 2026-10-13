import { describe, expect, it } from 'vitest'
import { keepIdOf, openKeep, sealKeep } from './keepCrypto'

const CODE = 'HK7M-29QF-MX4P-8R2D'
const SAVED_AT = '2026-10-12T06:20:00.000Z'
const PLAIN = JSON.stringify({ schemaVersion: 3, books: [{ name: '한랑드림' }], settings: { recoveryCode: CODE } })

describe('SPEC-006 복구 코드 암호화', () => {
  it('AC-3 서버 이름은 64자 소문자 16진수이고 복구 코드와 다르다', async () => {
    const id = await keepIdOf(CODE)
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(id).not.toContain(CODE.replaceAll('-', '').toLowerCase())
  })

  it('AC-3 같은 코드면 같은 이름, 다른 코드면 다른 이름이다 (띄어쓰기·소문자는 같은 코드)', async () => {
    expect(await keepIdOf(CODE)).toBe(await keepIdOf('hk7m29qf mx4p8r2d'))
    expect(await keepIdOf(CODE)).not.toBe(await keepIdOf('HK7M-29QF-MX4P-8R2E'))
  })

  it('AC-3 올리는 본문에는 평문도 복구 코드도 없다', async () => {
    const envelope = await sealKeep(CODE, PLAIN, SAVED_AT)
    const body = JSON.stringify(envelope)
    expect(envelope).toEqual({ v: 1, savedAt: SAVED_AT, iv: expect.any(String), data: expect.any(String) })
    expect(body).not.toContain('한랑드림')
    expect(body).not.toContain('schemaVersion')
    expect(body).not.toContain(CODE)
    expect(body).not.toContain(CODE.replaceAll('-', ''))
    // iv 는 base64 12바이트
    expect(atob(envelope.iv)).toHaveLength(12)
  })

  it('AC-3 같은 내용을 두 번 올려도 암호문이 다르다 (iv 를 매번 새로)', async () => {
    const first = await sealKeep(CODE, PLAIN, SAVED_AT)
    const second = await sealKeep(CODE, PLAIN, SAVED_AT)
    expect(first.iv).not.toBe(second.iv)
    expect(first.data).not.toBe(second.data)
  })

  it('AC-3 같은 코드로 풀면 원래 글자로 돌아온다', async () => {
    const envelope = await sealKeep(CODE, PLAIN, SAVED_AT)
    expect(await openKeep('hk7m 29qf mx4p 8r2d', envelope)).toBe(PLAIN)
  })

  it('다른 코드로 풀거나 암호문이 바뀌었으면 undefined', async () => {
    const envelope = await sealKeep(CODE, PLAIN, SAVED_AT)
    expect(await openKeep('HK7M-29QF-MX4P-8R2E', envelope)).toBeUndefined()
    expect(await openKeep(CODE, { ...envelope, data: btoa('broken data') })).toBeUndefined()
    expect(await openKeep(CODE, { ...envelope, iv: '%%%' })).toBeUndefined()
  })
})
