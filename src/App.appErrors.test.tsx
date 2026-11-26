import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AppErrorBoundary } from './features/errors/AppErrorBoundary'
import { AppErrorRecorder } from './features/errors/AppErrorRecorder'
import { AppRoot } from './features/practice/AppRoot'
import { MemoryRepository } from './storage/MemoryRepository'
import { fakeBrowser } from './test/installFakes'
import { ledger, storedWith } from './test/ledgerFixtures'

// 회비 표 화면이 처음 그릴 때 던진다 (그 화면의 그리기는 끝나지 않는다)
vi.mock('./features/dues/DuesScreen', () => ({
  DuesScreen: () => {
    throw new TypeError('dues crash')
  },
}))

const TODAY = new Date('2026-10-03T09:00:00.000+09:00')

function recorder() {
  return new AppErrorRecorder({ store: { load: () => [], save: () => {} }, origin: window.location.origin, now: () => TODAY })
}

describe('SPEC-012 AC-6 그리기 오류의 화면 이름은 그리려던 화면', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('장부 → [회비 표] 에서 회비 표가 처음 그릴 때 던지면 dues 로 기록된다 (직전 화면 ledger 가 아니라)', async () => {
    const errors = recorder()
    const repository = new MemoryRepository(storedWith(ledger([[10, 'income', '회비', 140_000]], { year: 2026 })))
    render(
      <AppErrorBoundary onError={(error) => errors.record('render', error)}>
        <App repository={repository} loaded={repository.load()} appErrors={errors} options={{ now: () => TODAY }} />
      </AppErrorBoundary>,
    )

    await userEvent.click(screen.getByRole('button', { name: /회비 표/ }))

    expect(screen.getByRole('heading', { name: '화면에 문제가 생겼어요' })).toBeInTheDocument()
    expect(errors.list()).toEqual([expect.objectContaining({ kind: 'render', name: 'TypeError', message: 'dues crash', screen: 'dues' })])
  })

  it('진짜 App 밖 화면은 첫 실행 물음 first-run, 연습 장부 practice 로 알린다 (연습 App 은 진짜 화면 이름을 덮지 않는다)', async () => {
    const errors = recorder()
    const repository = new MemoryRepository(undefined)
    render(
      <AppRoot
        repository={repository}
        loaded={repository.load()}
        install={fakeBrowser({ standalone: true }).install}
        appErrors={errors}
        options={{ now: () => TODAY }}
      />,
    )
    errors.record('render', new Error('on question'))

    await userEvent.click(screen.getByRole('button', { name: /연습해 보기/ }))
    errors.record('render', new Error('in practice'))

    expect(errors.list().map((error) => error.screen)).toEqual(['first-run', 'practice'])
  })
})
