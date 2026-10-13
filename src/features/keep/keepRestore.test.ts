import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type StoredData } from '../../domain/types'
import { createBackup } from '../../storage/backup'
import { book, ledger } from '../../test/ledgerFixtures'
import { keepIdOf, sealKeep, type KeepEnvelope } from './keepCrypto'
import { fetchKept } from './keepRestore'
import type { KeepGetResult, KeepServer } from './keepServer'

const CODE = 'HK7M-29QF-MX4P-8R2D'
const SAVED_AT = '2026-10-12T06:20:00.000Z'

const KEPT: StoredData = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  books: [
    book([ledger([[3, 'income', '회비', 10_000], [3, 'expense', '간식비', 5_000]], { year: 2026 })]),
    book([ledger([[1, 'expense', '장보기', 30_000]], { year: 2026 })], { id: 'book-2', name: '우리집 가계부', kind: 'household' }),
  ],
  settings: { recoveryCode: CODE },
}

// 이름별로 보관본을 들고 있는 가짜 서버
function serverWith(stored: Record<string, KeepEnvelope>, fallback?: KeepGetResult): KeepServer {
  return {
    put: async () => 'ok',
    get: async (id) => {
      if (fallback) return fallback
      const envelope = stored[id]
      return envelope ? { status: 'found', envelope } : { status: 'not-found' }
    },
    remove: async () => true,
  }
}

async function keptServer(): Promise<KeepServer> {
  const envelope = await sealKeep(CODE, createBackup(KEPT, new Date(SAVED_AT)).text, SAVED_AT)
  return serverWith({ [await keepIdOf(CODE)]: envelope })
}

describe('SPEC-006 복구 코드로 보관본 받아 오기', () => {
  it('AC-5 맞는 코드면 보관본의 모든 장부와 확인 창에 보일 내용(보관한 때·장부 이름·기록 수)을 준다', async () => {
    const result = await fetchKept(await keptServer(), 'hk7m 29qf mx4p 8r2d')
    if (result.status !== 'found') throw new Error(result.status)

    expect(result.code).toBe(CODE)
    expect(result.savedAt).toBe(SAVED_AT)
    expect(result.bookNames).toEqual(['한랑드림', '우리집 가계부'])
    expect(result.summary).toEqual({ bookCount: 2, entryCount: 3 })
    expect(result.data.books).toEqual(KEPT.books)
  })

  it('AC-5 불러온 데이터의 복구 코드는 넣은 코드다 (이후 같은 자리에 보관)', async () => {
    const result = await fetchKept(await keptServer(), CODE)
    expect(result.status === 'found' && result.data.settings.recoveryCode).toBe(CODE)
  })

  it('AC-5 16자가 안 되거나 쓰지 않는 글자면 서버에 묻지 않고 틀린 코드', async () => {
    await expect(fetchKept(serverWith({}, { status: 'offline' }), 'HK7M-29QF')).resolves.toEqual({ status: 'not-found' })
  })

  it('AC-5 틀린 코드(보관본 없음)면 없음', async () => {
    await expect(fetchKept(await keptServer(), 'HK7M-29QF-MX4P-8R2E')).resolves.toEqual({ status: 'not-found' })
  })

  it('AC-5 인터넷이 없으면 offline, 서버 오류면 failed', async () => {
    await expect(fetchKept(serverWith({}, { status: 'offline' }), CODE)).resolves.toEqual({ status: 'offline' })
    await expect(fetchKept(serverWith({}, { status: 'failed' }), CODE)).resolves.toEqual({ status: 'failed' })
  })

  it('보관본을 풀 수 없거나 우리 장부 데이터가 아니면 failed', async () => {
    const id = await keepIdOf(CODE)
    const otherKey = await sealKeep('HK7M-29QF-MX4P-8R2E', createBackup(KEPT, new Date(SAVED_AT)).text, SAVED_AT)
    await expect(fetchKept(serverWith({ [id]: otherKey }), CODE)).resolves.toEqual({ status: 'failed' })
    const notBackup = await sealKeep(CODE, '{"hello":1}', SAVED_AT)
    await expect(fetchKept(serverWith({ [id]: notBackup }), CODE)).resolves.toEqual({ status: 'failed' })
  })
})
