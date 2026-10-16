import { APP_SHORT_NAME } from '../../pwa/appName'
import { BrowserBar, BrowserDialog, BrowserMenu, BrowserPage, BrowserPicture, type BrowserButton } from './BrowserPicture'
import { HomeScreenPreview } from './HomeScreenPreview'
import { INSTALL_GUIDE_WORDS, type GuidePicture } from './installGuideSteps'

const { chrome, samsung } = INSTALL_GUIDE_WORDS

// 크롬: 위 줄에 주소창과 ⋮ (그림 자리는 갤럭시 크롬 기준)
function chromeTopBar(menuHot: boolean): readonly (BrowserButton | 'address')[] {
  return [{ icon: 'home' }, 'address', { icon: 'kebab', hot: menuHot }]
}

// 삼성 인터넷: 위 줄은 주소창, 아래 도구 줄 오른쪽 끝에 ≡
const SAMSUNG_TOP_BAR: readonly (BrowserButton | 'address')[] = ['address', { icon: 'refresh' }]

function samsungBottomBar(menuHot: boolean): readonly BrowserButton[] {
  return [{ icon: 'left' }, { icon: 'right' }, { icon: 'home' }, { icon: 'star' }, { icon: 'menu', hot: menuHot }]
}

const dim = (labels: readonly string[]) => labels.map((label) => ({ label }))

// 설치 안내 장마다의 그림 (SPEC-009 A "그림 장"). 글자는 installGuideSteps 한 곳에서 온다
export function InstallGuidePicture({ picture }: { picture: GuidePicture }) {
  switch (picture) {
    case 'chrome-menu-button':
      return (
        <BrowserPicture name={picture}>
          <BrowserBar place="top" items={chromeTopBar(true)} />
          <BrowserPage title={APP_SHORT_NAME} />
        </BrowserPicture>
      )
    case 'chrome-menu':
      return (
        <BrowserPicture name={picture}>
          <BrowserBar place="top" items={chromeTopBar(false)} />
          <BrowserPage title={APP_SHORT_NAME} />
          <BrowserMenu
            place="top"
            items={[...dim(chrome.menuBefore), { label: chrome.addItem, hot: true }, ...dim(chrome.menuAfter)]}
          />
        </BrowserPicture>
      )
    case 'chrome-confirm':
      return (
        <BrowserPicture name={picture}>
          <BrowserBar place="top" items={chromeTopBar(false)} />
          <BrowserPage title={APP_SHORT_NAME} />
          <BrowserDialog title={chrome.dialogTitle} appName={APP_SHORT_NAME} cancel={chrome.cancel} confirm={chrome.confirm} />
        </BrowserPicture>
      )
    case 'samsung-menu-button':
      return (
        <BrowserPicture name={picture}>
          <BrowserBar place="top" items={SAMSUNG_TOP_BAR} />
          <BrowserPage title={APP_SHORT_NAME} />
          <BrowserBar place="bottom" items={samsungBottomBar(true)} />
        </BrowserPicture>
      )
    case 'samsung-add-page':
      return (
        <BrowserPicture name={picture}>
          <BrowserBar place="top" items={SAMSUNG_TOP_BAR} />
          <BrowserPage title={APP_SHORT_NAME} />
          <BrowserMenu
            place="top"
            title={samsung.addItem}
            items={[...dim(samsung.subBefore), { label: samsung.subTarget, hot: true }]}
          />
          <BrowserMenu
            place="bottom"
            layout="grid"
            items={[...dim(samsung.gridBefore), { label: samsung.addItem, hot: true }]}
          />
          <BrowserBar place="bottom" items={samsungBottomBar(false)} />
        </BrowserPicture>
      )
    case 'samsung-confirm':
      return (
        <BrowserPicture name={picture}>
          <BrowserBar place="top" items={SAMSUNG_TOP_BAR} />
          <BrowserPage title={APP_SHORT_NAME} />
          <BrowserBar place="bottom" items={samsungBottomBar(false)} />
          <BrowserDialog title={samsung.dialogTitle} appName={APP_SHORT_NAME} cancel={samsung.cancel} confirm={samsung.confirm} />
        </BrowserPicture>
      )
    case 'home-screen':
      // 옆 글 줄("홈 화면에 '우리 장부' 가 생겨요")이 같은 뜻을 읽어 주므로 그림은 숨기고 아래 줄만 읽힌다
      return <HomeScreenPreview decorative />
  }
}
