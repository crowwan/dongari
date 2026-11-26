import { describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type StoredData } from '../../domain/types'
import { book, ledger } from '../../test/ledgerFixtures'
import { AppErrorRecorder } from '../errors/AppErrorRecorder'
import { AutoKeeper, type KeepState } from './AutoKeeper'
import type { KeepServer } from './keepServer'

// 서버 이름 계산(Web Crypto)을 바로 끝나는 가짜로 바꾼다: 진짜 계산은 끝나는 때가 들쭉날쭉해 신호 차례를 시험으로 가를 수 없다
vi.mock('./keepCrypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./keepCrypto')>()),
  keepIdOf: async () => 'a'.repeat(64),
}))

const NOW = new Date('2026-11-26T05:00:00.000Z')
const ORIGIN = 'https://uri-jangbu-preview.pages.dev'
const DATA: StoredData = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  books: [book([ledger([[3, 'income', '회비', 10_000]], { year: 2026 })])],
  settings: { recoveryCode: 'HK7M-29QF-MX4P-8R2D' },
}

// 진행 중인 Promise 일을 모두 끝낸다 (타이머 하나는 그 뒤에 돈다)
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('SPEC-012 AC-8 상태 신호 차례 (나중에 닿는 신호가 최신)', () => {
  it('앞 신호가 끝나기 전에는 다음 신호를 보내지 않고, 다음 신호는 보낼 차례의 오류 목록을 싣는다', async () => {
    const sent: string[] = []
    let firstStarted: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve
    })
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    // 첫 신호(앱 열기)는 서버가 답하기 전에 멈춰 둔다
    const server: KeepServer = {
      put: async () => 'ok',
      get: async () => ({ status: 'not-found' }),
      remove: async () => true,
      sendStatus: async (_id, status) => {
        sent.push(`시작 ${status.errors?.length ?? 0}`)
        if (sent.length === 1) {
          firstStarted()
          await gate
        }
        sent.push(`끝 ${status.errors?.length ?? 0}`)
      },
    }
    const state: KeepState = { enabled: true, lastKeptAt: '2026-11-25T00:00:00.000Z' }
    const errors = new AppErrorRecorder({ store: { load: () => [], save: () => {} }, origin: ORIGIN, now: () => NOW })
    const keeper = new AutoKeeper({ server, store: { load: () => state, save: () => {} }, now: () => NOW, errors: errors.list })

    const opening = keeper.start(DATA)
    await started
    errors.record('render', new TypeError('boom'))
    const reporting = keeper.reportErrors()
    await settle()
    // 앞 신호가 서버에 머무는 동안 오류 신호는 기다린다
    expect(sent).toEqual(['시작 0'])

    errors.record('render', new TypeError('again'))
    release()
    await Promise.all([opening, reporting])
    // 앞 신호가 끝난 뒤 보내고, 그때 둔 오류 둘을 싣는다
    expect(sent).toEqual(['시작 0', '끝 0', '시작 2', '끝 2'])
  })
})
