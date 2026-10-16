// 홈 화면 앱 이름 (manifest short_name). 설치 안내의 홈 화면 모습 그림(SPEC-009)도 같은 값을 쓴다.
// vite.config.ts 가 pwaOptions 를 통해 이 파일을 Node 로 읽으니 브라우저 전용 값(import.meta.env 등)을 두지 않는다
export const APP_SHORT_NAME = '우리 장부'
