import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorRecorder } from './AppErrorRecorder'
import { renderStartScreen } from './startScreen'

function Crash(): null {
  throw new TypeError('screen crash')
}

describe('SPEC-012 AC-5 시작 때도 흰 화면 대신 다시 열기 화면', () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function recorder() {
    return new AppErrorRecorder({ store: { load: () => [], save: () => {} }, origin: window.location.origin })
  }

  it('화면 고르기(시작 코드)가 던지면 그 오류를 render 로 세고 다시 열기 화면을 그린다', async () => {
    const errors = recorder()
    const reload = vi.fn()
    await act(() =>
      renderStartScreen(
        root,
        async () => {
          throw new TypeError('storage exploded')
        },
        errors,
        reload,
      ),
    )

    expect(screen.getByRole('heading', { name: '화면에 문제가 생겼어요' })).toHaveFocus()
    expect(errors.list()).toEqual([expect.objectContaining({ kind: 'render', name: 'TypeError', message: 'storage exploded', screen: 'unknown' })])
    await userEvent.click(screen.getByRole('button', { name: '다시 열기' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('고른 화면은 오류 경계 안에 그려, 그리다 던지면 다시 열기 화면이다', async () => {
    const errors = recorder()
    await act(() => renderStartScreen(root, async () => <Crash />, errors, vi.fn()))

    expect(screen.getByRole('heading', { name: '화면에 문제가 생겼어요' })).toBeInTheDocument()
    expect(errors.list()).toEqual([expect.objectContaining({ kind: 'render', message: 'screen crash' })])
  })

  it('잘 그리면 고른 화면 그대로다', async () => {
    await act(() => renderStartScreen(root, async () => <p>장부</p>, recorder(), vi.fn()))
    expect(screen.getByText('장부')).toBeInTheDocument()
  })
})
