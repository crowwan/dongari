// 첫 장부 뒤 장부 화면의 홈 화면에 추가 권하기 카드 (SPEC-002 "홈 화면에 추가 권하기", #135).
// 상태는 이 폰에만 둔다 — 장부 데이터(dongari:v2)·기록 파일과 따로, dongari:guide 와 같은 방식
import { isRecord } from '../../storage/schema'
import { shouldOfferInstall } from './installRules'

export const INSTALL_OFFER_KEY = 'dongari:install-offer'

// waiting: 첫 장부를 만들어 권할 차례 / done: [나중에] 를 눌렀거나 설치를 마쳐 다시 권하지 않는다
export type InstallOfferStatus = 'waiting' | 'done'

export interface InstallOfferStore {
  // 값이 없으면 undefined (첫 장부를 이 버전에서 만든 적 없음 — 이미 쓰던 폰), 깨졌으면 done
  load: () => InstallOfferStatus | undefined
  save: (status: InstallOfferStatus) => void
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

function isStatus(value: unknown): value is InstallOfferStatus {
  return value === 'waiting' || value === 'done'
}

// 깨졌거나 읽지 못하면 끝난 것으로 본다: 띄우지 않는 쪽
export function localInstallOfferStore(storage: KeyValueStorage = localStorage): InstallOfferStore {
  return {
    load: () => {
      try {
        const raw = storage.getItem(INSTALL_OFFER_KEY)
        if (raw === null) return undefined
        const value: unknown = JSON.parse(raw)
        return isRecord(value) && value.v === 1 && isStatus(value.status) ? value.status : 'done'
      } catch {
        return 'done'
      }
    },
    save: (status) => {
      try {
        storage.setItem(INSTALL_OFFER_KEY, JSON.stringify({ v: 1, status }))
      } catch {
        // 남기지 못해도 화면은 막지 않는다. 다음에 열 때 카드가 한 번 더 뜰 수 있다
      }
    },
  }
}

type OfferCardCondition = {
  status: InstallOfferStatus | undefined
  // 홈 화면 아이콘으로 열었는지 (display-mode: standalone)
  standalone: boolean
  // 이 화면에서 설치를 마쳤는지
  installed: boolean
  practice: boolean
  // 장부 위 다른 띠(저장 > 7일 보관 > 30일 기록 파일 안내)가 떠 있는지. 띠는 하나만이고 권하기는 맨 뒤
  otherNotice: boolean
}

export function showsInstallOffer({ status, standalone, installed, practice, otherNotice }: OfferCardCondition): boolean {
  return status === 'waiting' && shouldOfferInstall({ standalone, installed }) && !practice && !otherNotice
}
