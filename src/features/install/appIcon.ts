// 앱 아이콘(manifest icon-192). 빌드 경로(APP_BASE)를 따라가고, 서비스 워커가 미리 저장해 두어 인터넷 없이도 보인다 (SPEC-002)
export function appIconUrl(): string {
  return `${import.meta.env.BASE_URL}icons/icon-192.png`
}
