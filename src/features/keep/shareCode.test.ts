import { describe, expect, it, vi } from 'vitest'
import { recoveryCodeMessage, shareRecoveryCode } from './shareCode'

const CODE = 'HK7M-29QF-MX4P-8R2D'

describe('SPEC-006 복구 코드 [보내기]', () => {
  it('AC-6 공유 화면으로 "우리 장부 복구 코드: …" 글을 보낸다', async () => {
    const share = vi.fn(async () => {})
    const writeText = vi.fn(async () => {})

    await expect(shareRecoveryCode(CODE, { share, clipboard: { writeText } })).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: '우리 장부 복구 코드: HK7M-29QF-MX4P-8R2D' })
    expect(recoveryCodeMessage(CODE)).toBe('우리 장부 복구 코드: HK7M-29QF-MX4P-8R2D')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('AC-6 공유가 안 되면 복사한다', async () => {
    const writeText = vi.fn(async () => {})
    await expect(shareRecoveryCode(CODE, { clipboard: { writeText } })).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('우리 장부 복구 코드: HK7M-29QF-MX4P-8R2D')

    const refused = vi.fn(async () => {
      throw new DOMException('막힘', 'NotAllowedError')
    })
    await expect(shareRecoveryCode(CODE, { share: refused, clipboard: { writeText } })).resolves.toBe('copied')
  })

  it('공유 화면을 그냥 닫으면 복사하지 않고 끝낸다', async () => {
    const writeText = vi.fn(async () => {})
    const cancelled = vi.fn(async () => {
      throw new DOMException('닫음', 'AbortError')
    })
    await expect(shareRecoveryCode(CODE, { share: cancelled, clipboard: { writeText } })).resolves.toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('복사도 안 되면 실패', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('막힘')
    })
    await expect(shareRecoveryCode(CODE, { clipboard: { writeText } })).resolves.toBe('failed')
    await expect(shareRecoveryCode(CODE, {})).resolves.toBe('failed')
  })
})
