import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isCatalogRoute } from './catalog/route'
import { createKeep, withStartupRecoveryCode } from './features/keep/startKeep'
import { LocalStorageRepository } from './storage/LocalStorageRepository'
import { NotifyingRepository } from './storage/NotifyingRepository'
import { requestPersistentStorage } from './storage/persist'

// 개발 모드에서 #/dev/catalog 면 디자인 카탈로그를 연다.
// import.meta.env.DEV 가 프로덕션 빌드에서 false 로 바뀌어 아래 동적 import 는 번들에서 빠진다.
async function pickScreen(): Promise<ReactNode> {
  if (import.meta.env.DEV && isCatalogRoute(window.location.hash, import.meta.env.DEV)) {
    const { Catalog } = await import('./catalog/Catalog')
    return <Catalog />
  }
  // 저장소는 앱 시작 때 여기서 한 번만 읽는다. 읽기에는 깨진 원본을 옮겨 두는 부작용이 있어 렌더 중에 하지 않는다
  const storage = new LocalStorageRepository()
  // 이 버전을 처음 연 폰이면 복구 코드를 만들어 둔다 (SPEC-006 AC-1)
  const loaded = withStartupRecoveryCode(storage, storage.load())
  // 브라우저가 공간이 모자랄 때 이 사이트 기록을 먼저 지우지 않게 요청한다 (SPEC-002). 결과를 기다리지 않는다.
  // 지킬 장부가 있을 때만. 첫 실행이면 첫 장부를 만든 직후 App 이 요청한다 (크롬은 쓴 흔적·설치 여부로 허락을 정한다)
  if (loaded.data.books.length > 0) void requestPersistentStorage()

  // 복구 코드 자동 보관 (SPEC-006): 서버 주소(VITE_KEEP_URL)가 있는 빌드에서만. 저장에 성공할 때마다 보관기에 알린다.
  // 읽기 전용이면 앱을 열 때 올리지 않는다 (백업을 불러와 저장 막힘이 풀리면 그 저장부터 올린다)
  const keep = createKeep(import.meta.env.VITE_KEEP_URL)
  if (!keep) return <App repository={storage} loaded={loaded} />
  const repository = new NotifyingRepository(storage, (data) => keep.keeper.saved(data))
  if (loaded.status !== 'read-only') keep.keeper.start(loaded.data)
  keep.keeper.listen(window, document, () => document.visibilityState)
  return <App repository={repository} loaded={loaded} keep={keep} />
}

if (import.meta.env.DEV) {
  // 주소창에서 카탈로그 ↔ 앱을 오갈 때 다시 고른다
  window.addEventListener('hashchange', () => window.location.reload())
}

const root = createRoot(document.getElementById('root')!)

pickScreen().then((screen) => {
  root.render(<StrictMode>{screen}</StrictMode>)
})
