import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookKind, StoredData } from './domain/types'
import { ACTIVE_GUIDE } from './features/guide/guideRules'
import { GUIDE_KEY, localGuideStore } from './features/guide/guideStore'
import { AutoKeeper } from './features/keep/AutoKeeper'
import type { KeepServer } from './features/keep/keepServer'
import { localKeepStateStore } from './features/keep/keepStateStore'
import type { Keep } from './features/keep/startKeep'
import { AppRoot } from './features/practice/AppRoot'
import type { PictureSaver } from './features/report/savePicture'
import type { LedgerRepository } from './storage/LedgerRepository'
import { LocalStorageRepository, STORAGE_KEY } from './storage/LocalStorageRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { NotifyingRepository } from './storage/NotifyingRepository'
import { fakeBrowser } from './test/installFakes'
import { book, ledger, type EntrySpec } from './test/ledgerFixtures'
import {
  button,
  click,
  deleteExpense,
  fakeSaver,
  HOUSEHOLD,
  lookAtMonth,
  pressBack,
  PRACTICE_TODAY,
  reachYear,
  startPracticeFromQuestion,
  writeTwoLines,
} from './test/practiceFlow'

const TODAY = PRACTICE_TODAY
const PHONE_CODE = 'HK7M-29QF-MX4P-8R2D'
const RIBBON = '연습 · 진짜 결산이 아니에요'
const SEND_MESSAGE = "결산은 사진으로 보낼 수 있어요. [사진 보내기]를 눌러 카톡 '나와의 채팅'에 보내 보세요"

// 진짜 폰처럼: localStorage 저장소 + 저장 알림을 듣는 자동으로 지키기(서버는 부름만 센다) + dongari:guide
function phone({ saver = fakeSaver([]).saver, withKeep = true }: { saver?: PictureSaver; withKeep?: boolean } = {}) {
  const server = {
    put: vi.fn<KeepServer['put']>(async () => 'ok'),
    get: vi.fn<KeepServer['get']>(async () => ({ status: 'not-found' })),
    remove: vi.fn<KeepServer['remove']>(async () => true),
    sendStatus: vi.fn<KeepServer['sendStatus']>(async () => {}),
  }
  const storage = new LocalStorageRepository()
  const keep: Keep | undefined = withKeep
    ? { keeper: new AutoKeeper({ server, store: localKeepStateStore(), now: () => TODAY, delayMs: 0 }), server }
    : undefined
  const repository: LedgerRepository = keep ? new NotifyingRepository(storage, (data) => keep.keeper.saved(data)) : storage
  const view = render(
    <AppRoot
      repository={repository}
      loaded={storage.load()}
      keep={keep}
      guideStore={localGuideStore()}
      saver={saver}
      options={{ now: () => TODAY, createId: () => crypto.randomUUID(), createRecoveryCode: () => PHONE_CODE }}
    />,
  )
  return { server, ...view }
}

// 메모리 저장소로 연다 (localStorage 와 상관없는 흐름 확인).
// 홈 화면 앱으로 연 폰이라 끝 화면이 SPEC-008 모양 그대로다 (브라우저면 SPEC-009 B 가 홈 화면에 추가를 묻는다 — App.practiceInstall.test)
function openWith(data: StoredData | undefined, saver: PictureSaver = fakeSaver([]).saver) {
  const repository = new MemoryRepository(data)
  const install = fakeBrowser({ standalone: true }).install
  return render(
    <AppRoot repository={repository} loaded={repository.load()} install={install} saver={saver} options={{ now: () => TODAY }} />,
  )
}

// 10월 기록이 든 진짜 장부 (기록 파일을 막 보내 30일 안내가 없다)
function realPhone(kind: BookKind = 'club', count = 2): StoredData {
  const specs: EntrySpec[] = Array.from({ length: count }, (_, index) => [10, 'expense', `지출${index + 1}`, 10_000])
  return {
    schemaVersion: 3,
    books: [book([ledger(specs, { year: 2026 })], { kind })],
    settings: { lastBackupAt: TODAY.toISOString(), recoveryCode: PHONE_CODE },
  }
}

const coach = () => screen.queryByTestId('coach-mark')
const band = () => screen.queryByTestId('practice-band')
const isLocked = (element: HTMLElement) => element.closest('[inert]') !== null

// 가리키는 곳의 설명 끝이 말풍선 글 + "연습 N / 4" (버튼 자기 안내가 앞에 있을 수 있다)
function expectCoachOn(target: HTMLElement, message: string, stage: number) {
  expect(coach()).toBeInTheDocument()
  expect(target).toHaveAccessibleDescription(new RegExp(`${escapeRegExp(message)} 연습 ${stage} / 4$`))
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('SPEC-008 첫 실행 물음', () => {
  it('AC-1 장부가 하나도 없는 폰에서 앱을 열면 "처음이세요?" 와 따라 해 볼 것 네 줄, [연습해 보기]·[바로 시작] 이 뜬다', () => {
    openWith(undefined)

    expect(screen.getByRole('heading', { level: 1, name: '처음이세요?' })).toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      '1회비 한 줄 적기',
      '2이번 달 정리 보기',
      '3잘못 적은 줄 지우기',
      '4결산 사진 보내 보기',
    ])
    expect(button('연습해 보기')).toBeInTheDocument()
    expect(button('바로 시작')).toBeInTheDocument()
    expect(screen.queryByTestId('new-book-screen')).not.toBeInTheDocument()
  })

  it('장부가 있는 폰은 물음 없이 장부가 열린다', () => {
    openWith(realPhone())

    expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('first-run-question')).not.toBeInTheDocument()
  })

  it('AC-2 [바로 시작] 을 누르면 첫 실행 새 장부 만들기가 열리고, 거기서 뒤로 버튼을 누르면 물음으로 돌아온다', async () => {
    openWith(undefined)

    await click('바로 시작')
    expect(screen.getByRole('heading', { level: 1, name: '새 장부 만들기' })).toBeInTheDocument()
    expect(button('기록 파일 불러오기')).toBeInTheDocument()

    await pressBack()
    expect(await screen.findByRole('heading', { level: 1, name: '처음이세요?' })).toBeInTheDocument()
  })

  it('AC-3 [연습해 보기] 를 누르면 "연습 장부"(올해, 잔액 0원)에 연습 띠와 말풍선(연습 1 / 4)이 [+ 내역 적기] 를 가리킨다', async () => {
    openWith(undefined)

    await startPracticeFromQuestion()

    expect(screen.getByTestId('book-button')).toHaveTextContent('연습 장부 2026년')
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('0원')
    expect(band()).toHaveTextContent('연습 중이에요 저장되지 않아요')
    expectCoachOn(button('내역 적기'), '회비 10,000원을 적어 볼게요. 여기를 눌러요', 1)
    expect(button('내역 적기')).toHaveFocus()
  })
})

describe('SPEC-008 연습 장부는 폰에 남지 않는다', () => {
  it('AC-4 연습 동안 적고 지운 것이 localStorage(dongari:v2·dongari:keep·dongari:guide)에 쓰이지 않고 보관·상태 신호 요청도 가지 않는다', async () => {
    const { send } = fakeSaver(['shared'])
    const { server } = phone({ saver: { make: vi.fn(async () => new Blob(['png'])), download: vi.fn(), send } })
    const before = { ...localStorage }
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    await startPracticeFromQuestion()
    await reachYear()
    await click('사진 보내기')
    await screen.findByRole('heading', { level: 1, name: '잘 보냈어요!' })

    expect(setItem).not.toHaveBeenCalled()
    expect({ ...localStorage }).toEqual(before)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(server.put).not.toHaveBeenCalled()
    expect(server.sendStatus).not.toHaveBeenCalled()
  })

  it('AC-5 첫 실행 연습 중 앱을 닫았다 다시 열면 첫 실행 물음이 다시 뜨고 연습 기록은 없다', async () => {
    const { unmount } = phone()
    await startPracticeFromQuestion()
    await click('내역 적기')
    await click('오늘 16일')
    await click(/^회비/)
    await click('1만 원 더하기')
    await click('저장')
    unmount()

    phone()

    expect(screen.getByRole('heading', { level: 1, name: '처음이세요?' })).toBeInTheDocument()
    expect(new LocalStorageRepository().load().data.books).toEqual([])
  })

  it('AC-6 연습 장부 화면에는 7일 보관 안내·30일 기록 파일 안내·[설정] 점 표시가 없다', async () => {
    // 진짜 장부는 한 달 넘게 기록 파일을 안 보냈다: 띠와 [설정] 점이 있다
    const stale: StoredData = {
      ...realPhone(),
      settings: { lastBackupAt: '2026-08-01T00:00:00.000Z', lastChangedAt: '2026-08-15T00:00:00.000Z', recoveryCode: PHONE_CODE },
    }
    openWith(stale)
    expect(screen.getByTestId('notice-bar')).toBeInTheDocument()
    expect(screen.getByTestId('icon-button-dot')).toBeInTheDocument()

    await click(/^설정/)
    await click(/연습해 보기/)
    await screen.findByTestId('ledger-screen')

    expect(screen.queryByTestId('notice-bar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('icon-button-dot')).not.toBeInTheDocument()
  })
})

describe('SPEC-008 연습 띠', () => {
  it('AC-7 장부·내역 적기·월 정리·고치기·결산 화면 맨 위에 띠가 있고, 말풍선이 떠 있어도 [그만하기] 는 잠기지 않는다', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()
    const expectBandOpen = () => {
      expect(band()).toBeInTheDocument()
      expect(isLocked(button('그만하기'))).toBe(false)
    }
    expectBandOpen()

    await click('내역 적기')
    await screen.findByTestId('coach-mark')
    expectBandOpen()
    await click('오늘 16일')
    await click(/^회비/)
    await click('1만 원 더하기')
    await click('저장')
    await click('방금 16일')
    await click(/^간식비/)
    await userEvent.type(screen.getByRole('textbox', { name: '얼마인가요?' }), '5000')
    await click('저장')
    await click('다 적었어요')
    await screen.findByTestId('ledger-screen')

    await click('10월 정리 보기')
    expectBandOpen()
    await screen.findByText('다 봤으면 여기를 눌러 장부로 돌아가요', {}, { timeout: 3000 })
    await click(/장부로/)
    await click(/^간식비/)
    expect(screen.getByTestId('edit-entry-form')).toBeInTheDocument()
    expectBandOpen()
    await click('이 내역 지우기')
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))
    await screen.findByTestId('ledger-screen')
    await click('결산')
    expect(screen.getByTestId('year-summary-screen')).toBeInTheDocument()
    expectBandOpen()
  })

  it('AC-8 [그만하기] 를 누르면 "연습을 그만할까요? 적은 연습 내역은 사라져요" 를 묻고, [계속하기] 면 그 자리 그대로 말풍선이 다시 보인다', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()

    await click('그만하기')
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAccessibleName('연습을 그만할까요?')
    expect(dialog).toHaveAccessibleDescription('적은 연습 내역은 사라져요')
    expect(coach()).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: '계속하기' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    expectCoachOn(button('내역 적기'), '회비 10,000원을 적어 볼게요. 여기를 눌러요', 1)
  })

  it('AC-8 첫 실행에서 연 연습을 [그만하기] 하면 새 장부 만들기로 가고, 거기서 뒤로 버튼은 물음으로', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()
    await click('내역 적기')

    await click('그만하기')
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '그만하기' }))

    expect(await screen.findByRole('heading', { level: 1, name: '새 장부 만들기' })).toBeInTheDocument()
    expect(band()).not.toBeInTheDocument()
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    await pressBack()
    expect(await screen.findByRole('heading', { level: 1, name: '처음이세요?' })).toBeInTheDocument()
  })

  it('AC-8 설정에서 연 연습을 [그만하기] 하면 진짜 장부로 간다', async () => {
    openWith(realPhone())
    await click(/^설정/)
    await click(/연습해 보기/)
    await screen.findByTestId('coach-mark')

    await click('그만하기')
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '그만하기' }))

    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    expect(screen.getByTestId('book-button')).toHaveTextContent('한랑드림 2026년')
    expect(band()).not.toBeInTheDocument()
  })

  it('AC-9 연습 중 안드로이드 뒤로 버튼은 [그만하기] 와 같은 확인 창을 띄운다 (장부·내역 적기 어디서든)', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()

    await pressBack()
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('연습을 그만할까요?')
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '계속하기' }))

    await click('내역 적기')
    await click('오늘 16일')
    await pressBack()
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('연습을 그만할까요?')
    expect(screen.getByTestId('add-entry-form')).toBeInTheDocument()
  })
})

describe('SPEC-008 단계 말풍선', () => {
  it('AC-10 연습 말풍선에는 [알겠어요]·[✕] 가 없고 "연습 N / 4" 가 있으며, 가리키는 곳을 누르면 다음 말풍선으로 넘어간다', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()

    expect(screen.queryByRole('button', { name: '알겠어요' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '안내 닫기' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('coach-mark')).getByText('연습 1 / 4')).toBeInTheDocument()

    await click('내역 적기')

    expectCoachOn(await screen.findByRole('button', { name: '오늘 16일' }), '오늘 날짜를 눌러요', 1)
  })

  it('AC-11 말풍선이 떠 있는 동안 가리키는 곳·같이 열어 둔 날 칸·띠 [그만하기] 밖은 inert 다', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()
    expect(isLocked(button('결산'))).toBe(true)
    expect(isLocked(button(/^설정/))).toBe(true)
    expect(isLocked(button('내역 적기'))).toBe(false)

    await click('내역 적기')
    await screen.findByTestId('coach-mark')

    expect(isLocked(button('오늘 16일'))).toBe(false)
    expect(isLocked(screen.getByRole('textbox', { name: '며칠인가요?' }))).toBe(false)
    expect(isLocked(button(/장부로/))).toBe(true)
    expect(isLocked(button('그만하기'))).toBe(false)
  })

  it('AC-12 ① 오늘 날짜 → 회비 → 10,000원 저장 → 간식비 → 5,000원 저장 → [다 적었어요] 순서로 말풍선이 옮겨 가고, 장부로 오면 잔액 5,000원이다', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()

    await click('내역 적기')
    expectCoachOn(await screen.findByRole('button', { name: '오늘 16일' }), '오늘 날짜를 눌러요', 1)
    await click('오늘 16일')
    expectCoachOn(button(/^회비/), '회비를 눌러요', 1)
    await click(/^회비/)
    expectCoachOn(button('1만 원 더하기'), '+1만을 눌러 10,000원을 만들어요', 1)
    await click('1만 원 더하기')
    expectCoachOn(button('저장'), '10,000원이 됐으면 [저장]을 눌러요', 1)
    await click('저장')
    expectCoachOn(await screen.findByRole('button', { name: '방금 16일' }), '간식비 5,000원도 적어 볼까요? 날짜를 눌러요', 1)
    await click('방금 16일')
    expectCoachOn(button(/^간식비/), '간식비를 눌러요', 1)
    await click(/^간식비/)
    const amount = screen.getByRole('textbox', { name: '얼마인가요?' })
    expectCoachOn(amount, '5,000원을 적고 [저장]을 눌러요', 1)
    await userEvent.type(amount, '5000')
    expectCoachOn(button('저장'), '5,000원을 적고 [저장]을 눌러요', 1)
    await click('저장')
    expect(screen.getByText('장부에 넣었어요 · 2건')).toBeInTheDocument()
    expectCoachOn(button('다 적었어요'), '잘했어요! 다 적었으면 여기를 눌러 장부로 가요', 1)
    await click('다 적었어요')

    await screen.findByTestId('ledger-screen')
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('5,000원')
    expect(screen.getByText('2건을 저장했어요')).toBeInTheDocument()
    expectCoachOn(button('10월 정리 보기'), '이번 달에 얼마 쓰고 남았는지 여기서 봐요', 2)
  })

  it('AC-13 금액 질문에서 10000 을 치면 말풍선이 [저장] 으로 옮겨 가고, 10,000원이 아니면 [+1만]·금액 칸에 머문다', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()
    await click('내역 적기')
    await click('오늘 16일')
    await click(/^회비/)
    const amount = screen.getByRole('textbox', { name: '얼마인가요?' })

    await userEvent.type(amount, '10000')
    expectCoachOn(button('저장'), '10,000원이 됐으면 [저장]을 눌러요', 1)

    await click('1만 원 더하기')
    expectCoachOn(button('1만 원 더하기'), '+1만을 눌러 10,000원을 만들어요', 1)
    expect(isLocked(amount)).toBe(false)
  })

  it('AC-14 ② [10월 정리 보기] 를 누르면 월 정리가 열리고, 1초쯤 뒤 말풍선이 [‹ 장부로] 를 가리킨다', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()
    await writeTwoLines()
    vi.useFakeTimers({ shouldAdvanceTime: true })

    await click('10월 정리 보기')
    expect(screen.getByRole('heading', { level: 1, name: '2026년 10월 정리' })).toBeInTheDocument()
    expect(coach()).not.toBeInTheDocument()
    expect(screen.getByTestId('practice-reading')).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(1000))

    expectCoachOn(button(/장부로/), '다 봤으면 여기를 눌러 장부로 돌아가요', 2)
    expect(screen.queryByTestId('practice-reading')).not.toBeInTheDocument()
  })

  it('AC-15 ③ 간식비 줄 → [이 내역 지우기] → [지우기] 로 "지웠어요" 와 잔액 10,000원. 확인 창 동안 말풍선은 없고 [취소] 하면 다시 뜬다', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()
    await writeTwoLines()
    await lookAtMonth()

    expectCoachOn(button(/^간식비/), '잘못 적었으면 줄을 눌러 고칠 수 있어요. 간식비 줄을 눌러 봐요', 3)
    await click(/^간식비/)
    expectCoachOn(button('이 내역 지우기'), '여기서 고치거나 지울 수 있어요. 연습이니 지워 봐요', 3)
    await click('이 내역 지우기')
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('이 내역을 정말 지울까요?')
    expect(coach()).not.toBeInTheDocument()

    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '아니요' }))
    expectCoachOn(button('이 내역 지우기'), '여기서 고치거나 지울 수 있어요. 연습이니 지워 봐요', 3)

    await click('이 내역 지우기')
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))
    await screen.findByTestId('ledger-screen')
    expect(screen.getByText('지웠어요')).toBeInTheDocument()
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('10,000원')
  })

  it('AC-16 ④ [결산] 을 누르면 결산 화면에 "…[사진 보내기]를 눌러 카톡 \'나와의 채팅\'에 보내 보세요" 말풍선이 [사진 보내기] 를 가리킨다', async () => {
    openWith(undefined)
    await startPracticeFromQuestion()
    await writeTwoLines()
    await lookAtMonth()
    await deleteExpense()

    expectCoachOn(button('결산'), '한 해가 끝나면 여기서 결산을 봐요. 눌러 봐요', 4)
    await click('결산')

    expectCoachOn(button('사진 보내기'), SEND_MESSAGE, 4)
  })
})

describe('SPEC-008 연습 결산 사진', () => {
  it('AC-17 연습 결산 화면과 그 사진 맨 위에 "연습 · 진짜 결산이 아니에요" 띠가 있다', async () => {
    const { saver, make } = fakeSaver(['shared'])
    openWith(undefined, saver)
    await startPracticeFromQuestion()
    await reachYear()

    expect(screen.getByTestId('year-share-summary').firstElementChild).toHaveTextContent(RIBBON)
    await click('사진 보내기')

    expect(make.mock.calls.at(-1)?.[0].textContent?.startsWith(RIBBON)).toBe(true)
  })

  it('AC-18 공유가 끝나면 바로 끝 화면 "잘 보냈어요!" 가 뜬다', async () => {
    const { saver, send } = fakeSaver(['shared'])
    openWith(undefined, saver)
    await startPracticeFromQuestion()
    await reachYear()

    await click('사진 보내기')

    expect(await screen.findByRole('heading', { level: 1, name: '잘 보냈어요!' })).toBeInTheDocument()
    expect(send).toHaveBeenCalledOnce()
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map((row) => row.dataset.done)).toEqual(['true', 'true', 'true', 'true'])
  })

  it('AC-19 공유 창을 그냥 닫으면 말풍선이 "아직 안 보냈어요…" 로 바뀌고 [다음에 할게요] 가 생기며, 누르면 "연습 끝!"', async () => {
    const { saver } = fakeSaver(['cancelled'])
    openWith(undefined, saver)
    await startPracticeFromQuestion()
    await reachYear()

    await click('사진 보내기')

    expectCoachOn(button('사진 보내기'), '아직 안 보냈어요. 다시 눌러 보거나, 나중에 해도 돼요', 4)
    await click('다음에 할게요')
    expect(await screen.findByRole('heading', { level: 1, name: '연습 끝!' })).toBeInTheDocument()
  })

  it('AC-20 공유를 못 쓰는 기기는 [사진으로 저장] 을 가리키는 말풍선과 [다음에 할게요] 가 뜨고, 사진을 저장하면 "연습 끝!"', async () => {
    const { saver } = fakeSaver()
    openWith(undefined, saver)
    await startPracticeFromQuestion()
    await reachYear()

    expect(screen.queryByRole('button', { name: '사진 보내기' })).not.toBeInTheDocument()
    expectCoachOn(button('사진으로 저장'), '이 기기에서는 바로 보낼 수 없어요. 사진으로 저장해 두었다가 보내요', 4)
    expect(button('다음에 할게요')).toBeInTheDocument()

    await click('사진으로 저장')

    expect(await screen.findByRole('heading', { level: 1, name: '연습 끝!' })).toBeInTheDocument()
  })

  it('AC-21 공유가 NotAllowedError 로 거부되면 말풍선이 [한 번 더 눌러 보내기] 를 가리킨 채 "사진이 준비됐어요. 한 번 더 눌러 주세요"', async () => {
    const { saver } = fakeSaver(['notAllowed', 'shared'])
    openWith(undefined, saver)
    await startPracticeFromQuestion()
    await reachYear()

    await click('사진 보내기')

    expectCoachOn(button('한 번 더 눌러 보내기'), '사진이 준비됐어요. 한 번 더 눌러 주세요', 4)
    await click('한 번 더 눌러 보내기')
    expect(await screen.findByRole('heading', { level: 1, name: '잘 보냈어요!' })).toBeInTheDocument()
  })
})

describe('SPEC-008 끝 화면', () => {
  it('AC-22 첫 실행 연습의 끝 화면에 배운 것 네 줄(보내지 않았으면 넷째 줄 빈 동그라미)·다시 하는 길·[새 장부 만들기] 가 있고 연습 띠는 없다', async () => {
    const { saver } = fakeSaver(['cancelled'])
    openWith(undefined, saver)
    await startPracticeFromQuestion()
    await reachYear()
    await click('사진 보내기')
    await click('다음에 할게요')

    await screen.findByTestId('practice-end')
    expect(screen.getByText('이제 진짜 장부를 만들어요. 연습으로 적은 내역은 지웠어요.')).toBeInTheDocument()
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map((row) => [row.textContent, row.dataset.done])).toEqual([
      ['[+ 내역 적기]로 한 줄씩 적기', 'true'],
      ['[10월 정리 보기]로 한 달 보기', 'true'],
      ['줄을 눌러 고치고 지우기', 'true'],
      ['결산 사진 보내기 (아직 안 해 봤어요)', 'false'],
    ])
    expect(rows[3].querySelector('[data-icon="circle"]')).toBeInTheDocument()
    expect(screen.getByText('다시 해 보고 싶으면 설정 → 연습해 보기')).toBeInTheDocument()
    expect(button('새 장부 만들기')).toBeInTheDocument()
    expect(band()).not.toBeInTheDocument()
  })

  it('AC-23 끝 화면 [새 장부 만들기] 로 만든 진짜 장부는 기록 0건, 잔액은 입력한 이월금이다', async () => {
    const { saver } = fakeSaver(['shared'])
    openWith(undefined, saver)
    await startPracticeFromQuestion()
    await reachYear()
    await click('사진 보내기')
    await screen.findByTestId('practice-end')

    await click('새 장부 만들기')
    await click('동아리·모임')
    await userEvent.type(screen.getByLabelText('장부 이름'), '한랑드림')
    await userEvent.type(screen.getByLabelText('작년 이월금'), '30000')
    await click('만들기')

    await screen.findByTestId('ledger-screen')
    expect(screen.getByTestId('book-button')).toHaveTextContent('한랑드림 2026년')
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('30,000원')
    expect(screen.getByText(/10월에 적은 내역이 없어요/)).toBeInTheDocument()
    expect(band()).not.toBeInTheDocument()
    expect(coach()).not.toBeInTheDocument()
  })

  it('끝 화면에서 뒤로 버튼은 주 버튼과 같다 (첫 실행이면 새 장부 만들기)', async () => {
    const { saver } = fakeSaver(['shared'])
    openWith(undefined, saver)
    await startPracticeFromQuestion()
    await reachYear()
    await click('사진 보내기')
    await screen.findByTestId('practice-end')
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))

    await pressBack()

    expect(await screen.findByRole('heading', { level: 1, name: '새 장부 만들기' })).toBeInTheDocument()
    await pressBack()
    expect(await screen.findByRole('heading', { level: 1, name: '처음이세요?' })).toBeInTheDocument()
  })
})

describe('SPEC-008 설정 [연습해 보기]', () => {
  it('AC-25 설정 [연습해 보기] 는 물음 없이 연습(연습 1 / 4)을 열고, "연습 끝!"·"장부로 돌아가요" [장부로] 로 진짜 장부에 돌아온다. 진짜 장부·자동으로 지키기는 그대로다', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(realPhone()))
    localStorage.setItem(GUIDE_KEY, JSON.stringify(ACTIVE_GUIDE))
    const { send } = fakeSaver(['shared'])
    const { server } = phone({ saver: { make: vi.fn(async () => new Blob(['png'])), download: vi.fn(), send } })
    const before = { ...localStorage }
    await click(/^설정/)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    await click(/연습해 보기/)
    await screen.findByTestId('ledger-screen')
    expect(screen.queryByTestId('first-run-question')).not.toBeInTheDocument()
    expect(screen.getByTestId('book-button')).toHaveTextContent('연습 장부 2026년')
    expectCoachOn(button('내역 적기'), '회비 10,000원을 적어 볼게요. 여기를 눌러요', 1)
    await reachYear()
    await click('사진 보내기')

    expect(await screen.findByRole('heading', { level: 1, name: '연습 끝!' })).toBeInTheDocument()
    expect(screen.getByText('장부로 돌아가요')).toBeInTheDocument()
    expect(screen.queryByText('다시 해 보고 싶으면 설정 → 연습해 보기')).not.toBeInTheDocument()
    await click('장부로')

    await screen.findByTestId('ledger-screen')
    expect(screen.getByTestId('book-button')).toHaveTextContent('한랑드림 2026년')
    expect(screen.getAllByTestId('list-row').map((row) => row.querySelector('.ui-row__title')?.textContent)).toEqual(['지출1', '지출2'])
    expect(setItem).not.toHaveBeenCalled()
    expect({ ...localStorage }).toEqual(before)
    expect(server.put).not.toHaveBeenCalled()
  })

  it('AC-26 개인 가계부 장부에서 연 연습은 가계부 연습 장부이고 예시가 용돈 10,000원·장보기 5,000원이다', async () => {
    const { saver } = fakeSaver(['shared'])
    openWith(realPhone('household'), saver)
    await click(/^설정/)
    await click(/연습해 보기/)
    await screen.findByTestId('ledger-screen')

    expectCoachOn(button('내역 적기'), '용돈 10,000원을 적어 볼게요. 여기를 눌러요', 1)
    await writeTwoLines(HOUSEHOLD)
    await lookAtMonth()
    expectCoachOn(button(/^장보기/), '잘못 적었으면 줄을 눌러 고칠 수 있어요. 장보기 줄을 눌러 봐요', 3)
    await deleteExpense(HOUSEHOLD)
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('10,000원')
  })

  it('AC-27 설정에서 연 연습 중 앱을 닫았다 열면 물음 없이 진짜 장부가 열린다', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(realPhone()))
    const { unmount } = phone({ withKeep: false })
    await click(/^설정/)
    await click(/연습해 보기/)
    await click('내역 적기')
    unmount()

    phone({ withKeep: false })

    expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
    expect(screen.getByTestId('book-button')).toHaveTextContent('한랑드림 2026년')
    expect(band()).not.toBeInTheDocument()
  })
})
