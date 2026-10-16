// 홈 화면 추가(standalone) 시험용 서비스 워커 (#114). 캐시 없이 모든 요청을 네트워크로 보낸다.
// 삼성 인터넷 등 일부 브라우저가 "앱으로 설치" 를 서비스 워커가 있을 때만 보여 줘서 둔다
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => event.respondWith(fetch(event.request)))
