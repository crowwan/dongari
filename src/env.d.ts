/// <reference types="vite/client" />

// 빌드 환경변수 (vite 가 import.meta.env 로 넣는다)
interface ImportMetaEnv {
  // 복구 코드 자동 보관 서버 주소 (SPEC-006, 배포 워크플로가 저장소 변수 KEEP_URL 로 넘긴다). 없으면 자동 보관이 꺼진다
  readonly VITE_KEEP_URL?: string
  // 미리보기 빌드의 커밋 번호 (배포 워크플로 미리보기 단계만 넘긴다, #135). 있으면 설정 버전 줄에 "미리보기 abc1234"
  readonly VITE_BUILD_SHA?: string
}

// 앱 버전 (빌드 때 vite define 이 package.json version 을 넣는다, SPEC-007 상태 신호)
declare const __APP_VERSION__: string
