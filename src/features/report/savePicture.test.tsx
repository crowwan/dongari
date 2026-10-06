import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import html2canvas from 'html2canvas'
import { ledger } from '../../test/ledgerFixtures'
import { MonthSummaryScreen } from './MonthSummaryScreen'
import { downloadPicture, makePicture, type PictureSaver } from './savePicture'

vi.mock('html2canvas', () => ({ default: vi.fn() }))

const SAVED = '사진을 저장했어요. 갤러리의 Download 앨범에서 볼 수 있어요'
const FAILED = '사진을 만들지 못했어요. 다시 눌러 주세요'

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
