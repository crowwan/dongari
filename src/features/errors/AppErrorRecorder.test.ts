import { describe, expect, it, vi } from 'vitest'
import type { AppError } from './appErrors'
import { AppErrorRecorder } from './AppErrorRecorder'
import { APP_ERRORS_KEY, localAppErrorStore, type AppErrorStore } from './appErrorStore'

const ORIGIN = 'https://uri-jangbu-preview.pages.dev'
const NOW = new Date('2026-11-26T05:00:00.000Z')
const APP_STACK = `TypeError: boom\n    at DuesScreen (${ORIGIN}/assets/index-abc123.js:1:23456)`

function memoryStore(initial: AppError[] = []): AppErrorStore & { saved: AppError[] } {
  const store = {
    saved: initial,
    load: () => store.saved,
    save: (errors: readonly AppError[]) => {
      store.saved = [...errors]
    },
  }
  return store
}

function recorder(store: AppErrorStore = memoryStore(), now = () => NOW) {
  return new AppErrorRecorder({ store, origin: ORIGIN, now })
}

function appError(message: string): Error {
  const error = new TypeError(message)
  error.stack = APP_STACK
  return error
}

// 브라우저가 window 에 보내는 Promise 거절 이벤트 (jsdom 에는 PromiseRejectionEvent 가 없다)
function rejectionEvent(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason })
}

describe('SPEC-012 AC-6 네 종류의 오류를 기록한다', () => {
  it('화면 그리기 오류(render)는 마지막으로 알던 화면 이름으로 기록한다', () => {
    const errors = recorder()
    errors.setScreen('dues')
    errors.record('render', appError('boom'))
    expect(errors.list()).toEqual([
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
    ])
  })

  it('화면 이름을 모르면 unknown 이다', () => {
    const errors = recorder()
    errors.record('render', appError('boom'))
    expect(errors.list()[0]?.screen).toBe('unknown')
  })

  it('window 의 error 이벤트를 잡히지 않은 오류(uncaught)로 기록한다', () => {
    const win = new EventTarget()
    const errors = recorder()
    errors.setScreen('ledger')
    errors.listen(win)
    win.dispatchEvent(new ErrorEvent('error', { error: appError('x is not a function'), message: 'Uncaught TypeError: x is not a function' }))
    expect(errors.list()).toEqual([expect.objectContaining({ kind: 'uncaught', name: 'TypeError', message: 'x is not a function', screen: 'ledger' })])
  })

  it('window 의 unhandledrejection 이벤트를 Promise 거절(rejection)로 기록한다', () => {
    const win = new EventTarget()
    const errors = recorder()
    errors.listen(win)
    win.dispatchEvent(rejectionEvent(appError('Load failed')))
    expect(errors.list()).toEqual([expect.objectContaining({ kind: 'rejection', name: 'TypeError', message: 'Load failed' })])
  })

  it('저장 실패 띠(save)는 실패 이유를 이름으로 기록한다', () => {
    const errors = recorder()
    errors.setScreen('add-entry')
    errors.recordSave('quota-exceeded')
    expect(errors.list()).toEqual([expect.objectContaining({ kind: 'save', name: 'quota-exceeded', message: '', screen: 'add-entry' })])
  })

  it('떼면 더 듣지 않는다', () => {
    const win = new EventTarget()
    const errors = recorder()
    const stop = errors.listen(win)
    stop()
    win.dispatchEvent(rejectionEvent(appError('late')))
    expect(errors.list()).toEqual([])
  })

  it('같은 오류는 묶어 횟수를 올린다', () => {
    let now = new Date('2026-11-26T01:00:00.000Z')
    const errors = recorder(memoryStore(), () => now)
    errors.record('render', appError('boom'))
    now = NOW
    errors.record('render', appError('boom'))
    expect(errors.list()).toEqual([expect.objectContaining({ count: 2, firstAt: '2026-11-26T01:00:00.000Z', lastAt: NOW.toISOString() })])
  })
})

describe('SPEC-012 AC-6 세지 않는 것', () => {
  it('사용자 취소(AbortError) 거절은 세지 않는다', () => {
    const win = new EventTarget()
    const errors = recorder()
    errors.listen(win)
    win.dispatchEvent(rejectionEvent(new DOMException('Share canceled', 'AbortError')))
    expect(errors.list()).toEqual([])
  })

  it('내용 없는 Script error.(다른 출처 스크립트)는 세지 않는다', () => {
    const win = new EventTarget()
    const errors = recorder()
    errors.listen(win)
    win.dispatchEvent(new ErrorEvent('error', { message: 'Script error.', error: null }))
    expect(errors.list()).toEqual([])
  })

  it('카톡 안 브라우저·확장이 넣은 다른 출처 파일의 오류는 세지 않는다', () => {
    const win = new EventTarget()
    const errors = recorder()
    errors.listen(win)
    win.dispatchEvent(
      new ErrorEvent('error', { message: 'Uncaught ReferenceError: kakao is not defined', filename: 'https://t1.kakaocdn.net/inject.js', lineno: 1, colno: 5 }),
    )
    expect(errors.list()).toEqual([])
  })

  it('이미지 등 파일 읽기 실패(ErrorEvent 가 아닌 error)는 세지 않는다', () => {
    const win = new EventTarget()
    const errors = recorder()
    errors.listen(win)
    win.dispatchEvent(new Event('error'))
    expect(errors.list()).toEqual([])
  })
})

describe('SPEC-012 보낼 일이 생겼음을 알린다', () => {
  it('오류를 기록하면 듣는 쪽(자동 보관기)에 알린다. 세지 않은 오류는 알리지 않는다', () => {
    const errors = recorder()
    const listener = vi.fn()
    errors.subscribe(listener)
    errors.record('render', appError('boom'))
    errors.record('rejection', new DOMException('canceled', 'AbortError'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('알리다 생긴 오류는 기록을 막지 않고 다시 세지도 않는다', () => {
    const errors = recorder()
    errors.subscribe(() => {
      throw new Error('보내다 실패')
    })
    expect(() => errors.record('render', appError('boom'))).not.toThrow()
    expect(errors.list()).toHaveLength(1)
  })
})

describe('SPEC-012 폰 기록 (localStorage, 장부와 다른 키)', () => {
  it('장부(dongari:v2)와 다른 키 dongari:errors 에 둔다', () => {
    const storage = new Map<string, string>()
    const store = localAppErrorStore({ getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => void storage.set(key, value) })
    const errors = recorder(store)
    errors.record('render', appError('boom'))
    expect(APP_ERRORS_KEY).toBe('dongari:errors')
    expect([...storage.keys()]).toEqual(['dongari:errors'])
    expect(recorder(store).list()).toEqual(errors.list())
  })

  it('다시 열면 폰에 둔 오류를 읽는다 (7일 지난 줄은 버린다)', () => {
    const kept: AppError = { kind: 'render', name: 'TypeError', message: 'boom', screen: 'dues', count: 1, firstAt: '2026-11-25T00:00:00.000Z', lastAt: '2026-11-25T00:00:00.000Z' }
    const stale: AppError = { ...kept, name: 'Old', lastAt: '2026-11-01T00:00:00.000Z' }
    expect(recorder(memoryStore([stale, kept])).list()).toEqual([kept])
  })

  it('읽기가 실패하거나 모양이 틀리면 빈 목록, 서버가 받지 않을 줄은 빼고 읽는다', () => {
    const throwing = localAppErrorStore({
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      setItem: () => {},
    })
    expect(throwing.load()).toEqual([])
    const broken = localAppErrorStore({ getItem: () => '{not json', setItem: () => {} })
    expect(broken.load()).toEqual([])
    const good: AppError = { kind: 'save', name: 'quota-exceeded', message: '', screen: 'ledger', count: 2, firstAt: NOW.toISOString(), lastAt: NOW.toISOString() }
    const mixed = localAppErrorStore({ getItem: () => JSON.stringify([good, { ...good, stack: 'x' }, 'TypeError']), setItem: () => {} })
    expect(mixed.load()).toEqual([good])
  })

  it('쓰기가 실패해도(저장 공간 모자람) 넘어가고, 이번에 연 동안은 메모리의 목록으로 보낸다', () => {
    const store = localAppErrorStore({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError')
      },
    })
    const errors = recorder(store)
    expect(() => errors.recordSave('quota-exceeded')).not.toThrow()
    expect(errors.list()).toEqual([expect.objectContaining({ kind: 'save', name: 'quota-exceeded' })])
  })
})
