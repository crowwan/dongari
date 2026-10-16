// 개발 확인 화면 주소 (SPEC-009 기술 확인). 개발 모드와 미리보기 빌드에서만 연다
export const DEV_ENV_HASH = '#/dev/env'

// 크롬 intent 주소는 # 뒤를 intent 설정이 쓰므로 해시를 넘길 수 없다. 그쪽에서는 검색어 ?dev=env 로 연다
export const DEV_ENV_PARAM = 'dev'
export const DEV_ENV_PARAM_VALUE = 'env'

type PageLocation = { hash: string; search: string }

export function isDevEnvRoute(location: PageLocation, enabled: boolean): boolean {
  if (!enabled) return false
  return location.hash === DEV_ENV_HASH || new URLSearchParams(location.search).get(DEV_ENV_PARAM) === DEV_ENV_PARAM_VALUE
}

// 미리보기 빌드 = 빌드 경로가 / 인 빌드 (npm run build:preview, 배포 워크플로 미리보기 단계 둘 다 APP_BASE=/, #128).
// 본 주소(태그) 빌드는 /dongari/ 다. vite.config.ts 가 이 값으로 __PREVIEW_BUILD__ 를 정한다
export function isPreviewBase(base: string): boolean {
  return base === '/'
}
