import type { BrowserKind } from './installRules'
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

// 방법 안내 (SPEC-002 홈 화면 추가): 지금 브라우저의 순서만, 모르는 브라우저면 삼성 인터넷과 크롬 둘 다
export function InstallGuide({ browser }: { browser: BrowserKind }) {
  const guides = browser === 'other' ? [GUIDES.samsung, GUIDES.chrome] : [GUIDES[browser]]
  return (
    <div className="install-guide" data-testid="install-guide" data-browser={browser}>
      {guides.map((guide) => (
        <div key={guide.name}>
          <p className="install-guide__browser-name">{guide.name}</p>
          <ol className="install-guide__steps">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
