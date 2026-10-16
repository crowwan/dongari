import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { carryoverWords } from '../../domain/book'
import { ledger } from '../../test/ledgerFixtures'
import { MonthSummaryScreen } from './MonthSummaryScreen'
import { canSendPictures, createPictureSaver, type PictureNavigator, type PictureSaver } from './savePicture'

const GALAXY = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const SEND = '사진 보내기'
const SEND_AGAIN = '한 번 더 눌러 보내기'
const READY_NOTE = '사진이 준비됐어요. 한 번 더 눌러 주세요'
const SEND_SAVED = '사진을 저장했어요. 카톡에서 갤러리의 Download 앨범 사진을 골라 보내 주세요'
const FILES_SAVED = '사진을 저장했어요. 파일 앱의 다운로드 폴더에서 볼 수 있어요'

const SEPTEMBER = ledger([[9, 'income', '회비', 140_000]], { year: 2026 })

function domError(name: string): DOMException {
  return new DOMException(name, name)
}

type FakeNavigatorOptions = {
  // 공유 창 결과를 차례로: undefined 면 성공, 오류면 그 오류로 거부
  results?: (Error | undefined)[]
  hasShare?: boolean
  canShare?: boolean | 'throws'
  userAgent?: string
}

// 공유 창(Web Share) 흉내. share 가 받은 것을 기록한다
function fakeNavigator({ results = [], hasShare = true, canShare = true, userAgent = GALAXY }: FakeNavigatorOptions = {}) {
  const share = vi.fn<(data: ShareData) => Promise<void>>(async () => {
    const error = results.shift()
    if (error) throw error
  })
  const navigator: PictureNavigator = {
    userAgent,
    maxTouchPoints: 5,
    share: hasShare ? share : undefined,
    canShare: () => {
      if (canShare === 'throws') throw new TypeError('canShare')
      return canShare
    },
  }
  return { navigator, share }
}

// 진짜 공유 기능(createPictureSaver)에 가짜 navigator 를 넣고, 사진 만들기·내려받기만 가짜로
function saverWith(navigator: PictureNavigator) {
  const picture = new Blob(['png'], { type: 'image/png' })
  const saver = {
    ...createPictureSaver(navigator),
    make: vi.fn<(element: HTMLElement) => Promise<Blob>>(async () => picture),
    download: vi.fn(),
  } satisfies PictureSaver
  return { saver, picture }
}

function renderMonth(saver: PictureSaver) {
  const onNotify = vi.fn()
  render(<MonthSummaryScreen ledger={SEPTEMBER} month={9} carryoverWords={carryoverWords('club', true)} onBack={() => {}} onNotify={onNotify} saver={saver} />)
  return onNotify
}

function sharedFile(share: ReturnType<typeof fakeNavigator>['share'], call = 0): File | undefined {
  return share.mock.calls[call]?.[0].files?.[0]
}

describe('SPEC-003 사진 보내기 — 공유 창을 쓸 수 있는지 (v2.6)', () => {
  it('share 와 canShare 가 있고 PNG 파일을 넘길 수 있으면 보낼 수 있다', () => {
    expect(canSendPictures(fakeNavigator().navigator)).toBe(true)
  })

  it.each([
    ['share 가 없으면', { hasShare: false }],
    ['canShare 가 PNG 파일에 거짓이면', { canShare: false }],
    ['canShare 가 오류를 내면', { canShare: 'throws' as const }],
  ])('%s 보낼 수 없다', (_label, options) => {
    expect(canSendPictures(fakeNavigator(options).navigator)).toBe(false)
  })

  it('navigator 가 없으면 보낼 수 없다', () => {
    expect(canSendPictures(undefined)).toBe(false)
  })
})

describe('SPEC-003 사진 보내기 — 아래 고정 버튼 (v2.6, AC-13·14·15)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-13 공유 창을 쓸 수 있으면 아래에 보조 [사진으로 저장] 과 주 [사진 보내기] 가 함께 있다', () => {
    renderMonth(saverWith(fakeNavigator().navigator).saver)

    const save = screen.getByRole('button', { name: '사진으로 저장' })
    const send = screen.getByRole('button', { name: SEND })
    expect(save).toHaveAttribute('data-variant', 'secondary')
    expect(send).toHaveAttribute('data-variant', 'primary')
    expect(send.querySelector('[data-icon="share"]')).toBeInTheDocument()
  })

  it.each([
    ['share 가 없는 브라우저', { hasShare: false }],
    ['canShare 가 거짓인 브라우저(PC 등)', { canShare: false }],
  ])('AC-15 %s 에서는 [사진 보내기] 를 숨기고 [사진으로 저장] 만 주 버튼으로 보인다', (_label, options) => {
    renderMonth(saverWith(fakeNavigator(options).navigator).saver)

    expect(screen.queryByRole('button', { name: SEND })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toHaveAttribute('data-variant', 'primary')
  })

  it('AC-14 갤럭시에서도 [사진 보내기] 는 지금 화면 PNG 하나를 공유 창에 넘기고, 고르고 나면 알림·내려받기 없이 원래대로', async () => {
    const { navigator, share } = fakeNavigator()
    const { saver } = saverWith(navigator)
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: SEND }))

    expect(saver.make).toHaveBeenCalledWith(screen.getByTestId('month-summary-sheet'))
    expect(share).toHaveBeenCalledOnce()
    const file = sharedFile(share)
    expect(file?.name).toBe('우리장부-2026년-9월-정리.png')
    expect(file?.type).toBe('image/png')
    expect(share.mock.calls[0][0].files).toHaveLength(1)
    expect(saver.download).not.toHaveBeenCalled()
    expect(onNotify).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: SEND })).toBeEnabled()
  })

  it('AC-15 공유 창을 그냥 닫으면(AbortError) 알림도 내려받기도 없이 원래대로', async () => {
    const { navigator } = fakeNavigator({ results: [domError('AbortError')] })
    const { saver } = saverWith(navigator)
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: SEND }))

    expect(saver.download).not.toHaveBeenCalled()
    expect(onNotify).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: SEND })).toBeEnabled()
  })

  it('AC-15 만드는 사이 누른 순간이 지나 거부되면(NotAllowedError) [한 번 더 눌러 보내기] 로 바뀌고, 누르면 다시 만들지 않고 그 자리에서 공유 창을 연다', async () => {
    const { navigator, share } = fakeNavigator({ results: [domError('NotAllowedError')] })
    const { saver } = saverWith(navigator)
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: SEND }))

    expect(saver.download).not.toHaveBeenCalled()
    expect(onNotify).not.toHaveBeenCalled()
    expect(screen.getByTestId('bottom-action-bar-note')).toHaveTextContent(READY_NOTE)
    const again = screen.getByRole('button', { name: SEND_AGAIN })
    expect(again).toHaveAccessibleDescription(READY_NOTE)

    // 누른 순간 안에서(기다리는 것 없이) 공유 창을 불러야 열린다
    act(() => again.click())
    expect(share).toHaveBeenCalledTimes(2)
    await act(async () => {})

    expect(saver.make).toHaveBeenCalledOnce()
    expect(sharedFile(share, 1)?.name).toBe('우리장부-2026년-9월-정리.png')
    expect(onNotify).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: SEND })).toBeEnabled()
  })

  it('AC-15 한 번 더 눌렀는데도 거부되면 사진을 내려받고 갤러리에서 골라 보내라고 안내한다', async () => {
    const { navigator } = fakeNavigator({ results: [domError('NotAllowedError'), domError('NotAllowedError')] })
    const { saver, picture } = saverWith(navigator)
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: SEND }))
    await userEvent.click(screen.getByRole('button', { name: SEND_AGAIN }))

    expect(saver.download).toHaveBeenCalledWith(picture, '우리장부-2026년-9월-정리.png')
    expect(onNotify).toHaveBeenCalledWith(SEND_SAVED)
    expect(screen.getByRole('button', { name: SEND })).toBeEnabled()
  })

  it('AC-15 공유 창이 다른 이유로 실패하면 사진을 내려받고 갤러리에서 골라 보내라고 안내한다', async () => {
    const { navigator } = fakeNavigator({ results: [new TypeError('share')] })
    const { saver, picture } = saverWith(navigator)
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: SEND }))

    expect(saver.download).toHaveBeenCalledWith(picture, '우리장부-2026년-9월-정리.png')
    expect(onNotify).toHaveBeenCalledWith(SEND_SAVED)
  })

  it('아이폰에서 공유 창이 실패해 내려받으면 파일 앱 다운로드 폴더라고 안내한다', async () => {
    const { navigator } = fakeNavigator({ results: [new TypeError('share')], userAgent: IPHONE })
    const { saver } = saverWith(navigator)
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: SEND }))

    expect(onNotify).toHaveBeenCalledWith(FILES_SAVED)
  })

  it('사진을 만들지 못하면 공유 창을 열지 않고 "다시 눌러 주세요" 알림', async () => {
    const { navigator, share } = fakeNavigator()
    const { saver } = saverWith(navigator)
    saver.make.mockRejectedValueOnce(new Error('canvas'))
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: SEND }))

    expect(share).not.toHaveBeenCalled()
    expect(onNotify).toHaveBeenCalledWith('사진을 만들지 못했어요. 다시 눌러 주세요')
  })

  it('만드는 동안은 누른 버튼만 "만드는 중…" 이 되고 두 버튼 모두 누를 수 없다', async () => {
    const { navigator } = fakeNavigator()
    const { saver, picture } = saverWith(navigator)
    let finish: (value: Blob) => void = () => {}
    saver.make.mockImplementationOnce(() => new Promise<Blob>((resolve) => (finish = resolve)))
    renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: SEND }))

    expect(screen.getByRole('button', { name: '만드는 중…' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.getByRole('button', { name: '만드는 중…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toBeDisabled()

    await act(async () => finish(picture))
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toBeEnabled()
  })

  it('화면을 열면 사진을 미리 만들어 두고, [사진 보내기] 를 누르면 기다리지 않고 바로 공유 창을 연다', async () => {
    vi.useFakeTimers()
    const { navigator, share } = fakeNavigator()
    const { saver } = saverWith(navigator)
    renderMonth(saver)

    expect(saver.make).not.toHaveBeenCalled()
    await act(async () => vi.runAllTimersAsync())
    expect(saver.make).toHaveBeenCalledOnce()

    act(() => screen.getByRole('button', { name: SEND }).click())
    // 누른 그 순간에 공유 창을 부른다
    expect(share).toHaveBeenCalledOnce()
    await act(async () => {})
    expect(saver.make).toHaveBeenCalledOnce()
  })

  it('공유 창을 못 쓰는 기기에서는 사진을 미리 만들지 않는다', async () => {
    vi.useFakeTimers()
    const { saver } = saverWith(fakeNavigator({ canShare: false }).navigator)
    renderMonth(saver)

    await act(async () => vi.runAllTimersAsync())

    expect(saver.make).not.toHaveBeenCalled()
  })
})
