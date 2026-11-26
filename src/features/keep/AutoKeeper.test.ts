import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type StoredData } from '../../domain/types'
import { book, duesBook, ledger } from '../../test/ledgerFixtures'
import type { AppError } from '../errors/appErrors'
import { AppErrorRecorder } from '../errors/AppErrorRecorder'
import type { AppErrorStore } from '../errors/appErrorStore'
import { AutoKeeper, type KeepState, type KeepStateStore } from './AutoKeeper'
import { keepIdOf, openKeep, type KeepEnvelope } from './keepCrypto'
import type { KeepPutResult, KeepServer, KeepStatus } from './keepServer'

const CODE = 'HK7M-29QF-MX4P-8R2D'
const START = new Date('2026-10-13T00:00:00.000Z')

function stored(entryName = '회비'): StoredData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    books: [book([ledger([[3, 'income', entryName, 10_000]], { year: 2026 })])],
    settings: { recoveryCode: CODE },
  }
}

// 가짜 서버: 올린 것·상태 신호를 모아 두고, 답은 테스트가 정한다. calls 는 부른 차례
function fakeServer() {
  const puts: { id: string; envelope: KeepEnvelope }[] = []
  const removed: string[] = []
  const statuses: { id: string; status: KeepStatus }[] = []
  const calls: ('put' | 'status')[] = []
  let result: KeepPutResult = 'ok'
  const server: KeepServer = {
    put: async (id, envelope) => {
      calls.push('put')
      puts.push({ id, envelope })
      return result
    },
    get: async () => ({ status: 'not-found' }),
    remove: async (id) => {
      removed.push(id)
      return true
    },
    sendStatus: async (id, status) => {
      calls.push('status')
      statuses.push({ id, status })
    },
  }
  return {
    server,
    puts,
    removed,
    statuses,
    calls,
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

describe('SPEC-007 앱을 열 때 보관 상태 신호', () => {
  const NOW = new Date('2026-10-15T00:00:00.000Z')

  function setup(state: KeepState) {
    const fake = fakeServer()
    const keeper = new AutoKeeper({ server: fake.server, store: memoryStore(state), now: () => NOW, appVersion: '2.6.0' })
    return { ...fake, keeper }
  }

  it('AC-1 올리기 시도가 끝난 뒤 상태 신호를 한 번 보낸다', async () => {
    const { keeper, calls, statuses } = setup({ enabled: true, pendingSince: '2026-10-14T00:00:00.000Z' })
    await keeper.start(stored())

    expect(calls).toEqual(['put', 'status'])
    expect(statuses[0]?.id).toBe(await keepIdOf(CODE))
    // 올린 결과(밀린 것 없음, 마지막 보관 시각)가 담긴다
    expect(statuses[0]?.status).toEqual({ v: 2, enabled: true, lastKeptAt: NOW.toISOString(), tooLarge: false, appVersion: '2.6.0' })
  })

  it('AC-1 올릴 것이 없어도 신호는 한 번 보낸다', async () => {
    const { keeper, calls, statuses } = setup({ enabled: true, lastKeptAt: '2026-10-14T00:00:00.000Z' })
    await keeper.start(stored())

    expect(calls).toEqual(['status'])
    expect(statuses[0]?.status).toEqual({
      v: 2,
      enabled: true,
      lastKeptAt: '2026-10-14T00:00:00.000Z',
      tooLarge: false,
      appVersion: '2.6.0',
    })
  })

  it('AC-1 올리기에 실패하면 밀린 때를, 너무 크면 tooLarge 를 담는다', async () => {
    const failed = setup({ enabled: true, lastKeptAt: '2026-10-01T00:00:00.000Z', pendingSince: '2026-10-10T00:00:00.000Z' })
    failed.answer('failed')
    await failed.keeper.start(stored())
    expect(failed.statuses[0]?.status).toMatchObject({ pendingSince: '2026-10-10T00:00:00.000Z', tooLarge: false })

    const tooLarge = setup({ enabled: true })
    tooLarge.answer('too-large')
    await tooLarge.keeper.start(stored())
    expect(tooLarge.statuses[0]?.status).toMatchObject({ pendingSince: NOW.toISOString(), tooLarge: true })
  })

  it('AC-1 신호에는 켜짐·밀린 때·마지막 보관·너무 큼·앱 버전뿐이고 장부 내용·복구 코드는 들어가지 않는다', async () => {
    const { keeper, statuses } = setup({ enabled: true, pendingSince: '2026-10-14T00:00:00.000Z' })
    await keeper.start(stored('대관료'))

    const status = statuses[0]?.status
    expect(Object.keys(status ?? {}).sort()).toEqual(['appVersion', 'enabled', 'lastKeptAt', 'tooLarge', 'v'])
    const body = JSON.stringify(status)
    expect(body).not.toContain(CODE)
    expect(body).not.toContain(CODE.replaceAll('-', ''))
    expect(body).not.toContain('대관료')
    expect(body).not.toContain('10000')
  })

  it('AC-2 자동 보관이 꺼졌어도 복구 코드가 있으면 꺼짐 신호를 보낸다 (올리지는 않는다)', async () => {
    const { keeper, calls, statuses } = setup({ enabled: false, lastKeptAt: '2026-10-01T00:00:00.000Z' })
    await keeper.start(stored())

    expect(calls).toEqual(['status'])
    expect(statuses[0]?.status).toEqual({
      v: 2,
      enabled: false,
      lastKeptAt: '2026-10-01T00:00:00.000Z',
      tooLarge: false,
      appVersion: '2.6.0',
    })
  })

  it('AC-2 복구 코드가 없으면 신호를 보내지 않는다', async () => {
    const { keeper, calls } = setup({ enabled: true })
    await keeper.start({ ...stored(), settings: {} })
    expect(calls).not.toContain('status')
  })

  it('AC-2 저장할 때는 신호를 보내지 않는다 (앱을 열 때 한 번뿐)', async () => {
    const { keeper, calls } = setup({ enabled: true, lastKeptAt: '2026-10-14T00:00:00.000Z' })
    await keeper.start(stored())
    keeper.saved(stored('간식비'))
    await keeper.flush()

    expect(calls).toEqual(['status', 'put'])
  })

  // 서버(#104)가 받는 모양: 정해진 칸만, 선택 칸은 없으면 키째 뺀다(null 은 400), appVersion 1~32자
  const STATUS_KEYS = ['v', 'enabled', 'pendingSince', 'lastKeptAt', 'tooLarge', 'appVersion']
  function expectServerShape(body: string) {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('객체가 아니다')
    const entries = Object.entries(parsed)
    expect(entries.map(([key]) => key).filter((key) => !STATUS_KEYS.includes(key))).toEqual([])
    expect(entries.filter(([, value]) => value === null || value === undefined)).toEqual([])
    const appVersion = entries.find(([key]) => key === 'appVersion')?.[1]
    expect(typeof appVersion === 'string' && appVersion.length >= 1 && appVersion.length <= 32).toBe(true)
  }

  it('AC-1 밀린 것·보관한 적이 없으면 선택 칸(pendingSince·lastKeptAt)은 null 이 아니라 키째 빠진다', async () => {
    const { keeper, statuses } = setup({ enabled: false })
    await keeper.start(stored())

    const body = JSON.stringify(statuses[0]?.status)
    expect(body).toBe('{"v":2,"enabled":false,"tooLarge":false,"appVersion":"2.6.0"}')
    expectServerShape(body)
  })

  it('AC-1 어떤 상태든 보내는 본문은 서버가 받는 모양이다 (정해진 칸만, null 없음, 앱 버전 1~32자)', async () => {
    const states: KeepState[] = [
      { enabled: true },
      { enabled: false },
      { enabled: true, lastKeptAt: '2026-10-14T00:00:00.000Z' },
      { enabled: true, lastKeptAt: '2026-10-01T00:00:00.000Z', pendingSince: '2026-10-10T00:00:00.000Z', tooLarge: true },
    ]
    for (const state of states) {
      const fake = fakeServer()
      fake.answer('failed')
      // 앱 버전은 실제 빌드 값(기본)으로
      const keeper = new AutoKeeper({ server: fake.server, store: memoryStore(state), now: () => NOW })
      await keeper.start(stored())
      expectServerShape(JSON.stringify(fake.statuses[0]?.status))
    }
  })

  it('앱 버전은 빌드 때 넣은 package.json version 이 기본이다', async () => {
    const fake = fakeServer()
    const keeper = new AutoKeeper({ server: fake.server, store: memoryStore({ enabled: false }), now: () => NOW })
    await keeper.start(stored())
    expect(fake.statuses[0]?.status.appVersion).toBe(__APP_VERSION__)
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('SPEC-009 C 카톡 안 장부 옮기기: 지금 올리기 (keepNow)', () => {
  const NOW = new Date('2026-10-16T00:00:00.000Z')

  it('10초를 기다리지 않고 바로 올리고, 다 올라가면 true 와 함께 밀린 것이 없다', async () => {
    const fake = fakeServer()
    const store = memoryStore({ enabled: true, lastKeptAt: START.toISOString() })
    const keeper = new AutoKeeper({ server: fake.server, store, now: () => NOW, delayMs: 60_000 })

    await expect(keeper.keepNow(stored('지금'))).resolves.toBe(true)

    expect(fake.puts).toHaveLength(1)
    expect((await uploaded(fake.puts[0]?.envelope)).books[0]?.ledgers['2026']?.entries[0]?.name).toBe('지금')
    expect(keeper.getState().pendingSince).toBeUndefined()
  })

  it('올리지 못하면(인터넷 없음·서버 오류) false 이고 밀린 채로 남는다', async () => {
    const fake = fakeServer()
    fake.answer('failed')
    const keeper = new AutoKeeper({ server: fake.server, store: memoryStore(), now: () => NOW })

    await expect(keeper.keepNow(stored())).resolves.toBe(false)

    expect(keeper.getState().pendingSince).toBe(NOW.toISOString())
  })

  it('다른 올리기가 진행 중이면 그것이 끝난 뒤 이 기록을 한 번 더 올린다', async () => {
    const fake = fakeServer()
    const keeper = new AutoKeeper({ server: fake.server, store: memoryStore(), now: () => NOW })
    keeper.saved(stored('먼저'))
    const earlier = keeper.flush()

    await expect(keeper.keepNow(stored('나중'))).resolves.toBe(true)
    await earlier

    expect(fake.puts).toHaveLength(2)
    expect((await uploaded(fake.puts[1]?.envelope)).books[0]?.ledgers['2026']?.entries[0]?.name).toBe('나중')
  })

  it('자동으로 지키기가 꺼져 있으면 올리지 않고 false', async () => {
    const fake = fakeServer()
    const keeper = new AutoKeeper({ server: fake.server, store: memoryStore({ enabled: false }), now: () => NOW })

    await expect(keeper.keepNow(stored())).resolves.toBe(false)

    expect(fake.puts).toHaveLength(0)
  })
})

describe('SPEC-010 자동으로 지키기 보관본 v4', () => {
  it('AC-3 보관본은 v4 기록 파일 내용이고 회원 명단·월 회비·낸 분·엑셀 글이 그대로 담긴다', async () => {
    const fake = fakeServer()
    const keeper = new AutoKeeper({ server: fake.server, store: memoryStore(), now: () => START })
    const data: StoredData = { schemaVersion: CURRENT_SCHEMA_VERSION, books: [duesBook()], settings: { recoveryCode: CODE } }

    await expect(keeper.keepNow(data)).resolves.toBe(true)

    const kept = await uploaded(fake.puts[0]?.envelope)
    expect(kept.schemaVersion).toBe(4)
    expect(kept.books).toEqual(data.books)
  })
})

describe('SPEC-012 AC-8 오류가 생기면 상태 신호를 바로 보낸다', () => {
  const NOW = new Date('2026-11-26T05:00:00.000Z')
  const ORIGIN = 'https://uri-jangbu-preview.pages.dev'

  // 폰에 둔 오류 목록 (앱을 다시 열어도 같은 곳을 읽는다)
  function errorStore(): AppErrorStore & { saved: AppError[] } {
    const store: AppErrorStore & { saved: AppError[] } = {
      saved: [],
      load: () => store.saved,
      save: (errors: readonly AppError[]) => {
        store.saved = [...errors]
      },
    }
    return store
  }

  // 앱 한 번 열기: 진입점(main.tsx)처럼 기록기와 보관기를 잇는다
  function openApp(store: AppErrorStore, state: KeepState = { enabled: true, lastKeptAt: '2026-11-25T00:00:00.000Z' }) {
    const fake = fakeServer()
    const errors = new AppErrorRecorder({ store, origin: ORIGIN, now: () => NOW })
    const keeper = new AutoKeeper({ server: fake.server, store: memoryStore(state), now: () => NOW, appVersion: '2.9.0', errors: errors.list })
    return { ...fake, errors, keeper }
  }

  function crash(message: string): Error {
    const error = new TypeError(message)
    error.stack = `TypeError: ${message}\n    at DuesScreen (${ORIGIN}/assets/index-abc123.js:1:23456)`
    return error
  }

  it('앱 열기 신호는 v2 이고, 오류가 없으면 errors 칸이 없다', async () => {
    const app = openApp(errorStore())
    await app.keeper.start(stored())
    expect(app.statuses).toHaveLength(1)
    expect(app.statuses[0]?.status).toEqual({ v: 2, enabled: true, lastKeptAt: '2026-11-25T00:00:00.000Z', tooLarge: false, appVersion: '2.9.0' })
  })

  it('오류가 생기면 지금 상태와 오류 목록으로 신호를 한 번 더 보낸다', async () => {
    const app = openApp(errorStore())
    await app.keeper.start(stored())
    app.errors.setScreen('dues')
    app.errors.record('render', crash('boom'))
    await app.keeper.reportErrors()

    expect(app.calls).toEqual(['status', 'status'])
    expect(app.statuses[1]?.id).toBe(await keepIdOf(CODE))
    expect(app.statuses[1]?.status).toEqual({
      v: 2,
      enabled: true,
      lastKeptAt: '2026-11-25T00:00:00.000Z',
      tooLarge: false,
      appVersion: '2.9.0',
      errors: [
        {
          kind: 'render',
          name: 'TypeError',
          message: 'boom',
          screen: 'dues',
          where: 'index-abc123.js:1:23456',
          count: 1,
          firstAt: NOW.toISOString(),
          lastAt: NOW.toISOString(),
        },
      ],
    })
  })

  it('앱을 한 번 연 동안 오류 때문에 보내는 신호는 3번까지다', async () => {
    const app = openApp(errorStore())
    await app.keeper.start(stored())
    for (const message of ['one', 'two', 'three', 'four', 'five']) {
      app.errors.record('rejection', crash(message))
      await app.keeper.reportErrors()
    }
    // 앱 열기 1번 + 오류 3번
    expect(app.statuses).toHaveLength(4)
    expect(app.statuses[3]?.status.errors?.map((error) => error.message)).toEqual(['one', 'two', 'three'])
  })

  it('못 보낸 오류는 다음 앱 열기 신호에 실린다 (폰이 7일 동안 갖고 있다)', async () => {
    const store = errorStore()
    const first = openApp(store)
    await first.keeper.start(stored())
    // 3번을 다 쓴 뒤의 오류는 이번에 보내지 못한다
    for (const message of ['one', 'two', 'three']) {
      first.errors.record('rejection', crash(message))
      await first.keeper.reportErrors()
    }
    first.errors.record('render', crash('late'))
    await first.keeper.reportErrors()
    expect(first.statuses.at(-1)?.status.errors?.map((error) => error.message)).toEqual(['one', 'two', 'three'])

    const next = openApp(store)
    await next.keeper.start(stored())
    expect(next.statuses).toHaveLength(1)
    expect(next.statuses[0]?.status.errors?.map((error) => error.message)).toEqual(['one', 'two', 'three', 'late'])
  })

  it('읽기 전용(앱을 열 때 신호를 보내지 않음)·복구 코드 없음이면 오류가 나도 보내지 않는다', async () => {
    const readOnly = openApp(errorStore())
    readOnly.errors.record('render', crash('boom'))
    await readOnly.keeper.reportErrors()
    expect(readOnly.calls).toEqual([])

    const noCode = openApp(errorStore())
    await noCode.keeper.start({ ...stored(), settings: {} })
    noCode.errors.record('render', crash('boom'))
    await noCode.keeper.reportErrors()
    expect(noCode.calls).not.toContain('status')
  })

  it('보내지 않은 경우는 3번에 세지 않는다 (첫 장부로 복구 코드가 생긴 뒤부터 보낸다)', async () => {
    const app = openApp(errorStore())
    await app.keeper.start({ ...stored(), settings: {} })
    for (const message of ['one', 'two', 'three']) {
      app.errors.record('rejection', crash(message))
      await app.keeper.reportErrors()
    }
    app.keeper.setEnabled(false)
    app.keeper.saved(stored())
    await app.keeper.reportErrors()
    expect(app.calls).toEqual(['status'])
  })

  it('신호는 하나씩 차례로 보내고, 보낼 차례에 지금 상태로 만든다 (나중에 닿는 신호가 최신)', async () => {
    const fake = fakeServer()
    const sent: string[] = []
    // 첫 신호는 서버가 답하기 전에 멈춰 둔다
    let firstStarted: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve
    })
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const server: KeepServer = {
      ...fake.server,
      sendStatus: async (_id, status) => {
        sent.push(`시작 ${status.errors?.length ?? 0}`)
        if (sent.length === 1) {
          firstStarted()
          await gate
        }
        sent.push(`끝 ${status.errors?.length ?? 0}`)
      },
    }
    const errors = new AppErrorRecorder({ store: errorStore(), origin: ORIGIN, now: () => NOW })
    const keeper = new AutoKeeper({ server, store: memoryStore({ enabled: true, lastKeptAt: '2026-11-25T00:00:00.000Z' }), now: () => NOW, errors: errors.list })

    const opening = keeper.start(stored())
    await started
    errors.record('render', crash('boom'))
    const reporting = keeper.reportErrors()
    errors.record('render', crash('again'))
    release()
    await Promise.all([opening, reporting])

    // 첫 신호가 끝난 뒤에 둘째 신호를 시작하고, 둘째는 그때 둔 오류 둘을 싣는다
    expect(sent).toEqual(['시작 0', '끝 0', '시작 2', '끝 2'])
  })
})
