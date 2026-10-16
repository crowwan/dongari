// 그림으로 따라 하는 설치 안내 (SPEC-009 A)의 문구와 순서 — 고칠 곳은 이 파일 하나다.
//
// 브라우저 메뉴 문구는 갤럭시 실기기에서 아직 보지 못한 예상값이다 (확인 필요 T-1 크롬, T-2 삼성 인터넷).
// 사용자 결정 2026-10-16: 실기기 확인(#141)은 배포 뒤에 한다. 결과가 다르면
//   1) 아래 INSTALL_GUIDE_WORDS 의 그림 속 진한 줄 글자와
//   2) INSTALL_GUIDE_STEPS 의 같은 장 글 줄([ ] 안 글자)을 같이 고친다 (테스트가 둘이 같은지 본다).
//   단계 수가 다르면 INSTALL_GUIDE_STEPS 의 장을 더하거나 빼고, 그림 종류(GuidePicture)를 InstallGuidePicture 에 맞춘다.
import { APP_SHORT_NAME } from '../../pwa/appName'
import type { SegmentOptions } from '../../ui/SegmentedControl'
import type { BrowserKind } from './installRules'

export type GuideBrowser = Exclude<BrowserKind, 'other'>

// 장마다 그리는 그림 (InstallGuidePicture 가 그린다)
export type GuidePicture =
  | 'chrome-menu-button'
  | 'chrome-menu'
  | 'chrome-confirm'
  | 'samsung-menu-button'
  | 'samsung-add-page'
  | 'samsung-confirm'
  | 'home-screen'

export type GuideStep = {
  picture: GuidePicture
  // 큰 글씨 한 줄. 화면 읽기도 이 글을 장 번호와 함께 읽는다. 버튼·메뉴 이름은 화면 글자 그대로 [ ] 로 감싼다
  text: string
}

// 그림 속 글자. 누를 줄만 진하게 그리고 나머지 줄은 흐리게 그린다 — 실제와 다르면 고칠 곳은 진한 줄뿐이다
export const INSTALL_GUIDE_WORDS = {
  chrome: {
    menuBefore: ['새 탭', '방문 기록', '북마크', '공유…'],
    // T-1: 크롬 버전·사이트에 따라 "홈 화면에 추가" 또는 "앱 설치" 로 보인다. 그림은 앞의 것, 글 줄은 둘 다
    addItem: '홈 화면에 추가',
    addItemAlt: '앱 설치',
    menuAfter: ['설정'],
    // T-1: 확인 창 제목과 버튼
    dialogTitle: '앱 설치',
    cancel: '취소',
    confirm: '설치',
  },
  samsung: {
    // ≡ 를 누르면 아래에서 올라오는 칸 목록
    gridBefore: ['북마크', '방문 기록', '다운로드'],
    // T-2: 칸 이름, 그 다음 목록의 고를 줄
    addItem: '현재 페이지 추가',
    subBefore: ['북마크', '빠른 실행'],
    subTarget: '홈 화면',
    // T-2: 마지막 확인 창 제목과 버튼
    dialogTitle: '홈 화면에 추가',
    cancel: '취소',
    confirm: '추가',
  },
} as const

const { chrome, samsung } = INSTALL_GUIDE_WORDS

// 마지막 장(설치 끝): 홈 화면 모습 그림. 그림 아래 줄 "누르면 바로 장부가 열려요" 는 그림 부품(HomeScreenPreview)이 그린다
const HOME_SCREEN_STEP: GuideStep = { picture: 'home-screen', text: `홈 화면에 '${APP_SHORT_NAME}' 가 생겨요` }

// 브라우저마다 네 장. 손으로만 넘긴다(자동 넘김 없음, SPEC-009 시안 결정)
export const INSTALL_GUIDE_STEPS: Record<GuideBrowser, readonly GuideStep[]> = {
  chrome: [
    { picture: 'chrome-menu-button', text: '화면 위 오른쪽 [⋮] 메뉴를 누르세요' },
    { picture: 'chrome-menu', text: `[${chrome.addItem}] 또는 [${chrome.addItemAlt}] 를 누르세요` },
    { picture: 'chrome-confirm', text: `[${chrome.confirm}] 를 누르세요` },
    HOME_SCREEN_STEP,
  ],
  samsung: [
    { picture: 'samsung-menu-button', text: '화면 아래 오른쪽 [≡] 메뉴를 누르세요' },
    { picture: 'samsung-add-page', text: `[${samsung.addItem}] 를 누르고 [${samsung.subTarget}] 을 고르세요` },
    { picture: 'samsung-confirm', text: `[${samsung.confirm}] 를 누르세요` },
    HOME_SCREEN_STEP,
  ],
}

// 모르는 브라우저일 때 먼저 고르는 칩. 갤럭시 기본 인터넷 앱의 앱 서랍 이름이 "인터넷" 이라 같이 적는다
export const GUIDE_BROWSER_CHOICES: SegmentOptions<GuideBrowser> = [
  { value: 'samsung', label: '인터넷(삼성)' },
  { value: 'chrome', label: '크롬' },
]

export const GUIDE_BROWSER_QUESTION = '지금 쓰는 앱을 골라 주세요'
