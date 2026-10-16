import { useSyncExternalStore } from 'react'

// 설정 "앱" 묶음 맨 아래 버전 줄과 새 버전 받음 표시 (SPEC-002 "버전 줄", #135)

// 버전 줄 값: 본 주소는 "2.6.0", 미리보기 빌드(배포 워크플로가 VITE_BUILD_SHA 를 넘긴다)는 "2.6.0 · 미리보기 abc1234"
export function versionLabel(version: string, buildSha: string | undefined): string {
  const sha = buildSha?.trim().slice(0, 7)
  return sha ? `${version} · 미리보기 ${sha}` : version
}

// 서비스 워커 쪽에서 보는 것: 지금 화면을 다루는 워커와 그 워커가 바뀌었다는 알림(controllerchange)
type WorkerContainer = EventTarget & { readonly controller: unknown }

export interface UpdateWatcher {
  subscribe: (listener: () => void) => () => void
  // 새 버전을 받아 바꿔 두었는데 지금 화면은 옛 버전인지
  getSnapshot: () => boolean
}

// 새 버전은 묻지 않고 받아 바로 바꾼다(registerType autoUpdate: skipWaiting + clientsClaim). 그러면 옛 워커가 다루던
// 화면에서 워커가 바뀌는 알림(controllerchange)이 온다 — 이 화면은 옛 번들 그대로라 "새 버전을 받았어요".
// 처음 연 화면(다루는 워커 없음)에 워커가 처음 붙는 것은 같은 버전이라 세지 않는다. 화면은 저절로 새로고침하지 않는다(적던 내용 보호)
export function createUpdateWatcher(workers: WorkerContainer | undefined): UpdateWatcher {
  let updated = false
  const listeners = new Set<() => void>()
  const controlledAtStart = workers !== undefined && workers.controller !== null && workers.controller !== undefined

  workers?.addEventListener('controllerchange', () => {
    if (!controlledAtStart || updated) return
    updated = true
    listeners.forEach((listener) => listener())
  })

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => updated,
  }
}

// 앱이 뜨기 전에 바뀌어도 놓치지 않게 모듈을 읽을 때 바로 듣기 시작한다 (등록 스크립트 registerSW.js 는 페이지 load 뒤에 등록)
export const browserUpdateWatcher = createUpdateWatcher(globalThis.navigator?.serviceWorker)

// 버전 줄이 보는 것. 테스트에서는 바꿔 넣는다
export type AppVersion = {
  label: string
  updates: UpdateWatcher
  // [지금 바꾸기]: 새로 열기
  reload: () => void
}

export function browserAppVersion(): AppVersion {
  return {
    label: versionLabel(__APP_VERSION__, import.meta.env.VITE_BUILD_SHA),
    updates: browserUpdateWatcher,
    reload: () => window.location.reload(),
  }
}

export function useUpdateReady(watcher: UpdateWatcher): boolean {
  return useSyncExternalStore(watcher.subscribe, watcher.getSnapshot)
}
