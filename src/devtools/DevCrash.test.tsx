import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../features/errors/AppErrorBoundary'
import { AppErrorRecorder } from '../features/errors/AppErrorRecorder'
import { DevCrash } from './DevCrash'
import { askDevCrash, DEV_CRASH_KEY, takeDevCrash } from './crashRequest'

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

describe('SPEC-012 AC-11 개발 확인 화면 [오류 내 보기]', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('적어 둔 표시는 한 번만 읽힌다 ([다시 열기] 뒤에는 오류가 나지 않게)', () => {
    const storage = memoryStorage()
    expect(takeDevCrash(storage)).toBe(false)
    askDevCrash(storage)
    expect(storage.items.has(DEV_CRASH_KEY)).toBe(true)
    expect(takeDevCrash(storage)).toBe(true)
    expect(takeDevCrash(storage)).toBe(false)
  })

  it('세션 저장소가 막혀 있어도 예외 없이 오류를 내지 않는다', () => {
    const blocked = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      removeItem: () => {},
    }
    expect(() => askDevCrash(blocked)).not.toThrow()
    expect(takeDevCrash(blocked)).toBe(false)
  })

  it('앱이 한 번 그려진 뒤 그리기 오류를 내서 "다시 열기" 화면을 띄우고, 정리한 글로 기록된다', () => {
    const recorder = new AppErrorRecorder({ store: { load: () => [], save: () => {} }, origin: window.location.origin })
    function Screen() {
      recorder.setScreen('ledger')
      return <p>장부</p>
    }
    render(
      <AppErrorBoundary onError={(error) => recorder.record('render', error)}>
        <Screen />
        <DevCrash />
      </AppErrorBoundary>,
    )
    expect(screen.getByText('장부')).toBeInTheDocument()

    act(() => {
      vi.runAllTimers()
    })

    expect(screen.getByRole('heading', { name: '화면에 문제가 생겼어요' })).toBeInTheDocument()
    expect(recorder.list()).toEqual([expect.objectContaining({ kind: 'render', name: 'Error', message: 'dev crash test … #,#…', screen: 'ledger' })])
  })
})
