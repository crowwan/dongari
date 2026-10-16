// [사진으로 저장]·[사진 보내기] 의 단계 (SPEC-003): 정리 영역 → PNG 사진 만들기, 사진 → 폰에 넣기(내려받기, 아이폰은 공유 시트)
// 또는 폰 공유 창으로 보내기(v2.6). 화면은 PictureSaver 로 받아서 쓰고, 테스트는 가짜를 넣는다
import { shareFile, type ShareApi, type ShareResult } from '../backup/sendFile'

export type PictureSaver = {
  make: (element: HTMLElement) => Promise<Blob>
  download: (picture: Blob, fileName: string) => void
  // 아이폰·아이패드만: 공유 시트를 열어 "이미지 저장" 으로 사진 앱에 넣는다 (내려받으면 파일 앱으로 간다). 없으면 내려받기만
  share?: (picture: File) => Promise<ShareResult>
  // 공유 창에 사진을 넘길 수 있는 폰만(갤럭시·아이폰): [사진 보내기]. 없으면 [사진 보내기] 를 숨긴다
  send?: (picture: File) => Promise<ShareResult>
}

// 사진 저장·보내기가 보는 navigator 기능만 (테스트는 가짜를 넣는다)
export type PictureNavigator = ShareApi & Pick<Navigator, 'userAgent' | 'maxTouchPoints'>

// 사진은 화면 테마와 상관없이 흰 바탕 (단톡방에서 읽기 쉽게)
const PICTURE_BACKGROUND = '#ffffff'
// 폰 화면 폭(약 360px)을 두 배로 그려 갤러리에서 확대해도 글자가 또렷하게
const PICTURE_SCALE = 2
// 내려받기가 시작되기 전에 주소를 해제하면 일부 브라우저에서 내려받기가 끊긴다 (FileSaver.js 와 같은 40초)
const REVOKE_DELAY_MS = 40_000

// 사진으로 그리는 복사본에 다는 표시. CSS 가 이 표시를 보고 사진용 모양(라이트 테마, 줄이지 않은 크기 등)으로 바꾼다
export const CAPTURING_ATTRIBUTE = 'data-capturing'

// 정리 영역을 html2canvas 로 그려 PNG 로 만든다. 원래 화면은 건드리지 않고 html2canvas 가 만든 복사본만 사진용으로 바꾼다
export async function makePicture(element: HTMLElement): Promise<Blob> {
  // 사진을 저장할 때만 필요한 큰 라이브러리라 그때 불러온다
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(element, {
    scale: PICTURE_SCALE,
    backgroundColor: PICTURE_BACKGROUND,
    logging: false,
    onclone: (_document, clone) => {
      // 다크 모드에서 저장해도 흰 바탕·검정 글자 (tokens.css 의 data-theme 고정 규칙)
      clone.setAttribute('data-theme', 'light')
      clone.setAttribute(CAPTURING_ATTRIBUTE, '')
    },
  })
  return new Promise((resolve, reject) => {
    canvas.toBlob((picture) => {
      if (picture) resolve(picture)
      else reject(new Error('PNG 를 만들지 못했다'))
    }, 'image/png')
  })
}

// 사진을 Blob 주소로 만든 다운로드 링크를 눌러 내려받는다. 갤럭시에서는 갤러리의 "Download" 앨범에 들어간다
export function downloadPicture(picture: Blob, fileName: string): void {
  const url = URL.createObjectURL(picture)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  // 문서에 붙어 있어야 눌리는 브라우저가 있어 잠깐 붙였다 뗀다
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

// 아이폰·아이패드인지. iPadOS 사파리는 맥과 같은 UA 를 쓰므로 터치가 되는지로 가른다 (맥은 터치가 없다)
export function isIos(navigator: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined): boolean {
  if (!navigator) return false
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true
  return navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1
}

// 공유 창에 PNG 사진을 넘길 수 있는지. PC 브라우저 등 canShare 가 거짓이면 [사진 보내기] 를 숨긴다 (SPEC-003 AC-15)
export function canSendPictures(api: ShareApi | undefined): boolean {
  if (!api?.share || !api.canShare) return false
  try {
    return api.canShare({ files: [new File([], 'picture.png', { type: 'image/png' })] })
  } catch {
    return false
  }
}

export function createPictureSaver(navigator: PictureNavigator | undefined): PictureSaver {
  return {
    make: makePicture,
    download: downloadPicture,
    share: isIos(navigator) ? (picture) => shareFile(picture, navigator) : undefined,
    send: canSendPictures(navigator) ? (picture) => shareFile(picture, navigator) : undefined,
  }
}

export const pictureSaver: PictureSaver = createPictureSaver(globalThis.navigator)

export function monthPictureName(year: number, month: number): string {
  return `우리장부-${year}년-${month}월-정리.png`
}

export function yearPictureName(year: number): string {
  return `우리장부-${year}년-결산.png`
}

// 단톡방용 요약 (v2.6)
export function yearSummaryPictureName(year: number): string {
  return `우리장부-${year}년-결산-요약.png`
}
