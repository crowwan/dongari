// 브라우저 저장 공간 관리자 중 오래 보관 요청에 쓰는 부분 (navigator.storage)
type PersistentStorageManager = {
  persisted?: () => Promise<boolean>
  persist?: () => Promise<boolean>
}

// 브라우저가 저장 공간이 부족할 때 이 사이트 데이터를 먼저 지우지 않도록 요청한다 (SPEC-002, #93)
// 이미 오래 보관이면 다시 요청하지 않는다. 지원하지 않거나 실패해도 앱을 막지 않는다. 결과: 오래 보관이 허락됐는지
export async function requestPersistentStorage(
  storageManager: PersistentStorageManager | undefined = globalThis.navigator?.storage,
): Promise<boolean> {
  if (!storageManager?.persisted || !storageManager.persist) return false
  try {
    if (await storageManager.persisted()) return true
    return await storageManager.persist()
  } catch {
    return false
  }
}
