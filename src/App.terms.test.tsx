import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Settings, StoredData } from './domain/types'
import { AutoKeeper, type KeepState } from './features/keep/AutoKeeper'
import type { KeepServer } from './features/keep/keepServer'
import type { Keep } from './features/keep/startKeep'
import type { LedgerRepository, LoadResult } from './storage/LedgerRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { createEmptyData } from './storage/schema'
import { ledger, storedWith } from './test/ledgerFixtures'

// SPEC-006 v2.6 용어 바꾸기: 화면에 보이는 글자와 화면 읽기 이름 어디에도 옛 말이 없어야 한다
const OLD_TERMS = /백업|자동 보관/

const TODAY = new Date('2026-10-13T09:00:00.000+09:00')
const DAY = 24 * 60 * 60 * 1000
const PHONE_CODE = 'HK7M-29QF-MX4P-8R2D'

// 화면 전체(띄운 창·숨긴 화면 읽기 글자 포함)를 훑어 옛 말이 든 곳을 모은다
function oldTermsOnScreen(): string[] {
  const found: string[] = []
  const text = document.body.textContent ?? ''
  if (OLD_TERMS.test(text)) found.push(`글자: ${text}`)
  for (const element of document.body.querySelectorAll('*')) {
    for (const name of ['aria-label', 'aria-description', 'aria-valuetext', 'title', 'alt', 'placeholder']) {
      const value = element.getAttribute(name)
      if (value && OLD_TERMS.test(value)) found.push(`${element.tagName} ${name}="${value}"`)
    }
  }
  if (OLD_TERMS.test(document.title)) found.push(`문서 제목: ${document.title}`)
  return found
}

function expectNoOldTerms() {
  expect(oldTermsOnScreen()).toEqual([])
}

function phoneData(settings: Settings = {}): StoredData {
  return {
    ...storedWith(ledger([[10, 'expense', '대관료', 40_000]], { year: 2026 })),
    settings: { lastBackupAt: TODAY.toISOString(), recoveryCode: PHONE_CODE, ...settings },
  }
}

// 30일 넘게 기록 파일을 보내지 않은 폰
const OVERDUE: Settings = { lastBackupAt: '2026-08-01T00:00:00.000Z', lastChangedAt: '2026-09-01T00:00:00.000Z' }

const SERVER: KeepServer = {
  put: async () => 'ok',
  get: async () => ({ status: 'not-found' }),
  remove: async () => true,
  sendStatus: async () => {},
}

function keepWith(state: KeepState): Keep {
  let saved = state
  const store = { load: () => saved, save: (next: KeepState) => (saved = next) }
  return { keeper: new AutoKeeper({ server: SERVER, store, now: () => TODAY }), server: SERVER }
}

function renderApp(repository: LedgerRepository, options: { keep?: Keep; loaded?: LoadResult } = {}) {
  render(
    <App
      repository={repository}
      loaded={options.loaded ?? repository.load()}
      keep={options.keep}
      options={{ now: () => TODAY, createId: () => 'id' }}
    />,
  )
}

async function openSettings() {
  await userEvent.click(screen.getByRole('button', { name: /^설정/ }))
}

describe('SPEC-006 v2.6 용어 바꾸기 (백업 → 기록 파일, 자동 보관 → 자동으로 지키기)', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share')
    Reflect.deleteProperty(navigator, 'canShare')
    vi.restoreAllMocks()
  })

  it('AC-15 첫 실행(서버 주소 없는 빌드) 화면에 옛 말이 없고 [기록 파일 불러오기] 가 있다', () => {
    renderApp(new MemoryRepository())

    expect(screen.getByRole('button', { name: '기록 파일 불러오기' })).toBeInTheDocument()
    expect(screen.getByLabelText('기록 파일 고르기')).toBeInTheDocument()
    expectNoOldTerms()
  })

  it('AC-15 첫 실행(서버 있는 빌드)과 복구 코드로 불러오기 화면에 옛 말이 없고, 안내는 "예전 폰 설정 맨 위에 있던 16자예요"', async () => {
    renderApp(new MemoryRepository(), { keep: keepWith({ enabled: true }) })
    expectNoOldTerms()

    await userEvent.click(screen.getByRole('button', { name: '복구 코드로 불러오기' }))

    expect(screen.getByText('예전 폰 설정 맨 위에 있던 16자예요. 4자마다 줄표는 저절로 들어가요.')).toBeInTheDocument()
    expectNoOldTerms()
  })

  it('AC-15 30일 안내(장부 띠·[설정] 점)·서버 없는 설정·보내기 알림에 옛 말이 없다', async () => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: vi.fn(() => Promise.resolve()), configurable: true })
    renderApp(new MemoryRepository(phoneData(OVERDUE)))

    expect(screen.getByTestId('notice-bar')).toHaveTextContent('한 달 넘게 기록 파일을 보내지 않았어요')
    expect(screen.getByRole('button', { name: '설정, 기록 파일 보내기 필요' })).toBeInTheDocument()
    expectNoOldTerms()

    await openSettings()
    expectNoOldTerms()

    await userEvent.click(within(screen.getByTestId('notice-bar')).getByRole('button', { name: '기록 파일 보내기' }))
    expect(await screen.findByText('기록 파일을 보냈어요')).toBeInTheDocument()
    expectNoOldTerms()
  })

  it('AC-15 공유가 안 돼 내려받으면 "기록 파일을 다운로드 폴더에 저장했어요"', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:keep')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderApp(new MemoryRepository(phoneData()))
    await openSettings()

    await userEvent.click(screen.getByRole('button', { name: /^기록 파일 보내기/ }))

    expect(await screen.findByText('기록 파일을 다운로드 폴더에 저장했어요')).toBeInTheDocument()
    expectNoOldTerms()
  })

  it('AC-15 서버 있는 설정(맨 위 카드·펼친 다른 방법·선택 창·끄기 확인 창·알림)에 옛 말이 없다', async () => {
    const lastKeptAt = new Date(TODAY.getTime() - 3 * 60_000).toISOString()
    renderApp(new MemoryRepository(phoneData()), { keep: keepWith({ enabled: true, lastKeptAt }) })
    await openSettings()

    expect(screen.getByTestId('keep-status')).toHaveTextContent('자동으로 지키기 켜짐 · 3분 전에 보관했어요')
    expectNoOldTerms()

    await userEvent.click(screen.getByRole('button', { name: '다른 방법으로 옮기기' }))
    expectNoOldTerms()

    await userEvent.click(screen.getByRole('button', { name: /^자동으로 지키기/ }))
    expectNoOldTerms()
    await userEvent.click(within(screen.getByRole('group', { name: '자동으로 지키기' })).getByRole('button', { name: '끄기' }))
    await screen.findByRole('alertdialog')
    expectNoOldTerms()
    await userEvent.click(screen.getByRole('button', { name: '남겨 두기' }))
    expect(await screen.findByText('자동으로 지키기를 껐어요')).toBeInTheDocument()
    expect(screen.getByTestId('keep-status')).toHaveTextContent('자동으로 지키기 꺼짐')
    expectNoOldTerms()

    await userEvent.click(screen.getByRole('button', { name: /^자동으로 지키기/ }))
    await userEvent.click(within(screen.getByRole('group', { name: '자동으로 지키기' })).getByRole('button', { name: '켜기' }))
    expect(await screen.findByText('자동으로 지키기를 켰어요')).toBeInTheDocument()
    expectNoOldTerms()
  })

  it('AC-15 끄며 [지우기] 를 고르면 "자동으로 지키기를 끄고 보관해 둔 기록을 지웠어요"', async () => {
    // 지울 사본의 이름은 보관기가 마지막으로 받은 기록의 복구 코드에서 만든다
    const keep = keepWith({ enabled: true })
    keep.keeper.start(phoneData())
    await keep.keeper.idle()
    renderApp(new MemoryRepository(phoneData()), { keep })
    await openSettings()
    await userEvent.click(screen.getByRole('button', { name: '다른 방법으로 옮기기' }))
    await userEvent.click(screen.getByRole('button', { name: /^자동으로 지키기/ }))
    await userEvent.click(within(screen.getByRole('group', { name: '자동으로 지키기' })).getByRole('button', { name: '끄기' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '지우기' }))

    expect(await screen.findByText('자동으로 지키기를 끄고 보관해 둔 기록을 지웠어요')).toBeInTheDocument()
    expectNoOldTerms()
  })

  it('AC-15 보관본이 너무 크면 "기록 파일을 보내 두세요"', async () => {
    renderApp(new MemoryRepository(phoneData()), { keep: keepWith({ enabled: true, tooLarge: true }) })
    await openSettings()

    expect(screen.getByText('기록이 너무 많아 보관하지 못했어요. 기록 파일을 보내 두세요')).toBeInTheDocument()
    expectNoOldTerms()
  })

  it('AC-15 기록 파일 불러오기 확인 창·오류 창에 옛 말이 없다', async () => {
    renderApp(new MemoryRepository(phoneData()))
    await openSettings()

    await userEvent.upload(screen.getByLabelText('기록 파일 고르기'), new File([JSON.stringify(createEmptyData())], '우리장부-기록-2026-10-13.txt', { type: 'text/plain' }))
    expect(within(await screen.findByRole('alertdialog')).getByText('장부가 없는 기록 파일이에요. 불러올까요?')).toBeInTheDocument()
    expectNoOldTerms()
    await userEvent.click(screen.getByRole('button', { name: '아니요' }))

    await userEvent.upload(screen.getByLabelText('기록 파일 고르기'), new File(['{"schemaVersion": 3,'], '메모.txt', { type: 'text/plain' }))
    expect(await screen.findByText('우리 장부에서 보낸 기록 파일인지 확인해 주세요')).toBeInTheDocument()
    expectNoOldTerms()
  })

  it('AC-15 저장 실패·시작 안내 띠와 그 버튼에 옛 말이 없다', async () => {
    const repository = new MemoryRepository(phoneData())
    let failing = false
    const flaky: LedgerRepository = {
      load: () => repository.load(),
      save: (data) => (failing ? { ok: false, reason: 'quota-exceeded' } : repository.save(data)),
      restore: (data) => repository.restore(data),
    }
    renderApp(flaky)
    failing = true
    await userEvent.click(screen.getByRole('button', { name: '내역 적기' }))
    await userEvent.type(screen.getByRole('textbox', { name: '며칠인가요?' }), '3')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    await userEvent.click(screen.getByRole('button', { name: '간식비 지출' }))
    await userEvent.type(screen.getByLabelText('얼마인가요?'), '5000')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    const notice = screen.getByTestId('notice-bar')
    expect(notice).toHaveTextContent('저장하지 못했어요. 기록 파일을 보내 두세요')
    expect(within(notice).getByRole('button', { name: '기록 파일 보내기' })).toBeInTheDocument()
    expectNoOldTerms()
  })

  it('AC-15 읽기 전용 시작 안내([기록 파일 불러오기]·[기록 파일 보내기])에 옛 말이 없다', () => {
    const { unmount } = render(
      <App
        repository={new MemoryRepository()}
        loaded={{ status: 'read-only', reason: 'unreadable-original', data: createEmptyData() }}
        options={{ now: () => TODAY, createId: () => 'id' }}
      />,
    )
    expect(within(screen.getByTestId('notice-bar')).getByRole('button', { name: '기록 파일 불러오기' })).toBeInTheDocument()
    expectNoOldTerms()
    unmount()

    renderApp(new MemoryRepository(), { loaded: { status: 'read-only', reason: 'old-version-unpreserved', data: phoneData() } })
    expect(within(screen.getByTestId('notice-bar')).getByRole('button', { name: '기록 파일 보내기' })).toBeInTheDocument()
    expectNoOldTerms()
  })

  it('AC-15 7일 보관 안내 띠는 "보관" 동사를 그대로 쓰고 옛 이름은 없다', () => {
    renderApp(new MemoryRepository(phoneData()), {
      keep: keepWith({ enabled: true, pendingSince: new Date(TODAY.getTime() - 8 * DAY).toISOString() }),
    })

    expect(screen.getByTestId('notice-bar')).toHaveTextContent('인터넷에 연결되면 기록을 자동으로 보관해요. 7일째 보관하지 못했어요')
    expectNoOldTerms()
  })
})
