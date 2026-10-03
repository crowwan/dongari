import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isCatalogRoute } from './catalog/route'

// 개발 모드에서 #/dev/catalog 면 디자인 카탈로그를 연다.
// import.meta.env.DEV 가 프로덕션 빌드에서 false 로 바뀌어 아래 동적 import 는 번들에서 빠진다.
async function pickScreen(): Promise<ReactNode> {
  if (import.meta.env.DEV && isCatalogRoute(window.location.hash, import.meta.env.DEV)) {
    const { Catalog } = await import('./catalog/Catalog')
    return <Catalog />
  }
  return <App />
}

if (import.meta.env.DEV) {
  // 주소창에서 카탈로그 ↔ 앱을 오갈 때 다시 고른다
  window.addEventListener('hashchange', () => window.location.reload())
}

const root = createRoot(document.getElementById('root')!)

pickScreen().then((screen) => {
  root.render(<StrictMode>{screen}</StrictMode>)
})
