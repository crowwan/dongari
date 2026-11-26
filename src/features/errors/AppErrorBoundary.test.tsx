import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { LocalStorageRepository, STORAGE_KEY } from '../../storage/LocalStorageRepository'
import { ledger, storedWith } from '../../test/ledgerFixtures'
import { AppErrorBoundary } from './AppErrorBoundary'
import { AppErrorRecorder } from './AppErrorRecorder'
import { localAppErrorStore } from './appErrorStore'

const TODAY = new Date('2026-10-03T09:00:00.000+09:00')

// 그리다 오류를 내는 부품 (crash 가 참일 때)
function Crash({ crash }: { crash: boolean }) {
  if (crash) throw new TypeError("Cannot read properties of undefined (reading 'name')")
  return null
}

describe('SPEC-012 AC-5 화면 그리기 오류가 나면 "다시 열기" 화면', () => {
  // React 가 잡은 그리기 오류를 console.error 로 알린다 (시험 출력만 조용히)
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('오류가 없으면 안의 화면을 그대로 그린다', () => {
    render(
      <AppErrorBoundary>
        <p>장부 화면</p>
      </AppErrorBoundary>,
    )
    expect(screen.getByText('장부 화면')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '화면에 문제가 생겼어요' })).not.toBeInTheDocument()
  })

  it('그리다 오류가 나면 흰 화면 대신 제목·본문·[다시 열기] 를 보인다', () => {
    render(
      <AppErrorBoundary>
        <Crash crash />
      </AppErrorBoundary>,
    )
    expect(screen.getByRole('heading', { level: 1, name: '화면에 문제가 생겼어요' })).toBeInTheDocument()
    expect(screen.getByText('적어 둔 기록은 폰에 그대로 있어요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 열기' })).toBeInTheDocument()
  })

  it('[다시 열기] 는 앱을 처음부터 다시 연다 (location.reload)', async () => {
    const reload = vi.fn()
    render(
      <AppErrorBoundary reload={reload}>
        <Crash crash />
      </AppErrorBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: '다시 열기' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('잡은 오류를 한 번 알린다 (오류 기록기가 render 로 센다)', () => {
    const onError = vi.fn()
    render(
      <AppErrorBoundary onError={onError}>
        <Crash crash />
      </AppErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(TypeError)
  })

  it('알리다 오류가 나도 다시 열기 화면은 그대로 보인다', () => {
    render(
      <AppErrorBoundary
        onError={() => {
          throw new Error('기록 실패')
        }}
      >
        <Crash crash />
      </AppErrorBoundary>,
    )
    expect(screen.getByRole('button', { name: '다시 열기' })).toBeInTheDocument()
  })

  it('화면 읽기가 새 화면을 알게 제목에 포커스를 주고, 브라우저 제목을 바꾼다', () => {
    render(
      <AppErrorBoundary>
        <Crash crash />
      </AppErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: '화면에 문제가 생겼어요' })).toHaveFocus()
    expect(document.title).toBe('화면에 문제가 생겼어요 · 우리 장부')
  })

  describe('진짜 장부 화면에서', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    function renderApp(crash: boolean, recorder?: AppErrorRecorder) {
      const repository = new LocalStorageRepository()
      return (
        <AppErrorBoundary onError={(error) => recorder?.record('render', error)}>
          <App repository={repository} loaded={repository.load()} appErrors={recorder} options={{ now: () => TODAY }} />
          <Crash crash={crash} />
        </AppErrorBoundary>
      )
    }

    it('저장된 기록은 그대로이고, 다시 열면 그 기록으로 열린다', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedWith(ledger([[10, 'income', '회비', 140_000]], { year: 2026 }))))
      const before = localStorage.getItem(STORAGE_KEY)
      const view = render(renderApp(false))
      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()

      view.rerender(renderApp(true))
      expect(screen.getByRole('heading', { name: '화면에 문제가 생겼어요' })).toBeInTheDocument()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before)

      // [다시 열기] = 처음부터 다시 연다: 진입점처럼 저장소를 새로 읽어 그린다
      view.unmount()
      render(renderApp(false))
      expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^회비 수입/ })).toBeInTheDocument()
    })

    it('그리기 오류는 오류 경계가 마지막으로 알던 화면 이름으로 기록된다', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedWith(ledger([[10, 'income', '회비', 140_000]], { year: 2026 }))))
      const recorder = new AppErrorRecorder({ store: localAppErrorStore(), origin: window.location.origin, now: () => TODAY })
      const view = render(renderApp(false, recorder))
      await userEvent.click(screen.getByRole('button', { name: '설정' }))

      view.rerender(renderApp(true, recorder))
      expect(recorder.list()).toEqual([
        expect.objectContaining({ kind: 'render', name: 'TypeError', message: "Cannot read properties of undefined (reading 'name')", screen: 'settings', count: 1 }),
      ])
    })
  })
})
