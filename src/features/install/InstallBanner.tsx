import { useId, useState } from 'react'
import { Button } from '../../ui/Button'
import {
  browserKind,
  readDismissedAt,
  saveDismissedAt,
  shouldShowInstallBanner,
  type BrowserKind,
  type DismissStorage,
} from './installRules'
import { browserInstallPrompt, useInstallPrompt, type InstallPromptStore } from './installPrompt'
import './install.css'

// 브라우저마다 홈 화면에 추가하는 메뉴 위치 (갤럭시 기준). 버튼 이름은 화면에 보이는 글자 그대로 [ ] 로 감싼다
const GUIDES: Record<Exclude<BrowserKind, 'other'>, { name: string; steps: string[] }> = {
  samsung: {
    name: '삼성 인터넷',
    steps: ['화면 아래 오른쪽 [≡] 메뉴를 누르세요', '[현재 페이지 추가] 를 누르세요', '[홈 화면] 을 고르세요'],
  },
  chrome: {
    name: '크롬',
    steps: ['화면 위 오른쪽 [⋮] 메뉴를 누르세요', '[홈 화면에 추가] 또는 [앱 설치] 를 누르세요', '[설치] 를 누르세요'],
  },
}

type InstallBannerViewProps = {
  // 브라우저가 바로 설치 창을 열 수 있으면 [방법 보기] 대신 [홈 화면에 추가]
  canInstall: boolean
  guideOpen: boolean
  browser: BrowserKind
  onToggleGuide: () => void
  onInstall: () => void
  onDismiss: () => void
}

// 모양만 그리는 부분 (카탈로그에서 상태별로 본다)
export function InstallBannerView({ canInstall, guideOpen, browser, onToggleGuide, onInstall, onDismiss }: InstallBannerViewProps) {
  const guides = browser === 'other' ? [GUIDES.samsung, GUIDES.chrome] : [GUIDES[browser]]
  const guideId = useId()

  return (
    <section className="install-banner" data-testid="install-banner" aria-label="홈 화면에 추가 안내">
      <p className="install-banner__message">홈 화면에 추가하면 기록이 더 안전해요</p>
      <div className="install-banner__actions">
        {canInstall ? (
          <Button variant="secondary" onClick={onInstall}>
            홈 화면에 추가
          </Button>
        ) : (
          <Button variant="secondary" onClick={onToggleGuide} aria-expanded={guideOpen} aria-controls={guideId}>
            {guideOpen ? '방법 접기' : '방법 보기'}
          </Button>
        )}
        <button type="button" className="install-banner__close" onClick={onDismiss}>
          닫기
        </button>
      </div>
      {guideOpen && !canInstall && (
        <div className="install-banner__guide" id={guideId} data-testid="install-guide" data-browser={browser}>
          {guides.map((guide) => (
            <div key={guide.name} className="install-banner__browser">
              <p className="install-banner__browser-name">{guide.name}</p>
              <ol className="install-banner__steps">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

type InstallBannerProps = {
  // 아래 값들은 테스트에서 바꿔 넣는다. 기본은 지금 브라우저 상태
  standalone?: boolean
  storage?: DismissStorage
  userAgent?: string
  now?: () => number
  installPrompt?: InstallPromptStore
}

// 장부 화면 위 설치 안내 띠 (SPEC-002 홈 화면 추가). 홈 화면 앱으로 열었거나, 닫은 지 30일이 안 됐으면 없다
export function InstallBanner({
  standalone = isStandalone(),
  storage = defaultStorage(),
  userAgent = globalThis.navigator?.userAgent ?? '',
  now = Date.now,
  installPrompt = browserInstallPrompt,
}: InstallBannerProps) {
  const [visible, setVisible] = useState(() =>
    shouldShowInstallBanner({ standalone, dismissedAt: readDismissedAt(storage), now: now() }),
  )
  const [guideOpen, setGuideOpen] = useState(false)
  const { canInstall, installed, install } = useInstallPrompt(installPrompt)

  if (!visible || installed) return null

  return (
    <InstallBannerView
      canInstall={canInstall}
      guideOpen={guideOpen}
      browser={browserKind(userAgent)}
      onToggleGuide={() => setGuideOpen((open) => !open)}
      onInstall={() => void install()}
      onDismiss={() => {
        saveDismissedAt(storage, now())
        setVisible(false)
      }}
    />
  )
}

function isStandalone(): boolean {
  return globalThis.matchMedia?.('(display-mode: standalone)').matches ?? false
}

// 저장소에 손대기만 해도 오류가 나는 환경이 있어 읽기·쓰기를 감싼다 (규칙 함수가 한 번 더 감싼다)
function defaultStorage(): DismissStorage {
  return {
    getItem: (key) => globalThis.localStorage?.getItem(key) ?? null,
    setItem: (key, value) => globalThis.localStorage?.setItem(key, value),
  }
}
