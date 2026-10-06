import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isCatalogRoute } from './catalog/route'
import { LocalStorageRepository } from './storage/LocalStorageRepository'
import { requestPersistentStorage } from './storage/persist'

// 개발 모드에서 #/dev/catalog 면 디자인 카탈로그를 연다.
// import.meta.env.DEV 가 프로덕션 빌드에서 false 로 바뀌어 아래 동적 import 는 번들에서 빠진다.
async function pickScreen(): Promise<ReactNode> {
  if (import.meta.env.DEV && isCatalogRoute(window.location.hash, import.meta.env.DEV)) {
    const { Catalog } = await import('./catalog/Catalog')
    return <Catalog />
  }
  // 저장소는 앱 시작 때 여기서 한 번만 읽는다. 읽기에는 깨진 원본을 옮겨 두는 부작용이 있어 렌더 중에 하지 않는다
  const repository = new LocalStorageRepository()
  const loaded = repository.load()
  // 브라우저가 공간이 모자랄 때 이 사이트 기록을 먼저 지우지 않게 요청한다 (SPEC-002). 결과를 기다리지 않는다
  void requestPersistentStorage()
  return <App repository={repository} loaded={loaded} />
}

if (import.meta.env.DEV) {
  // 주소창에서 카탈로그 ↔ 앱을 오갈 때 다시 고른다
  window.addEventListener('hashchange', () => window.location.reload())
}

const root = createRoot(document.getElementById('root')!)

pickScreen().then((screen) => {
  root.render(<StrictMode>{screen}</StrictMode>)
})
