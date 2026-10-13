// 복구 코드 [보내기] (SPEC-006): 폰 공유 화면(카톡 나에게·가족)으로 글을 보내고, 안 되면 복사한다.
// 브라우저 기능은 인자로 받아 테스트에서 바꿔 끼운다

export interface CodeShareApi {
  share?: (data: ShareData) => Promise<void>
  clipboard?: Pick<Clipboard, 'writeText'>
}

// shared: 공유 완료 / copied: 공유가 안 돼 복사 / cancelled: 공유 화면을 그냥 닫음 / failed: 둘 다 안 됨
export type ShareCodeResult = 'shared' | 'copied' | 'cancelled' | 'failed'

export function recoveryCodeMessage(code: string): string {
  return `우리 장부 복구 코드: ${code}`
}

async function copy(text: string, api: CodeShareApi): Promise<ShareCodeResult> {
  try {
    if (!api.clipboard) return 'failed'
    await api.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

// 사용자가 누른 순간(클릭 처리 안)에 불러야 공유 화면이 열린다
export async function shareRecoveryCode(code: string, api: CodeShareApi = globalThis.navigator): Promise<ShareCodeResult> {
  const text = recoveryCodeMessage(code)
  if (!api.share) return copy(text, api)
  try {
    await api.share({ text })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    return copy(text, api)
  }
}
