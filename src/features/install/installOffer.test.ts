import { describe, expect, it } from 'vitest'
import { INSTALL_OFFER_KEY, localInstallOfferStore, showsInstallOffer } from './installOffer'

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
  }
}

// 첫 장부를 만든 직후, 브라우저로 열었고, 다른 띠가 없는 기본 경우
const SHOWN = { status: 'waiting', standalone: false, installed: false, practice: false, otherNotice: false } as const

describe('SPEC-002 홈 화면에 추가 권하기 카드 조건 (#135)', () => {
  it('첫 장부를 만든 뒤(기다림) 브라우저로 열었으면 보인다', () => {
    expect(showsInstallOffer(SHOWN)).toBe(true)
  })

  it('첫 장부를 만든 적이 없거나(값 없음) [나중에]·설치로 끝났으면 보이지 않는다', () => {
    expect(showsInstallOffer({ ...SHOWN, status: undefined })).toBe(false)
    expect(showsInstallOffer({ ...SHOWN, status: 'done' })).toBe(false)
  })

  it('홈 화면 앱(standalone)으로 열었거나 이미 설치했으면 보이지 않는다', () => {
    expect(showsInstallOffer({ ...SHOWN, standalone: true })).toBe(false)
    expect(showsInstallOffer({ ...SHOWN, installed: true })).toBe(false)
  })

  it('연습 장부에서는 보이지 않는다', () => {
    expect(showsInstallOffer({ ...SHOWN, practice: true })).toBe(false)
  })

  it('장부 위 다른 띠(저장·보관·기록 파일 안내)가 있으면 그 띠가 먼저라 보이지 않는다', () => {
    expect(showsInstallOffer({ ...SHOWN, otherNotice: true })).toBe(false)
  })
})

describe('SPEC-002 권하기 상태 저장 (dongari:install-offer, #135)', () => {
  it('값이 없으면 undefined 로 읽는다', () => {
    expect(localInstallOfferStore(memoryStorage()).load()).toBeUndefined()
  })

  it('저장한 상태를 dongari:install-offer 에 { v: 1, status } 로 두고 다시 읽는다', () => {
    const storage = memoryStorage()
    const store = localInstallOfferStore(storage)
    store.save('waiting')
    expect(JSON.parse(storage.items.get(INSTALL_OFFER_KEY) ?? '')).toEqual({ v: 1, status: 'waiting' })
    expect(store.load()).toBe('waiting')
    store.save('done')
    expect(store.load()).toBe('done')
  })

  it('값이 깨졌거나 모양이 다르면 끝난 것으로 읽는다 (띄우지 않는다)', () => {
    expect(localInstallOfferStore(memoryStorage({ [INSTALL_OFFER_KEY]: '{깨짐' })).load()).toBe('done')
    expect(localInstallOfferStore(memoryStorage({ [INSTALL_OFFER_KEY]: '{"v":1,"status":"네"}' })).load()).toBe('done')
    expect(localInstallOfferStore(memoryStorage({ [INSTALL_OFFER_KEY]: '{"v":2,"status":"waiting"}' })).load()).toBe('done')
  })

  it('기기에 읽고 쓰지 못해도 오류를 내지 않는다', () => {
    const store = localInstallOfferStore({
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('가득 참')
      },
    })
    expect(store.load()).toBe('done')
    expect(() => store.save('waiting')).not.toThrow()
  })
})
