import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isCatalogRoute } from './catalog/route'
import { takeDevCrash } from './devtools/crashRequest'
import { isDevEnvRoute } from './devtools/route'
import { AppErrorRecorder } from './features/errors/AppErrorRecorder'
import { localAppErrorStore } from './features/errors/appErrorStore'
import { renderStartScreen } from './features/errors/startScreen'
import { AppRoot } from './features/practice/AppRoot'
import { localGuideStore, settleExistingPhone } from './features/guide/guideStore'
import { inAppKind, localInAppStore, readFromKakao } from './features/install/inAppBrowser'
import { localInstallOfferStore } from './features/install/installOffer'
import { createKeep, startKeep, withStartupRecoveryCode } from './features/keep/startKeep'
import { localPracticeMarkStore } from './features/practice/practiceMark'
import { LocalStorageRepository } from './storage/LocalStorageRepository'
import { NotifyingRepository } from './storage/NotifyingRepository'
import { requestPersistentStorage } from './storage/persist'

// 앱 오류 기록 (SPEC-012 2절): 화면을 고르기 전부터 잡히지 않은 오류·Promise 거절을 듣는다 (앱을 여는 동안 난 오류도 센다).
// 오류 경계(그리기 오류)·App(화면 이름·저장 실패 띠)·자동 보관기(바로 보내기)가 이 기록기 하나를 쓴다. 폰 기록은 dongari:errors
const appErrors = new AppErrorRecorder({ store: localAppErrorStore(), origin: window.location.origin })
appErrors.listen(window)

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
  const app = openApp()
  // 개발 확인 화면 [오류 내 보기] 로 왔으면 앱을 그린 뒤 일부러 그리기 오류를 낸다 (SPEC-012 AC-11 수동 QA).
  // 개발 모드·미리보기 빌드에서만, 표시(sessionStorage dongari-dev:crash)가 있을 때만 그 조각을 받는다.
  // 본 주소 빌드는 조건이 false 라 표시 읽기와 아래 동적 import 가 번들에서 빠진다
  if ((import.meta.env.DEV || __PREVIEW_BUILD__) && takeDevCrash(window.sessionStorage)) {
    const { DevCrash } = await import('./devtools/DevCrash')
    return (
      <>
        {app}
        <DevCrash />
      </>
    )
  }
  return app
}

// 진짜 앱: 저장소를 읽고 자동 보관을 시작한다
function openApp(): ReactNode {
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
  // 첫 실행 연습을 마쳤다는 표시 (SPEC-009 B): 장부 없이 다시 열면 물음 없이 새 장부 만들기로
  const practiceMarkStore = localPracticeMarkStore()
  // 카톡 안에서 열렸을 때 (SPEC-009 C): 판단은 화면을 그리기 전에 user agent 로 한 번.
  // 카톡에서 옮겨 왔다는 ?from=kakao 는 읽고 주소에서 지운다 (새로고침·홈 화면에 추가로 가져오기 카드가 다시 생기지 않게. 카톡 안이면 무시)
  const kind = inAppKind(navigator.userAgent)
  const inApp = kind && { kind, store: localInAppStore() }
  const from = readFromKakao(window.location.href)
  if (from.cleanHref) window.history.replaceState(window.history.state, '', from.cleanHref)
  const stores = { guideStore, installOfferStore, practiceMarkStore, inApp, fromKakao: from.fromKakao, appErrors }

  // 복구 코드 자동 보관 (SPEC-006): 서버 주소(VITE_KEEP_URL)가 있는 빌드에서만. 저장에 성공할 때마다 보관기에 알린다.
  // 앱을 열 때 올리고 상태 신호(오류 목록 포함, SPEC-012)를 보낸다 (SPEC-007, 읽기 전용이면 둘 다 안 한다)
  // 장부가 없으면 첫 실행 물음부터, 연습 장부는 메모리에만 (SPEC-008, AppRoot)
  const keep = createKeep(import.meta.env.VITE_KEEP_URL, appErrors.list)
  if (!keep) return <AppRoot repository={storage} loaded={loaded} {...stores} />
  const repository = new NotifyingRepository(storage, (data) => keep.keeper.saved(data))
  void startKeep(keep.keeper, loaded)
  keep.keeper.listen(window, document, () => document.visibilityState)
  // 앱 오류가 기록되면 상태 신호를 바로 보낸다 (SPEC-012, 앱을 한 번 연 동안 3번까지는 보관기가 센다)
  appErrors.subscribe(() => void keep.keeper.reportErrors())
  return <AppRoot repository={repository} loaded={loaded} keep={keep} {...stores} />
}

if (import.meta.env.DEV || __PREVIEW_BUILD__) {
  // 주소창에서 카탈로그·개발 확인 화면 ↔ 앱을 오갈 때 다시 고른다 (앱 화면 이동은 해시를 쓰지 않는다)
  window.addEventListener('hashchange', () => window.location.reload())
}

const root = createRoot(document.getElementById('root')!)

// 화면을 그리다(또는 고르다) 오류가 나면 흰 화면 대신 "다시 열기" 화면 (SPEC-012 2절). 그 오류는 render 로 센다
void renderStartScreen(root, pickScreen, appErrors)
