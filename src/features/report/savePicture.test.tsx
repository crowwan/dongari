import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import html2canvas from 'html2canvas'
import { ledger } from '../../test/ledgerFixtures'
import { MonthSummaryScreen } from './MonthSummaryScreen'
import type { ShareResult } from '../backup/sendFile'
import { downloadPicture, isIos, makePicture, type PictureSaver } from './savePicture'

vi.mock('html2canvas', () => ({ default: vi.fn() }))

const SAVED = '사진을 저장했어요. 갤러리의 Download 앨범에서 볼 수 있어요'
const FAILED = '사진을 만들지 못했어요. 다시 눌러 주세요'
const PHOTOS_SAVED = '사진 앱에 저장했어요'
const FILES_SAVED = '사진을 저장했어요. 파일 앱의 다운로드 폴더에서 볼 수 있어요'
const PHOTOS_NOTE = "누른 다음 '이미지 저장'을 고르면 사진 앱에 들어가요"
const READY_NOTE = '사진이 준비됐어요. 한 번 더 눌러 주세요'

const SEPTEMBER = ledger([[9, 'income', '회비', 140_000]], { year: 2026 })

// 끝나는 때를 테스트가 정하는 사진 만들기
function controlledSaver() {
  let finish: (picture: Blob) => void = () => {}
  let fail: (error: Error) => void = () => {}
  const saver: PictureSaver = {
    make: vi.fn(
      () =>
        new Promise<Blob>((resolve, reject) => {
          finish = resolve
          fail = reject
        }),
    ),
    download: vi.fn(),
  }
  return { saver, finish: (picture: Blob) => finish(picture), fail: (error: Error) => fail(error) }
}

function renderMonth(saver: PictureSaver) {
  const onNotify = vi.fn()
  render(<MonthSummaryScreen ledger={SEPTEMBER} month={9} onBack={() => {}} onNotify={onNotify} saver={saver} />)
  return onNotify
}

describe('SPEC-003 사진으로 저장', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('만드는 동안 버튼이 "만드는 중…" 으로 바뀌고 누를 수 없으며, 끝나면 내려받고 저장 알림을 띄운 뒤 원래대로 돌아온다', async () => {
    const { saver, finish } = controlledSaver()
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: '사진으로 저장' }))

    expect(screen.getByRole('button', { name: '만드는 중…' })).toBeDisabled()
    expect(saver.download).not.toHaveBeenCalled()
    expect(onNotify).not.toHaveBeenCalled()

    const picture = new Blob(['png'])
    await act(async () => finish(picture))

    expect(saver.download).toHaveBeenCalledWith(picture, '동아리회계-2026년-9월-정리.png')
    expect(onNotify).toHaveBeenCalledWith(SAVED)
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toBeEnabled()
  })

  it('만드는 중에 여러 번 눌러도 사진은 한 번만 만든다', async () => {
    const { saver, finish } = controlledSaver()
    renderMonth(saver)
    const button = screen.getByRole('button', { name: '사진으로 저장' })

    // 화면이 다시 그려지기 전 같은 순간에 두 번 눌린 경우까지
    act(() => {
      button.click()
      button.click()
    })
    await userEvent.click(button)

    expect(saver.make).toHaveBeenCalledTimes(1)
    await act(async () => finish(new Blob(['png'])))
    expect(saver.download).toHaveBeenCalledTimes(1)
  })

  it('사진을 만들지 못하면 내려받지 않고 "다시 눌러 주세요" 알림을 띄우며 다시 누를 수 있다', async () => {
    const { saver, fail } = controlledSaver()
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: '사진으로 저장' }))
    await act(async () => fail(new Error('canvas')))

    expect(saver.download).not.toHaveBeenCalled()
    expect(onNotify).toHaveBeenCalledWith(FAILED)
    expect(onNotify).not.toHaveBeenCalledWith(SAVED)
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toBeEnabled()
  })

  it('내려받기에서 오류가 나도 실패 알림을 띄운다', async () => {
    const saver: PictureSaver = {
      make: vi.fn(async () => new Blob(['png'])),
      download: vi.fn(() => {
        throw new Error('download')
      }),
    }
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: '사진으로 저장' }))

    expect(onNotify).toHaveBeenCalledWith(FAILED)
  })
})

// 아이폰처럼 공유 시트가 있는 가짜. 공유 결과를 차례로 돌려준다
function iosSaver(...results: ShareResult[]) {
  const picture = new Blob(['png'], { type: 'image/png' })
  const saver = {
    make: vi.fn(async () => picture),
    download: vi.fn(),
    share: vi.fn<(picture: File) => Promise<ShareResult>>(async () => results.shift() ?? 'shared'),
  } satisfies PictureSaver
  return { saver, picture }
}

describe('SPEC-003 사진으로 저장 — 아이폰(공유 시트로 사진 앱에)', () => {
  it('버튼 위에 "이미지 저장" 을 고르라는 안내가 있다', () => {
    renderMonth(iosSaver().saver)

    expect(screen.getByTestId('bottom-action-bar-note')).toHaveTextContent(PHOTOS_NOTE)
  })

  it('만든 사진을 PNG 파일로 공유 시트에 넘기고, 고르면 내려받지 않고 "사진 앱에 저장했어요" 알림', async () => {
    const { saver } = iosSaver('shared')
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: '사진으로 저장' }))

    expect(saver.share).toHaveBeenCalledOnce()
    const file = saver.share.mock.calls[0][0]
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('동아리회계-2026년-9월-정리.png')
    expect(file.type).toBe('image/png')
    expect(saver.download).not.toHaveBeenCalled()
    expect(onNotify).toHaveBeenCalledWith(PHOTOS_SAVED)
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toBeEnabled()
  })

  it('공유 시트를 그냥 닫으면 알림도 내려받기도 없이 원래대로 돌아온다', async () => {
    const { saver } = iosSaver('cancelled')
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: '사진으로 저장' }))

    expect(saver.download).not.toHaveBeenCalled()
    expect(onNotify).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toBeEnabled()
  })

  it('공유 시트를 못 쓰면 지금처럼 내려받고 "파일 앱의 다운로드 폴더" 알림', async () => {
    const { saver, picture } = iosSaver('unavailable')
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: '사진으로 저장' }))

    expect(saver.download).toHaveBeenCalledWith(picture, '동아리회계-2026년-9월-정리.png')
    expect(onNotify).toHaveBeenCalledWith(FILES_SAVED)
  })

  it('만드는 사이 누른 순간이 지나 거부되면 "사진 앱에 저장" 버튼으로 바뀌고, 누르면 다시 만들지 않고 그 자리에서 공유 시트를 연다', async () => {
    const { saver } = iosSaver('notAllowed', 'shared')
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: '사진으로 저장' }))

    expect(saver.download).not.toHaveBeenCalled()
    expect(onNotify).not.toHaveBeenCalled()
    expect(screen.getByTestId('bottom-action-bar-note')).toHaveTextContent(READY_NOTE)
    const again = screen.getByRole('button', { name: '사진 앱에 저장' })

    // 누른 순간 안에서(기다리는 것 없이) 공유 시트를 불러야 아이폰이 연다
    act(() => again.click())
    expect(saver.share).toHaveBeenCalledTimes(2)
    await act(async () => {})

    expect(saver.make).toHaveBeenCalledOnce()
    expect(saver.share.mock.calls[1][0].name).toBe('동아리회계-2026년-9월-정리.png')
    expect(onNotify).toHaveBeenCalledWith(PHOTOS_SAVED)
    expect(screen.getByRole('button', { name: '사진으로 저장' })).toBeEnabled()
  })

  it('한 번 더 눌렀는데도 거부되면 내려받기로 대신한다', async () => {
    const { saver } = iosSaver('notAllowed', 'notAllowed')
    const onNotify = renderMonth(saver)

    await userEvent.click(screen.getByRole('button', { name: '사진으로 저장' }))
    await userEvent.click(screen.getByRole('button', { name: '사진 앱에 저장' }))

    expect(saver.download).toHaveBeenCalledOnce()
    expect(onNotify).toHaveBeenCalledWith(FILES_SAVED)
  })
})

describe('SPEC-003 아이폰·아이패드 구분', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const IPAD = 'Mozilla/5.0 (iPad; CPU OS 12_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1'
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
  const GALAXY = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'

  it.each([
    ['아이폰은 iOS 다', IPHONE, 5, true],
    ['예전 아이패드는 iOS 다', IPAD, 5, true],
    ['맥 UA 를 쓰는 아이패드(iPadOS, 터치 있음)는 iOS 다', MAC, 5, true],
    ['맥(터치 없음)은 iOS 가 아니다', MAC, 0, false],
    ['갤럭시는 iOS 가 아니다', GALAXY, 5, false],
  ])('%s', (_label, userAgent, maxTouchPoints, expected) => {
    expect(isIos({ userAgent, maxTouchPoints })).toBe(expected)
  })

  it('navigator 가 없으면 아이폰이 아니다', () => {
    expect(isIos(undefined)).toBe(false)
  })
})

describe('SPEC-003 사진 파일 만들기', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('정리 영역을 흰 바탕·2배 크기로 그리고, 복사본은 라이트 테마·사진 모드로 바꿔 그린 뒤 PNG 로 돌려준다', async () => {
    const element = document.createElement('div')
    const picture = new Blob(['png'], { type: 'image/png' })
    const canvas = document.createElement('canvas')
    const toBlob = vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(picture))
    vi.mocked(html2canvas).mockImplementation(async (_element, options) => {
      // html2canvas 가 복사한 문서에서 부르는 onclone 을 흉내
      const clone = document.createElement('div')
      await options?.onclone?.(document, clone)
      expect(clone).toHaveAttribute('data-theme', 'light')
      expect(clone).toHaveAttribute('data-capturing')
      return canvas
    })

    await expect(makePicture(element)).resolves.toBe(picture)

    expect(html2canvas).toHaveBeenCalledWith(element, expect.objectContaining({ scale: 2, backgroundColor: '#ffffff' }))
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
  })

  it('PNG 를 만들지 못하면(toBlob 이 null) 실패한다', async () => {
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(null))
    vi.mocked(html2canvas).mockResolvedValue(canvas)

    await expect(makePicture(document.createElement('div'))).rejects.toThrow()
  })

  it('사진을 Blob 주소로 만든 다운로드 링크를 눌러 파일 이름 그대로 내려받고, 잠시 뒤 주소를 해제한다', () => {
    vi.useFakeTimers()
    const picture = new Blob(['png'], { type: 'image/png' })
    const created = vi.fn((blob: Blob) => (blob === picture ? 'blob:picture' : 'blob:other'))
    const revoked = vi.fn()
    URL.createObjectURL = created
    URL.revokeObjectURL = revoked
    const clicked: { href: string; download: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download })
    })

    downloadPicture(picture, '동아리회계-2026년-결산.png')

    expect(clicked).toEqual([{ href: 'blob:picture', download: '동아리회계-2026년-결산.png' }])
    // 링크는 문서에 남기지 않는다
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revoked).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoked).toHaveBeenCalledWith('blob:picture')
  })
})
