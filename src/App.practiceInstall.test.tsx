import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredData } from './domain/types'
import { HOME_PREVIEW_CAPTION, HOME_PREVIEW_LABEL } from './features/install/HomeScreenPreview'
import { inAppKind, type InAppBrowser } from './features/install/inAppBrowser'
import { INSTALL_OFFER_KEY, localInstallOfferStore, type InstallOfferStore } from './features/install/installOffer'
import type { InstallEnvironment } from './features/install/installPrompt'
import { AppRoot } from './features/practice/AppRoot'
import { localPracticeMarkStore, PRACTICE_MARK_KEY, type PracticeMarkStore } from './features/practice/practiceMark'
import { createBackup } from './storage/backup'
import { LocalStorageRepository } from './storage/LocalStorageRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { fakeBrowser, KAKAO_UA, memoryOfferStore } from './test/installFakes'
import { button, click, fakeSaver, pressBack, PRACTICE_TODAY, reachYear, settleHistory, startPracticeFromQuestion } from './test/practiceFlow'

const ASK_TITLE = '홈 화면에 추가하시겠어요?'
const ASK_LEAD = '연습으로 적은 내역은 지웠어요. 진짜 장부를 만들기 전에 하나만 물어볼게요.'
const V26_LEAD = '이제 진짜 장부를 만들어요. 연습으로 적은 내역은 지웠어요.'
const GUIDE_SHEET = '홈 화면에 추가하는 방법'

type OpenOptions = {
  install?: InstallEnvironment
  offer?: InstallOfferStore
  mark?: PracticeMarkStore
  data?: StoredData
  inApp?: InAppBrowser
}

// 첫 실행 폰을 연다. 결산 사진은 보내기까지 끝나는 기기
function open({ install = fakeBrowser().install, offer = memoryOfferStore(), mark = localPracticeMarkStore(), data, inApp }: OpenOptions = {}) {
  const repository = new MemoryRepository(data)
  let seq = 0
  return render(
    <AppRoot
      repository={repository}
      loaded={repository.load()}
      install={install}
      installOfferStore={offer}
      practiceMarkStore={mark}
      inApp={inApp}
      saver={fakeSaver(['shared']).saver}
      options={{ now: () => PRACTICE_TODAY, createId: () => `id-${++seq}` }}
    />,
  )
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name })
const guideSheet = () => screen.queryByRole('dialog', { name: GUIDE_SHEET })
const offerCard = () => screen.queryByTestId('install-offer')

// 첫 실행 물음 → 연습 ①~④ → 결산 사진 보내기 → 끝 화면 "잘 보냈어요!"
async function finishPractice() {
  await startPracticeFromQuestion()
  await reachYear()
  await click('사진 보내기')
  await heading('잘 보냈어요!')
  await settleHistory()
}

// 끝 화면 [다음] → ② 묻는 화면
async function reachAsk() {
  await finishPractice()
  await click('다음')
  await heading(ASK_TITLE)
}

async function createBook() {
  await click('동아리·모임')
  await userEvent.type(screen.getByLabelText('장부 이름'), '한랑드림')
  await click('만들기')
  await screen.findByTestId('ledger-screen')
}

// 그림 안내 창의 장을 끝까지 넘겨 [다 했어요]
async function finishGuide() {
  const sheet = screen.getByRole('dialog', { name: GUIDE_SHEET })
  for (let page = 1; page < 4; page++) await userEvent.click(within(sheet).getByRole('button', { name: '다음' }))
  await userEvent.click(within(sheet).getByRole('button', { name: '다 했어요' }))
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SPEC-009 B 연습 끝 화면', () => {
  it('AC-12 브라우저(홈 화면 앱·카톡 안 아님, 설치 전)에서 첫 실행 연습이 끝 화면에 오면 "…하나만 물어볼게요." 와 주 버튼 [다음] 이다', async () => {
    open()
    await finishPractice()

    expect(screen.getByText(ASK_LEAD)).toBeInTheDocument()
    expect(button('다음')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새 장부 만들기' })).not.toBeInTheDocument()
    expect(screen.getByText('다시 해 보고 싶으면 설정 → 연습해 보기')).toBeInTheDocument()
  })

  it('AC-13 홈 화면 앱으로 열었으면 끝 화면이 v2.6 그대로다', async () => {
    open({ install: fakeBrowser({ standalone: true }).install })
    await finishPractice()

    expect(screen.getByText(V26_LEAD)).toBeInTheDocument()
    expect(button('새 장부 만들기')).toBeInTheDocument()
  })

  it('AC-13 카톡 안 브라우저면 끝 화면이 v2.6 그대로다', async () => {
    // 진입점처럼 user agent 를 SPEC-009 C 판단(inAppKind)으로 한 번 본다. [그냥 여기서 쓸게요] 를 고른 카톡 안
    const kind = inAppKind(KAKAO_UA)
    if (!kind) throw new Error('카톡 안 user agent 가 아니다')
    const inApp: InAppBrowser = { kind, store: { stays: () => true, stay: () => {} } }
    open({ install: fakeBrowser({ userAgent: KAKAO_UA }).install, inApp })
    await finishPractice()

    expect(screen.getByText(V26_LEAD)).toBeInTheDocument()
    expect(button('새 장부 만들기')).toBeInTheDocument()
  })

  it('AC-13 끝 화면 전에 이미 설치를 마쳤으면(appinstalled) 묻지 않는다', async () => {
    const { install, events } = fakeBrowser()
    open({ install })
    act(() => {
      events.dispatchEvent(new Event('appinstalled'))
    })
    await finishPractice()

    expect(screen.getByText(V26_LEAD)).toBeInTheDocument()
  })

  it('AC-13 연습 중 [그만하기] 로 끝내면 묻는 화면 없이 새 장부 만들기로 가고, 첫 장부 뒤 권하기 카드는 v2.6 처럼 뜬다', async () => {
    const offer = memoryOfferStore()
    open({ offer })
    await startPracticeFromQuestion()
    await click('그만하기')
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '그만하기' }))

    await heading('새 장부 만들기')
    await createBook()
    expect(offerCard()).toBeInTheDocument()
    expect(localStorage.getItem(PRACTICE_MARK_KEY)).toBeNull()
  })

  it('끝 화면에서 뒤로 버튼은 [다음] 과 같다 (묻는 화면으로)', async () => {
    open()
    await finishPractice()

    await pressBack()

    expect(await heading(ASK_TITLE)).toBeInTheDocument()
  })
})

describe('SPEC-009 B 홈 화면에 추가하시겠어요?', () => {
  it('AC-14 [다음] 을 누르면 홈 화면 모습 그림·좋은 점 두 줄·[추가할게요]·[다음에 할게요] 가 있고, 뒤로 버튼은 끝 화면으로 간다', async () => {
    open()
    await reachAsk()

    expect(screen.getByRole('img', { name: HOME_PREVIEW_LABEL })).toBeInTheDocument()
    expect(screen.getByText(HOME_PREVIEW_CAPTION)).toBeInTheDocument()
    const benefits = screen.getByRole('region', { name: '추가하면 좋은 점' })
    expect(within(benefits).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      '카톡에서 링크를 찾지 않아도 아이콘을 눌러 바로 열려요',
      '기록이 더 안전하게 지켜져요',
    ])
    expect(button('추가할게요')).toBeInTheDocument()
    expect(button('다음에 할게요')).toBeInTheDocument()
    expect(screen.queryByTestId('practice-band')).not.toBeInTheDocument()

    await pressBack()
    expect(await heading('잘 보냈어요!')).toBeInTheDocument()
    expect(screen.getByText(ASK_LEAD)).toBeInTheDocument()
  })

  it('AC-15 [다음에 할게요] 를 누르면 첫 실행 새 장부 만들기가 열리고, 장부를 만든 뒤 권하기 카드가 뜨지 않는다', async () => {
    const offer = memoryOfferStore()
    open({ offer })
    await reachAsk()

    await click('다음에 할게요')

    await heading('새 장부 만들기')
    expect(offer.saved).toBe('done')
    await createBook()
    expect(offerCard()).not.toBeInTheDocument()
    expect(offer.saved).toBe('done')
  })

  it('[다음에 할게요] 뒤 새 장부 만들기에서 뒤로 버튼은 첫 실행 물음으로 간다', async () => {
    open()
    await reachAsk()
    await click('다음에 할게요')
    await heading('새 장부 만들기')
    await settleHistory()

    await pressBack()

    expect(await heading('처음이세요?')).toBeInTheDocument()
  })
})

describe('SPEC-009 B 설치 따라 하기', () => {
  it('AC-16 설치 제안이 있으면 [추가할게요] 가 브라우저 설치 창을 열고, 수락하면 "홈 화면에 추가했어요" 화면이 된다', async () => {
    const { install, prompt } = fakeBrowser({ prompt: 'accepted' })
    const offer = memoryOfferStore()
    open({ install, offer })
    await reachAsk()

    await click('추가할게요')

    expect(prompt).toHaveBeenCalledOnce()
    expect(await heading('홈 화면에 추가했어요')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: HOME_PREVIEW_LABEL })).toBeInTheDocument()
    expect(
      screen.getByText("다음부터는 홈 화면의 '우리 장부' 아이콘으로 열어요. 카톡에서 링크를 찾지 않아도 돼요."),
    ).toBeInTheDocument()
    expect(button('새 장부 만들기')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 따라 하기' })).not.toBeInTheDocument()
    expect(offer.saved).toBe('done')
  })

  it('AC-17 설치 창을 취소하면 묻는 화면에 그대로 남고, 다시 [추가할게요] 를 누르면 그림 안내 창이 뜬다', async () => {
    const { install, prompt } = fakeBrowser({ prompt: 'dismissed' })
    open({ install })
    await reachAsk()

    await click('추가할게요')
    await settleHistory()

    expect(prompt).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { level: 1, name: ASK_TITLE })).toBeInTheDocument()
    expect(guideSheet()).not.toBeInTheDocument()

    await click('추가할게요')
    expect(within(screen.getByRole('dialog', { name: GUIDE_SHEET })).getByTestId('slide-guide-text')).toHaveTextContent('1 / 4')
  })

  it('AC-18 설치 제안이 없으면 [추가할게요] 가 그림 안내 창을 열고, appinstalled 가 오면 창이 닫히며 "홈 화면에 추가했어요" 가 된다', async () => {
    const { install, events } = fakeBrowser()
    open({ install })
    await reachAsk()

    await click('추가할게요')
    expect(within(screen.getByRole('dialog', { name: GUIDE_SHEET })).getByTestId('install-guide')).toHaveAttribute(
      'data-browser',
      'chrome',
    )
    act(() => {
      events.dispatchEvent(new Event('appinstalled'))
    })

    expect(await heading('홈 화면에 추가했어요')).toBeInTheDocument()
    expect(guideSheet()).not.toBeInTheDocument()
  })

  it('묻는 화면에서 그림 안내 없이 브라우저 메뉴로 바로 설치해도 "홈 화면에 추가했어요" 가 된다', async () => {
    const { install, events } = fakeBrowser()
    open({ install })
    await reachAsk()

    act(() => {
      events.dispatchEvent(new Event('appinstalled'))
    })

    expect(await heading('홈 화면에 추가했어요')).toBeInTheDocument()
  })

  it('그림 안내 창을 뒤로 버튼으로 닫으면 창만 닫히고 묻는 화면에 그대로 남는다', async () => {
    open()
    await reachAsk()
    await click('추가할게요')
    expect(guideSheet()).toBeInTheDocument()

    await pressBack()

    expect(guideSheet()).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: ASK_TITLE })).toBeInTheDocument()
  })

  it('AC-19 [다 했어요] 로 닫았는데 설치 신호가 없으면 "홈 화면에 생겼나요?" + [새 장부 만들기]·[다시 따라 하기] 이고, [다시 따라 하기] 는 1장부터 연다', async () => {
    const offer = memoryOfferStore()
    open({ offer })
    await reachAsk()
    await click('추가할게요')

    await finishGuide()

    expect(await heading('홈 화면에 생겼나요?')).toBeInTheDocument()
    expect(screen.getByText("생겼으면 다음부터는 홈 화면의 '우리 장부' 아이콘으로 열어요.")).toBeInTheDocument()
    expect(screen.getByRole('img', { name: HOME_PREVIEW_LABEL })).toBeInTheDocument()
    expect(button('새 장부 만들기')).toBeInTheDocument()
    expect(offer.saved).toBe('done')
    await settleHistory()

    await click('다시 따라 하기')

    const sheet = screen.getByRole('dialog', { name: GUIDE_SHEET })
    expect(within(sheet).getByTestId('slide-guide-text')).toHaveTextContent('1 / 4')
    expect(within(sheet).getByRole('button', { name: '이전' })).toBeDisabled()
  })
})

describe('SPEC-009 B 설치 확인 화면에서 새 장부', () => {
  it('AC-20 [새 장부 만들기] 로 같은 화면에서 진짜 장부를 만들고, 만든 뒤 권하기 카드가 뜨지 않는다', async () => {
    const { install } = fakeBrowser({ prompt: 'accepted' })
    const offer = memoryOfferStore()
    open({ install, offer })
    await reachAsk()
    await click('추가할게요')
    await heading('홈 화면에 추가했어요')

    await click('새 장부 만들기')

    await heading('새 장부 만들기')
    await createBook()
    expect(screen.getByTestId('book-button')).toHaveTextContent('한랑드림 2026년')
    expect(offerCard()).not.toBeInTheDocument()
    expect(offer.saved).toBe('done')
  })

  it('AC-20 설치 확인 화면에서 뒤로 버튼은 [새 장부 만들기] 와 같고, 거기서 뒤로 버튼은 물음으로 간다', async () => {
    const { install } = fakeBrowser({ prompt: 'accepted' })
    open({ install })
    await reachAsk()
    await click('추가할게요')
    await heading('홈 화면에 추가했어요')
    await settleHistory()

    await pressBack()
    expect(await heading('새 장부 만들기')).toBeInTheDocument()

    await pressBack()
    expect(await heading('처음이세요?')).toBeInTheDocument()
  })
})

describe('SPEC-009 B 연습을 마쳤다는 표시', () => {
  it('AC-21 첫 실행 연습이 끝 화면에 닿은 뒤 장부 없이 다시 열면 물음 없이 새 장부 만들기가 열리고, 뒤로 버튼은 물음으로 간다', async () => {
    const view = open()
    await finishPractice()
    expect(JSON.parse(localStorage.getItem(PRACTICE_MARK_KEY) ?? '')).toEqual({ v: 1, done: true })
    view.unmount()
    window.history.replaceState(null, '')

    open()

    expect(await heading('새 장부 만들기')).toBeInTheDocument()
    expect(screen.queryByText('처음이세요?')).not.toBeInTheDocument()
    await settleHistory()
    await pressBack()
    expect(await heading('처음이세요?')).toBeInTheDocument()
  })

  it('AC-21 묻는 화면에서 대답 없이 앱을 닫았다 열면 새 장부 만들기이고, 권하기 상태는 적지 않아 첫 장부 뒤 카드가 v2.6 처럼 뜬다', async () => {
    const offer = memoryOfferStore()
    const view = open({ offer })
    await reachAsk()
    view.unmount()
    window.history.replaceState(null, '')
    expect(offer.saved).toBeUndefined()

    open({ offer })
    await heading('새 장부 만들기')
    await createBook()

    expect(offerCard()).toBeInTheDocument()
  })

  it('AC-22 표시 값이 깨졌으면 물음부터 시작한다', async () => {
    localStorage.setItem(PRACTICE_MARK_KEY, '{"v":1')

    open()

    expect(await heading('처음이세요?')).toBeInTheDocument()
  })

  it('AC-22 연습 표시·권하기 상태는 장부 데이터(기록 파일·보관본의 원본)에 들어가지 않는다', async () => {
    const storage = new LocalStorageRepository()
    render(
      <AppRoot
        repository={storage}
        loaded={storage.load()}
        install={fakeBrowser().install}
        installOfferStore={localInstallOfferStore()}
        practiceMarkStore={localPracticeMarkStore()}
        saver={fakeSaver(['shared']).saver}
        options={{ now: () => PRACTICE_TODAY }}
      />,
    )
    await reachAsk()
    await click('다음에 할게요')
    await heading('새 장부 만들기')
    await createBook()

    expect(localStorage.getItem(PRACTICE_MARK_KEY)).not.toBeNull()
    expect(localStorage.getItem(INSTALL_OFFER_KEY)).not.toBeNull()
    const backupText = createBackup(storage.load().data, PRACTICE_TODAY).text
    expect(backupText).not.toContain(PRACTICE_MARK_KEY)
    expect(backupText).not.toContain(INSTALL_OFFER_KEY)
    expect(backupText).not.toMatch(/"done"/)
  })
})
