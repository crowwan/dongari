import { describe, expect, it } from 'vitest'
import { isCatalogRoute } from './route'

describe('디자인 카탈로그 경로', () => {
  it('개발 모드에서 #/dev/catalog 이면 카탈로그를 연다', () => {
    expect(isCatalogRoute('#/dev/catalog', true)).toBe(true)
  })

  it('프로덕션에서는 같은 주소여도 열지 않는다', () => {
    expect(isCatalogRoute('#/dev/catalog', false)).toBe(false)
  })

  it('다른 주소에서는 열지 않는다', () => {
    expect(isCatalogRoute('', true)).toBe(false)
    expect(isCatalogRoute('#/', true)).toBe(false)
  })
})
