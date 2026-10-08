import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadFile, sendFile, shareFile, type ShareApi } from './sendFile'

function backupFile(): File {
  return new File(['{"schemaVersion": 2}'], '우리장부-백업-2026-10-06.txt', { type: 'text/plain' })
}

describe('SPEC-002 백업 파일 보내기 (공유·다운로드)', () => {
  it('AC-6 파일 공유를 지원하면 공유 화면을 열고 shared 를 돌려준다', async () => {
    const file = backupFile()
    const share = vi.fn(() => Promise.resolve())
    const canShare = vi.fn(() => true)
    const download = vi.fn()

    await expect(sendFile(file, { canShare, share }, download)).resolves.toBe('shared')

    expect(canShare).toHaveBeenCalledWith({ files: [file] })
    expect(share).toHaveBeenCalledWith({ files: [file], title: '우리장부-백업-2026-10-06.txt' })
    expect(download).not.toHaveBeenCalled()
  })

  it.each<[string, ShareApi | undefined]>([
    ['파일을 공유할 수 없다고 하면', { canShare: () => false, share: () => Promise.resolve() }],
    ['canShare 가 없으면', { share: () => Promise.resolve() }],
    ['share 가 없으면', { canShare: () => true }],
    ['navigator 가 없으면', undefined],
  ])('%s 파일을 내려받고 downloaded 를 돌려준다', async (_label, api) => {
    const file = backupFile()
    const download = vi.fn()

    await expect(sendFile(file, api, download)).resolves.toBe('downloaded')

    expect(download).toHaveBeenCalledWith(file)
  })

  it('공유 화면을 닫으면(AbortError) 조용히 cancelled 를 돌려주고 내려받지 않는다', async () => {
    const download = vi.fn()
    const api: ShareApi = {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('취소', 'AbortError')),
    }

    await expect(sendFile(backupFile(), api, download)).resolves.toBe('cancelled')

    expect(download).not.toHaveBeenCalled()
  })

  it('공유가 다른 이유로 실패하면 대신 내려받는다', async () => {
    const download = vi.fn()
    const api: ShareApi = {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('거부', 'NotAllowedError')),
    }

    await expect(sendFile(backupFile(), api, download)).resolves.toBe('downloaded')

    expect(download).toHaveBeenCalledOnce()
  })
})

describe('SPEC-002·003 파일 공유 화면 열기 (shareFile)', () => {
  it('공유 화면에서 고르면 shared, 닫으면 cancelled 를 돌려준다', async () => {
    const file = backupFile()
    await expect(shareFile(file, { canShare: () => true, share: () => Promise.resolve() })).resolves.toBe('shared')
    await expect(
      shareFile(file, { canShare: () => true, share: () => Promise.reject(new DOMException('취소', 'AbortError')) }),
    ).resolves.toBe('cancelled')
  })

  it('누른 순간이 지나 브라우저가 거부하면(NotAllowedError) notAllowed 를 돌려준다', async () => {
    const api: ShareApi = {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('거부', 'NotAllowedError')),
    }

    await expect(shareFile(backupFile(), api)).resolves.toBe('notAllowed')
  })

  it.each<[string, ShareApi | undefined]>([
    ['파일을 공유할 수 없다고 하면', { canShare: () => false, share: () => Promise.resolve() }],
    ['navigator 가 없으면', undefined],
    ['공유가 다른 이유로 실패하면', { canShare: () => true, share: () => Promise.reject(new Error('공유 실패')) }],
  ])('%s unavailable 을 돌려준다', async (_label, api) => {
    await expect(shareFile(backupFile(), api)).resolves.toBe('unavailable')
  })
})

describe('SPEC-002 파일 내려받기 (<a download>)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('파일 주소를 만든 링크를 눌러 파일 이름 그대로 내려받고, 나중에 주소를 풀어 준다', () => {
    vi.useFakeTimers()
    const file = backupFile()
    const clicked: { href: string; download: string; attached: boolean }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download, attached: document.body.contains(this) })
    })
    const urls = { createObjectURL: vi.fn(() => 'blob:backup'), revokeObjectURL: vi.fn() }

    downloadFile(file, urls)

    expect(urls.createObjectURL).toHaveBeenCalledWith(file)
    expect(clicked).toEqual([{ href: 'blob:backup', download: '우리장부-백업-2026-10-06.txt', attached: true }])
    expect(document.querySelector('a[download]')).toBeNull()
    expect(urls.revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:backup')
  })
})
