import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type StoredData } from '../../domain/types'
import { book, ledger } from '../../test/ledgerFixtures'
import { AutoKeeper, type KeepState, type KeepStateStore } from './AutoKeeper'
import { keepIdOf, openKeep, type KeepEnvelope } from './keepCrypto'
import type { KeepPutResult, KeepServer } from './keepServer'

const CODE = 'HK7M-29QF-MX4P-8R2D'
const START = new Date('2026-10-13T00:00:00.000Z')

function stored(entryName = '회비'): StoredData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    books: [book([ledger([[3, 'income', entryName, 10_000]], { year: 2026 })])],
    settings: { recoveryCode: CODE },
  }
}

// 가짜 서버: 올린 것을 모아 두고, 답은 테스트가 정한다
function fakeServer() {
  const puts: { id: string; envelope: KeepEnvelope }[] = []
  const removed: string[] = []
  let result: KeepPutResult = 'ok'
  const server: KeepServer = {
    put: async (id, envelope) => {
      puts.push({ id, envelope })
      return result
    },
    get: async () => ({ status: 'not-found' }),
    remove: async (id) => {
      removed.push(id)
      return true
    },
  }
  return {
    server,
    puts,
    removed,
    answer: (next: KeepPutResult) => {
      result = next
    },
  }
}

function memoryStore(initial: KeepState = { enabled: true }): KeepStateStore & { saved: KeepState } {
  const store = {
    saved: initial,
    load: () => store.saved,
    save: (state: KeepState) => {
      store.saved = state
    },
  }
  return store
}

// 올린 본문을 풀어 백업 파일 내용으로 읽는다
async function uploaded(envelope: KeepEnvelope | undefined): Promise<StoredData> {
  if (!envelope) throw new Error('올린 것이 없다')
  const plain = await openKeep(CODE, envelope)
  if (plain === undefined) throw new Error('풀 수 없다')
  return JSON.parse(plain)
}

describe('SPEC-006 자동 보관기', () => {
  let clock = START
  const now = () => clock
  function pass(ms: number) {
    clock = new Date(clock.getTime() + ms)
  }

  beforeEach(() => {
    clock = START
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(state?: KeepState) {
    const fake = fakeServer()
    const store = memoryStore(state)
    const keeper = new AutoKeeper({ server: fake.server, store, now })
    return { ...fake, store, keeper }
  }

  it('AC-2 저장 뒤 10초에 한 번만 올라가고, 그 사이 연달아 저장한 것은 묶여 마지막 것이 올라간다', async () => {
    const { keeper, puts } = setup()
    keeper.saved(stored('회비'))
    await vi.advanceTimersByTimeAsync(3_000)
    keeper.saved(stored('간식비'))
    await vi.advanceTimersByTimeAsync(3_000)
    keeper.saved(stored('대관료'))
    expect(puts).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(4_000)
    await keeper.idle()

    expect(puts).toHaveLength(1)
    const data = await uploaded(puts[0]?.envelope)
    expect(data.books[0]?.ledgers['2026']?.entries[0]?.name).toBe('대관료')
  })

  it('AC-3 서버 이름은 복구 코드에서 만든 값이고, 보관본은 백업 파일 내용(복구 코드 포함)이다', async () => {
    const { keeper, puts } = setup()
    keeper.saved(stored())
    await vi.advanceTimersByTimeAsync(10_000)
    await keeper.idle()

    expect(puts[0]?.id).toBe(await keepIdOf(CODE))
    expect(puts[0]?.envelope.savedAt).toBe(START.toISOString())
    const data = await uploaded(puts[0]?.envelope)
    expect(data.settings.recoveryCode).toBe(CODE)
    // 백업 파일처럼 마지막 백업 시각은 보관한 때 (불러온 직후 30일 백업 안내가 뜨지 않게)
    expect(data.settings.lastBackupAt).toBe(START.toISOString())
  })

  it('올리면 마지막 보관 시각을 기기에 남기고 밀린 것이 없어진다', async () => {
    const { keeper, store } = setup()
    keeper.saved(stored())
    expect(keeper.getState().pendingSince).toBe(START.toISOString())

    pass(10_000)
    await vi.advanceTimersByTimeAsync(10_000)
    await keeper.idle()

    expect(store.saved).toEqual({ enabled: true, lastKeptAt: '2026-10-13T00:00:10.000Z' })
    expect(keeper.getState()).toEqual(store.saved)
  })

  it('AC-4 실패하면 조용히 기다렸다가 다음 저장 때 다시 올린다 (혼자 다시 시도하지 않는다)', async () => {
    const { keeper, puts, answer } = setup()
    answer('failed')
    keeper.saved(stored())
    await vi.advanceTimersByTimeAsync(10_000)
    await keeper.idle()
    expect(puts).toHaveLength(1)
    expect(keeper.getState().pendingSince).toBe(START.toISOString())

    await vi.advanceTimersByTimeAsync(60_000)
    expect(puts).toHaveLength(1)

    answer('ok')
    keeper.saved(stored('간식비'))
    await vi.advanceTimersByTimeAsync(10_000)
    await keeper.idle()
    expect(puts).toHaveLength(2)
    expect(keeper.getState().pendingSince).toBeUndefined()
  })

  it('AC-4 인터넷이 다시 연결되면(online) 밀린 것을 바로 올린다', async () => {
    const { keeper, puts, answer } = setup()
    const win = new EventTarget()
    const doc = new EventTarget()
    keeper.listen(win, doc, () => 'visible')
    answer('failed')
    keeper.saved(stored())
    await vi.advanceTimersByTimeAsync(10_000)
    await keeper.idle()

    answer('ok')
    win.dispatchEvent(new Event('online'))
    await keeper.idle()
    expect(puts).toHaveLength(2)
    expect(keeper.getState().pendingSince).toBeUndefined()
  })

  it('AC-4 앱을 열 때 밀린 것이 있으면 바로 올린다', async () => {
    const { keeper, puts } = setup({ enabled: true, lastKeptAt: '2026-10-01T00:00:00.000Z', pendingSince: '2026-10-02T00:00:00.000Z' })
    keeper.start(stored())
    await keeper.idle()
    expect(puts).toHaveLength(1)
    expect(keeper.getState().pendingSince).toBeUndefined()
  })

  it('이 버전을 처음 열면(보관한 적 없음) 장부가 있을 때 바로 올린다', async () => {
    const { keeper, puts } = setup({ enabled: true })
    keeper.start(stored())
    await keeper.idle()
    expect(puts).toHaveLength(1)
  })

  it('앱을 열 때 밀린 것이 없거나 장부가 없으면 올리지 않는다', async () => {
    const kept = setup({ enabled: true, lastKeptAt: '2026-10-12T00:00:00.000Z' })
    kept.keeper.start(stored())
    await kept.keeper.idle()
    expect(kept.puts).toHaveLength(0)

    const empty = setup({ enabled: true })
    empty.keeper.start({ ...stored(), books: [] })
    await empty.keeper.idle()
    expect(empty.puts).toHaveLength(0)
    expect(empty.keeper.getState().pendingSince).toBeUndefined()
  })

  it('화면을 떠나면(visibilitychange hidden) 기다리지 않고 남은 것을 바로 올린다', async () => {
    const { keeper, puts } = setup()
    const doc = new EventTarget()
    let visibility: DocumentVisibilityState = 'visible'
    keeper.listen(new EventTarget(), doc, () => visibility)
    keeper.saved(stored())
    await vi.advanceTimersByTimeAsync(2_000)

    visibility = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    await keeper.idle()
    expect(puts).toHaveLength(1)

    // 기다리던 10초 묶음은 취소돼 또 올리지 않는다
    await vi.advanceTimersByTimeAsync(10_000)
    await keeper.idle()
    expect(puts).toHaveLength(1)
  })

  it('올리는 중에 또 저장하면 그것은 밀린 채로 남아 다음 묶음에 올라간다', async () => {
    const fake = fakeServer()
    // 올리기를 붙잡아 두었다가 테스트가 놓아준다
    const held: (() => void)[] = []
    const slowServer: KeepServer = {
      ...fake.server,
      put: async (id, envelope) => {
        await new Promise<void>((resolve) => held.push(resolve))
        return fake.server.put(id, envelope)
      },
    }
    const keeper = new AutoKeeper({ server: slowServer, store: memoryStore(), now })
    keeper.saved(stored('회비'))
    await vi.advanceTimersByTimeAsync(10_000)
    await vi.waitFor(() => expect(held).toHaveLength(1))

    pass(12_000)
    keeper.saved(stored('간식비'))
    held.shift()?.()
    await keeper.idle()
    expect(keeper.getState().pendingSince).toBe('2026-10-13T00:00:12.000Z')

    await vi.advanceTimersByTimeAsync(10_000)
    await vi.waitFor(() => expect(held).toHaveLength(1))
    held.shift()?.()
    await keeper.idle()
    expect(fake.puts).toHaveLength(2)
    expect((await uploaded(fake.puts[1]?.envelope)).books[0]?.ledgers['2026']?.entries[0]?.name).toBe('간식비')
    expect(keeper.getState().pendingSince).toBeUndefined()
  })

  it('복구 코드가 없으면 올리지 않고 밀린 채로 둔다', async () => {
    const { keeper, puts } = setup()
    keeper.saved({ ...stored(), settings: {} })
    await vi.advanceTimersByTimeAsync(10_000)
    await keeper.idle()
    expect(puts).toHaveLength(0)
    expect(keeper.getState().pendingSince).toBe(START.toISOString())
  })

  it('보관본이 1MB 를 넘으면 올리지 못했다고 남긴다', async () => {
    const { keeper, answer } = setup()
    answer('too-large')
    keeper.saved(stored())
    await vi.advanceTimersByTimeAsync(10_000)
    await keeper.idle()
    expect(keeper.getState()).toMatchObject({ tooLarge: true, pendingSince: START.toISOString() })
  })

  it('끄면 저장해도 올리지 않고, 밀린 것도 없앤다', async () => {
    const { keeper, puts, store } = setup()
    keeper.saved(stored())
    keeper.setEnabled(false)
    expect(store.saved).toEqual({ enabled: false })

    keeper.saved(stored('간식비'))
    await vi.advanceTimersByTimeAsync(20_000)
    await keeper.idle()
    expect(puts).toHaveLength(0)
  })

  it('다시 켜면 지금 기록을 바로 올린다', async () => {
    const { keeper, puts } = setup({ enabled: false })
    keeper.start(stored())
    keeper.saved(stored('간식비'))
    keeper.setEnabled(true)
    await keeper.idle()
    expect(puts).toHaveLength(1)
    expect((await uploaded(puts[0]?.envelope)).books[0]?.ledgers['2026']?.entries[0]?.name).toBe('간식비')
  })

  it('서버 사본 지우기는 지금 복구 코드의 이름으로 지운다', async () => {
    const { keeper, removed } = setup()
    keeper.start(stored())
    await keeper.idle()
    await expect(keeper.forget()).resolves.toBe(true)
    expect(removed).toEqual([await keepIdOf(CODE)])
  })

  it('상태가 바뀌면 구독한 쪽에 알린다', async () => {
    const { keeper } = setup()
    const listener = vi.fn()
    const unsubscribe = keeper.subscribe(listener)
    keeper.saved(stored())
    await vi.advanceTimersByTimeAsync(10_000)
    await keeper.idle()
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })
})
