// 개발 확인 화면 [오류 내 보기] (SPEC-012 AC-11 수동 QA): 앱을 열어 장부 화면을 그린 뒤 일부러 화면 그리기 오류를 낸다.
// 표시는 그 탭의 sessionStorage 에 남기고 앱이 열 때 읽고 지운다 — [다시 열기] 로 다시 열면 오류가 나지 않는다.
// 개발 모드·미리보기 빌드에서만 불러온다(main.tsx 동적 import). 본 주소 번들에는 없다

export const DEV_CRASH_KEY = 'dongari-dev:crash'
// 오류 글: 글 정리(숫자 → #, 한글 → …)가 서버 자리에서 보이게 지어낸 이름·금액을 섞었다 → "dev crash test … #,#…"
export const DEV_CRASH_MESSAGE = 'dev crash test 김민지 12,000원'

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// 다음에 앱을 열 때 오류를 내라고 적어 둔다
export function askDevCrash(storage: SessionStorage): void {
  try {
    storage.setItem(DEV_CRASH_KEY, '1')
  } catch {
    // 적지 못하면 오류 없이 앱이 열릴 뿐이다
  }
}

// 적어 둔 것이 있으면 지우고 참
export function takeDevCrash(storage: SessionStorage): boolean {
  try {
    const asked = storage.getItem(DEV_CRASH_KEY) !== null
    storage.removeItem(DEV_CRASH_KEY)
    return asked
  } catch {
    return false
  }
}
