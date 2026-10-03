// 브라우저가 저장 공간이 부족할 때 이 사이트 데이터를 먼저 지우지 않도록 요청한다 (SPEC-002)
// 지원하지 않거나 실패해도 앱 시작을 막지 않는다. 결과: 영구 저장이 허용됐는지
export async function requestPersistentStorage(
  storageManager: { persist?: () => Promise<boolean> } | undefined = globalThis.navigator?.storage,
): Promise<boolean> {
  if (!storageManager?.persist) return false
  try {
    return await storageManager.persist()
  } catch {
    return false
  }
}
