// 카톡 안에서 열렸을 때 (SPEC-009 C)의 판단·주소·문구·"그냥 여기서 쓰기" 표시 — 고칠 곳은 이 파일 하나다.
//
// 갤럭시 실기기에서 아직 보지 못한 예상값이다. 사용자 결정 2026-10-16: 실기기 확인(#141 개발 확인 화면 /#/dev/env)은 배포 뒤에 한다.
//   T-4 카톡 안 user agent 글자 → KAKAO_UA_MARK
//   T-3 폰 기본 인터넷 앱으로 여는 주소 → KAKAO_OPEN_EXTERNAL (안 열리면 화면의 메뉴 그림이 대신한다)
//   T-5 카톡 안 브라우저 메뉴 위치·문구 → IN_APP_WORDS.menu (그림 속 진한 줄과 글 줄의 ' ' 안 글자가 같아야 한다, 테스트가 본다)
//   T-7·T-8 클립보드 쓰기·읽기 → copyRecoveryCode·readClipboardCode (안 되면 "적어 두세요"·빈 칸으로 넘어간다)
import { isRecord } from '../../storage/schema'
import { normalizeRecoveryCode } from '../keep/recoveryCode'

// 카톡 안 브라우저 user agent 에 들어 있는 글자 (T-4)
export const KAKAO_UA_MARK = 'KAKAOTALK'

// 카톡이 폰의 기본 인터넷 앱으로 주소를 여는 길 (T-3)
export const KAKAO_OPEN_EXTERNAL = 'kakaotalk://web/openExternal?url='

// 카톡에서 옮겨 왔다는 표시 (?from=kakao). 복구 코드는 주소에 넣지 않는다 — 방문 기록·카톡 서버에 남으면 안 되는 열쇠다
const FROM_PARAM = 'from'
const FROM_KAKAO = 'kakao'

export type InAppKind = 'kakao-android' | 'kakao-ios'

// 앱을 열 때 화면을 그리기 전에 한 번 본다. 카톡이 아니거나 안드로이드·아이폰이 아니면 지금처럼 (안전한 쪽)
export function inAppKind(userAgent: string): InAppKind | undefined {
  if (!userAgent.includes(KAKAO_UA_MARK)) return undefined
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'kakao-ios'
  if (/Android/.test(userAgent)) return 'kakao-android'
  return undefined
}

// [인터넷 앱으로 열기] 주소: 지금 주소(남은 from 은 지움, 장부를 옮기면 ?from=kakao)를 인코딩해 붙인다. 해시는 그대로
export function openExternalUrl(href: string, { fromKakao }: { fromKakao: boolean }): string {
  const url = new URL(href)
  url.searchParams.delete(FROM_PARAM)
  if (fromKakao) url.searchParams.set(FROM_PARAM, FROM_KAKAO)
  return `${KAKAO_OPEN_EXTERNAL}${encodeURIComponent(url.toString())}`
}

// 지금 주소에 ?from=kakao 를 붙인 주소. 장부 옮기기 화면이 떠 있는 동안 주소창을 이렇게 바꿔 두어
// 메뉴 '다른 브라우저로 열기' 로 열어도 열린 곳에 가져오기 카드가 뜨게 한다
export function withFromKakao(href: string): string {
  const url = new URL(href)
  url.searchParams.set(FROM_PARAM, FROM_KAKAO)
  return url.toString()
}

// 앱을 열 때 from 을 읽고 지운 주소 (새로고침·홈 화면에 추가로 카드가 다시 생기지 않게). from 이 없으면 cleanHref 없음
export function readFromKakao(href: string): { fromKakao: boolean; cleanHref: string | undefined } {
  const url = new URL(href)
  const from = url.searchParams.get(FROM_PARAM)
  if (from === null) return { fromKakao: false, cleanHref: undefined }
  url.searchParams.delete(FROM_PARAM)
  return { fromKakao: from === FROM_KAKAO, cleanHref: url.toString() }
}

// 화면 글자. 버튼·메뉴 이름은 화면 글자 그대로
export const IN_APP_WORDS = {
  title: '카톡 안에서 열렸어요',
  leadEmpty: '여기서 적으면 나중에 홈 화면 앱에서 안 보여요. 인터넷 앱에서 열어 주세요.',
  leadBooks: '여기에 쓰던 장부가 있어요. 인터넷 앱으로 옮겨서 쓰면 홈 화면에도 추가할 수 있어요.',
  open: '인터넷 앱으로 열기',
  copyAndOpen: '코드 복사하고 인터넷 앱으로 열기',
  copyOnly: '코드 복사하기',
  stay: '그냥 여기서 쓸게요',
  codeLabel: '복구 코드',
  keeping: '지켜 두는 중이에요',
  kept: '방금 자동으로 지켜 두었어요',
  keepFailed: '인터넷에 연결되면 지켜 두고 버튼이 눌려요',
  codeNote: '열린 곳에서 [카톡에서 쓰던 장부 가져오기]를 누르면 코드가 들어가 있어요. 코드를 적어 두면 더 안전해요.',
  copied: '복사했어요',
  copyFailed: '복사하지 못했어요. 코드를 적어 두세요',
  fileLead: '기록 파일을 먼저 보내 두고, 인터넷 앱에서 불러와요.',
  sendFile: '기록 파일 보내기',
  fileNote: '열린 곳에서 [바로 시작] → 위쪽 [기록 파일 불러오기]',
  // 설정 "앱" 묶음 줄 (카톡 안에서는 [홈 화면에 추가] 대신)
  settingsRow: '인터넷 앱으로 열기',
  settingsRowNote: '홈 화면에 추가하려면',
  // 인터넷 앱에서 열린 첫 화면 카드 (③)
  importTitle: '카톡에서 쓰던 장부가 있나요?',
  importText: '방금 복사한 복구 코드로 그대로 가져와요.',
  importButton: '카톡에서 쓰던 장부 가져오기',
  pasteHint: '길게 눌러 붙여 넣어 주세요',
  // 카톡 안 브라우저 메뉴 (T-5). hint 의 ' ' 안 글자 = 그림 속 진한 줄 item
  menu: {
    'kakao-android': {
      hint: "안 열리면 오른쪽 아래 ⋮ → '다른 브라우저로 열기'",
      before: ['새로고침', '링크 복사', '공유하기'],
      item: '다른 브라우저로 열기',
    },
    // 아이폰은 대상 기기가 아니라 실기기 확인 없이 둔다 (SPEC-009 "아이폰 카톡")
    'kakao-ios': {
      hint: "오른쪽 아래 ⋯ → 'Safari로 열기'",
      before: ['새로고침', '링크 복사', '공유하기'],
      item: 'Safari로 열기',
    },
  },
} as const

// "그냥 여기서 쓰기" 표시 dongari:in-app — 이 카톡 안 저장 공간에만. 장부 데이터·기록 파일·보관본과 따로
export const IN_APP_KEY = 'dongari:in-app'

export interface InAppStore {
  // 표시가 있으면 다시 묻지 않는다. 없거나 깨졌으면 false (다시 묻는다)
  stays: () => boolean
  stay: () => void
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export function localInAppStore(storage: KeyValueStorage = localStorage): InAppStore {
  return {
    stays: () => {
      try {
        const value: unknown = JSON.parse(storage.getItem(IN_APP_KEY) ?? 'null')
        return isRecord(value) && value.v === 1 && value.stay === true
      } catch {
        return false
      }
    },
    stay: () => {
      try {
        storage.setItem(IN_APP_KEY, JSON.stringify({ v: 1, stay: true }))
      } catch {
        // 적지 못해도 화면은 막지 않는다. 다음에 열 때 한 번 더 묻는다
      }
    },
  }
}

// 카톡 안 브라우저: 어떤 카톡인지 + 표시 저장소. 진입점이 user agent 로 정해 넘긴다 (테스트는 바꿔 넣는다)
export type InAppBrowser = { kind: InAppKind; store: InAppStore }

// 복구 코드만 클립보드에 쓴다 (누름 처리 안에서 불러야 한다, T-7). 썼는지
export async function copyRecoveryCode(
  code: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  try {
    if (!clipboard) return false
    await clipboard.writeText(code)
    return true
  } catch {
    return false
  }
}

// 클립보드 글이 복구 코드 모양(16자)이면 그 코드 (T-8). 읽지 못하거나 거절하면 조용히 undefined
export async function readClipboardCode(
  clipboard: Pick<Clipboard, 'readText'> | undefined = globalThis.navigator?.clipboard,
): Promise<string | undefined> {
  try {
    if (!clipboard) return undefined
    return normalizeRecoveryCode(await clipboard.readText())
  } catch {
    return undefined
  }
}
