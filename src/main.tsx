import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isCatalogRoute } from './catalog/route'
import { isDevEnvRoute } from './devtools/route'
import { AppRoot } from './features/practice/AppRoot'
import { localGuideStore, settleExistingPhone } from './features/guide/guideStore'
import { localInstallOfferStore } from './features/install/installOffer'
import { createKeep, startKeep, withStartupRecoveryCode } from './features/keep/startKeep'
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
  // 개발 모드·미리보기 빌드에서 #/dev/env (크롬 intent 로는 ?dev=env) 면 개발 확인 화면을 연다 (SPEC-009 기술 확인).
  // 본 주소 빌드는 둘 다 false 라 아래 동적 import 가 번들에서 빠진다. 장부 저장소를 읽기 전에 돌아가 장부를 건드리지 않는다
  if ((import.meta.env.DEV || __PREVIEW_BUILD__) && isDevEnvRoute(window.location, import.meta.env.DEV || __PREVIEW_BUILD__)) {
    const [{ DevEnvScreen }, { browserDevEnvironment }] = await Promise.all([
      import('./devtools/DevEnvScreen'),
      import('./devtools/devEnvironment'),
    ])
    return <DevEnvScreen env={browserDevEnvironment()} />
  }
  // 저장소는 앱 시작 때 여기서 한 번만 읽는다. 읽기에는 깨진 원본을 옮겨 두는 부작용이 있어 렌더 중에 하지 않는다
  const storage = new LocalStorageRepository()
  // 이 버전을 처음 연 폰이면 복구 코드를 만들어 둔다 (SPEC-006 AC-1)
  const loaded = withStartupRecoveryCode(storage, storage.load())
  // 브라우저가 공간이 모자랄 때 이 사이트 기록을 먼저 지우지 않게 요청한다 (SPEC-002). 결과를 기다리지 않는다.
  // 지킬 장부가 있을 때만. 첫 실행이면 첫 장부를 만든 직후 App 이 요청한다 (크롬은 쓴 흔적·설치 여부로 허락을 정한다)
  if (loaded.data.books.length > 0) void requestPersistentStorage()
  // 복구 코드 안내 말풍선 (SPEC-008): 장부가 이미 있는 폰(v2.6 전부터 쓰던 폰)은 안내를 하지 않는다
  const guideStore = localGuideStore()
  settleExistingPhone(guideStore, loaded.data.books.length > 0)
  // 첫 장부 뒤 홈 화면에 추가 권하기 (SPEC-002 #135): 값이 없는 폰(이미 쓰던 폰)은 권하지 않는다
  const installOfferStore = localInstallOfferStore()

  // 복구 코드 자동 보관 (SPEC-006): 서버 주소(VITE_KEEP_URL)가 있는 빌드에서만. 저장에 성공할 때마다 보관기에 알린다.
  // 앱을 열 때 올리고 상태 신호를 보낸다 (SPEC-007, 읽기 전용이면 둘 다 안 한다)
  // 장부가 없으면 첫 실행 물음부터, 연습 장부는 메모리에만 (SPEC-008, AppRoot)
  const keep = createKeep(import.meta.env.VITE_KEEP_URL)
  if (!keep) return <AppRoot repository={storage} loaded={loaded} guideStore={guideStore} installOfferStore={installOfferStore} />
  const repository = new NotifyingRepository(storage, (data) => keep.keeper.saved(data))
  void startKeep(keep.keeper, loaded)
  keep.keeper.listen(window, document, () => document.visibilityState)
  return (
    <AppRoot repository={repository} loaded={loaded} keep={keep} guideStore={guideStore} installOfferStore={installOfferStore} />
  )
}

if (import.meta.env.DEV || __PREVIEW_BUILD__) {
  // 주소창에서 카탈로그·개발 확인 화면 ↔ 앱을 오갈 때 다시 고른다 (앱 화면 이동은 해시를 쓰지 않는다)
  window.addEventListener('hashchange', () => window.location.reload())
}

const root = createRoot(document.getElementById('root')!)

pickScreen().then((screen) => {
  root.render(<StrictMode>{screen}</StrictMode>)
})
