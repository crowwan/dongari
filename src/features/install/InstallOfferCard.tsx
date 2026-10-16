import { Icon } from '../../ui/Icon'
import './install.css'

type InstallOfferCardProps = {
  onInstall: () => void // [홈 화면에 추가]: 설정 줄과 같은 동작 (설치 창 또는 방법 안내)
  onLater: () => void // [나중에]: 다시 권하지 않는다
}

// 홈 화면에 추가 권하기 (SPEC-002 #135): 첫 장부를 만든 직후 장부 위 띠 자리(맨 뒤)에 조용한 흰 카드.
// 경고가 아니라 노란 띠·alert 대신 흰 면이고, 화면 읽기는 차례대로 읽는다
export function InstallOfferCard({ onInstall, onLater }: InstallOfferCardProps) {
  return (
    <div className="install-offer" data-testid="install-offer">
      <p className="install-offer__message">
        <Icon name="phone" />
        <span>홈 화면에 추가하면 앱처럼 바로 열려요</span>
      </p>
      <div className="install-offer__actions">
        <button type="button" className="install-offer__action" data-kind="install" onClick={onInstall}>
          홈 화면에 추가
        </button>
        <button type="button" className="install-offer__action" data-kind="later" onClick={onLater}>
          나중에
        </button>
      </div>
    </div>
  )
}
