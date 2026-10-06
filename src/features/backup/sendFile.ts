// 파일 보내기 (SPEC-002 백업): 폰 공유 화면(카톡 나에게 보내기, 드라이브 등)을 열고, 안 되면 내려받는다.
// 브라우저 기능은 인자로 받아 테스트에서 바꿔 끼운다

// navigator 에서 쓰는 공유 기능만
export interface ShareApi {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

// 파일 주소 만들기·풀기 (URL 의 정적 함수)
export interface ObjectUrls {
  createObjectURL: (file: File) => string
  revokeObjectURL: (url: string) => void
}

// shared: 공유 완료 / downloaded: 내려받기 시작 / cancelled: 사용자가 공유 화면을 닫음
export type SendResult = 'shared' | 'downloaded' | 'cancelled'

// 내려받기가 시작될 시간을 준 뒤 파일 주소를 푼다 (바로 풀면 일부 브라우저에서 내려받기가 취소된다)
const REVOKE_DELAY_MS = 10_000

export function downloadFile(file: File, urls: ObjectUrls = URL): void {
  const url = urls.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.hidden = true
  // 파이어폭스 등은 문서에 붙은 링크만 누를 수 있다
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => urls.revokeObjectURL(url), REVOKE_DELAY_MS)
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

// 사용자가 누른 순간(클릭 처리 안)에 불러야 공유 화면이 열린다. 공유가 거부되면 내려받기로 대신한다
export async function sendFile(
  file: File,
  api: ShareApi | undefined = globalThis.navigator,
  download: (file: File) => void = downloadFile,
): Promise<SendResult> {
  const data: ShareData = { files: [file] }
  if (api?.share && api.canShare?.(data)) {
    try {
      await api.share({ ...data, title: file.name })
      return 'shared'
    } catch (error) {
      if (isAbort(error)) return 'cancelled'
    }
  }
  download(file)
  return 'downloaded'
}
