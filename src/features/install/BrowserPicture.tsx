import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../ui/Icon'
import { appIconUrl } from './appIcon'
import './browserPicture.css'

// 브라우저 화면 모형 부품 (SPEC-009 설치 안내 그림, 카톡 안 브라우저 메뉴 그림).
// 로고 없는 회색 면 위에 위치만 맞춘 줄·메뉴를 놓고, 누를 곳만 청록으로 진하게 + 깜빡이는 동그라미·화살표(TapMark)를 단다.
// 그림 전체를 화면 읽기에서 숨긴다 — 같은 뜻은 그림 밖 글 줄이 전한다.
//
// 쓰는 법 (카톡 안 브라우저 ⋮ → '다른 브라우저로 열기' 예):
//   <BrowserPicture name="kakao-menu">
//     <BrowserPage title="우리 장부" />
//     <BrowserMenu place="bottom" items={[{ label: '새로고침' }, { label: '다른 브라우저로 열기', hot: true }]} />
//     <BrowserBar place="bottom" items={[{ icon: 'left' }, { icon: 'right' }, { icon: 'refresh' }, { icon: 'kebab', hot: true }]} />
//   </BrowserPicture>

export type BrowserPlace = 'top' | 'bottom'

// 줄 안 둥근 단추. hot 이면 누를 곳(청록 + 동그라미 + 줄 안쪽을 가리키는 화살표)
export type BrowserButton = { icon: IconName; hot?: boolean }

// 메뉴 한 줄(또는 칸). hot 이면 누를 곳(청록 면 + 진한 글자 + 동그라미)
export type BrowserMenuItem = { label: string; hot?: boolean }

type BrowserPictureProps = {
  // 어떤 그림인지 (카탈로그·테스트용 표시)
  name: string
  children: ReactNode
}

export function BrowserPicture({ name, children }: BrowserPictureProps) {
  return (
    <div className="browser-pic" aria-hidden="true" data-testid="browser-picture" data-picture={name}>
      {children}
    </div>
  )
}

// 누를 곳 표시: 둘레 동그라미(ring) 또는 굵은 화살표(arrow). 천천히 깜빡이고, 동작 줄이기면 멈춘 채로 보인다
type TapMarkProps = { mark: 'ring' } | { mark: 'arrow'; direction: 'up' | 'down' }

export function TapMark(props: TapMarkProps) {
  const direction = props.mark === 'arrow' ? props.direction : undefined
  return (
    <span className="tap-mark" data-mark={props.mark} data-direction={direction}>
      {direction && <Icon name={direction === 'up' ? 'arrow-up' : 'arrow-down'} />}
    </span>
  )
}

// 주소창 줄(위) 또는 도구 줄(아래). 'address' 자리에 지금 주소를 흐리게 쓴다
export function BrowserBar({ place, items }: { place: BrowserPlace; items: readonly (BrowserButton | 'address')[] }) {
  return (
    <div className="browser-pic__bar" data-place={place}>
      {items.map((item, index) =>
        item === 'address' ? (
          <span key={index} className="browser-pic__address">
            {globalThis.location?.host ?? ''}
          </span>
        ) : (
          <span key={index} className="browser-pic__button" data-hot={item.hot ? '' : undefined}>
            <Icon name={item.icon} />
            {item.hot && (
              <>
                <TapMark mark="ring" />
                {/* 위 줄 단추는 아래에서 위로, 아래 줄 단추는 위에서 아래로 가리킨다 */}
                <TapMark mark="arrow" direction={place === 'top' ? 'up' : 'down'} />
              </>
            )}
          </span>
        ),
      )}
    </div>
  )
}

// 웹 화면 자리: 앱 이름 한 줄 + 흐린 덩어리·줄
export function BrowserPage({ title }: { title: string }) {
  return (
    <div className="browser-pic__page">
      <span className="browser-pic__title">{title}</span>
      <span className="browser-pic__block" />
      <span className="browser-pic__line" data-length="long" />
      <span className="browser-pic__line" data-length="short" />
      <span className="browser-pic__block" />
      <span className="browser-pic__line" data-length="long" />
    </div>
  )
}

type BrowserMenuProps = {
  // top: 위 오른쪽에 떠 있는 목록(위 줄을 덮는다), bottom: 아래 줄 바로 위
  place: BrowserPlace
  // grid: 아래에서 올라오는 칸 목록(삼성 인터넷 ≡), list: 줄 목록
  layout?: 'list' | 'grid'
  title?: string
  items: readonly BrowserMenuItem[]
}

export function BrowserMenu({ place, layout = 'list', title, items }: BrowserMenuProps) {
  return (
    <div className="browser-pic__menu" data-place={place} data-layout={layout}>
      {title && <span className="browser-pic__menu-title">{title}</span>}
      {items.map((item) => (
        <span key={item.label} className="browser-pic__item" data-hot={item.hot ? '' : undefined}>
          {item.label}
          {item.hot && <TapMark mark="ring" />}
        </span>
      ))}
    </div>
  )
}

type BrowserDialogProps = {
  title: string
  appName: string
  cancel: string
  // 누를 버튼 (진하게 + 동그라미)
  confirm: string
}

// 브라우저가 그리는 확인 창 (설치·추가): 뒤를 어둡게 + 가운데 창(앱 아이콘·이름·주소, [취소] [누를 버튼])
export function BrowserDialog({ title, appName, cancel, confirm }: BrowserDialogProps) {
  return (
    <>
      <span className="browser-pic__scrim" />
      <div className="browser-pic__dialog">
        <span className="browser-pic__dialog-title">{title}</span>
        <span className="browser-pic__app">
          <img className="browser-pic__app-icon" src={appIconUrl()} alt="" />
          <span className="browser-pic__app-text">
            <span className="browser-pic__app-name">{appName}</span>
            <span className="browser-pic__app-site">{globalThis.location?.host ?? ''}</span>
          </span>
        </span>
        <span className="browser-pic__dialog-buttons">
          <span className="browser-pic__dialog-button">{cancel}</span>
          <span className="browser-pic__dialog-button" data-hot="">
            {confirm}
            <TapMark mark="ring" />
          </span>
        </span>
      </div>
    </>
  )
}
