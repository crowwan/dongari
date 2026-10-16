import { useState } from 'react'
import { APP_SHORT_NAME } from '../../pwa/appName'
import { appIconUrl } from './appIcon'
import './homeScreenPreview.css'

export const HOME_PREVIEW_LABEL = `홈 화면에 '${APP_SHORT_NAME}' 아이콘이 생겨요`
export const HOME_PREVIEW_CAPTION = '누르면 바로 장부가 열려요'

// 두 줄 × 네 칸. 아랫줄 셋째 칸(7번째)이 우리 앱, 나머지 일곱은 흐린 도형
const SLOT_COUNT = 8
const OUR_SLOT = 6

type HomeScreenPreviewProps = {
  // 옆에 같은 뜻의 글 줄이 따로 있으면(설치 안내 마지막 장) 그림은 화면 읽기에서 숨긴다
  decorative?: boolean
}

// 홈 화면 모습 그림 (SPEC-009 A·B 공통): 추가하면 폰 홈 화면에 이런 아이콘이 이런 이름으로 생긴다.
// 폰마다 배치·아이콘 모양이 달라 다른 앱은 로고·글자 없는 흐린 도형으로만 그린다(실제 앱처럼 보이면 무엇을 누를지 헷갈린다)
export function HomeScreenPreview({ decorative = false }: HomeScreenPreviewProps) {
  const [iconFailed, setIconFailed] = useState(false)
  return (
    <div className="home-preview" data-testid="home-screen-preview">
      <div
        className="home-preview__screen"
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : HOME_PREVIEW_LABEL}
      >
        <div className="home-preview__grid" aria-hidden="true">
          {Array.from({ length: SLOT_COUNT }, (_, slot) =>
            slot === OUR_SLOT ? (
              <span key={slot} className="home-preview__app" data-app="ours">
                {iconFailed ? (
                  <span className="home-preview__icon" data-icon-fallback="" />
                ) : (
                  <img className="home-preview__icon" src={appIconUrl()} alt="" onError={() => setIconFailed(true)} />
                )}
                <span className="home-preview__name">{APP_SHORT_NAME}</span>
              </span>
            ) : (
              <span key={slot} className="home-preview__app" data-app="other">
                <span className="home-preview__icon" />
                <span className="home-preview__name-bar" />
              </span>
            ),
          )}
        </div>
      </div>
      <p className="home-preview__caption">{HOME_PREVIEW_CAPTION}</p>
    </div>
  )
}
