// 디자인 카탈로그 주소. 개발 모드에서만 연다
export const CATALOG_HASH = '#/dev/catalog'

export function isCatalogRoute(hash: string, isDev: boolean): boolean {
  return isDev && hash === CATALOG_HASH
}
