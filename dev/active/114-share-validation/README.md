# #114 기술 검증: 갤럭시에서 결산 사진 공유 창

## 목적

v2.6 시안 B "결산을 단톡방에" 버튼을 만들기 전에, 갤럭시에서 폰 공유 창(`navigator.share({ files })`)으로 결산 사진을 카카오톡 단톡방에 **사진으로** 보낼 수 있는지 확인한다. 지금 앱은 아이폰만 공유 창을 쓰고 갤럭시는 내려받기만 한다(`src/features/report/savePicture.ts`).

결과는 이 메모와 SPEC-003 열린 질문에 남기고, 버튼 이름(카톡으로 보내기 / 사진 보내기 등)을 정할 근거로 쓴다.

## 실험 페이지

- 주소: https://crowwan.github.io/dongari/lab/share-test/
- 소스: `page/` (의존성 없는 HTML 한 파일 + manifest·아이콘·서비스 워커. html2canvas 결산표만 cdnjs 에서 불러온다, 못 불러오면 그 사진만 빠진다)
- 배포: gh-pages 의 `lab/share-test/` 에만 (`npx gh-pages --add -d dev/active/114-share-validation/page -e lab/share-test`). 다음 릴리스(태그) 배포 때 `lab/` 과 같이 지워진다.
- 본 주소 서비스 워커(v2.1.0 부터)는 `/dongari/lab` 화면 요청을 네트워크로 보낸다(CLAUDE.md #54). 그 전 서비스 워커가 깔린 폰이면 본 주소 화면이 뜰 수 있다 → 본 주소를 한 번 열어 서비스 워커를 바꾼 뒤 다시 연다.
- 기록은 폰의 localStorage `dongari-lab-share-test:log` 에 남는다(앱 키 `dongari:*` 와 겹치지 않음). [기록 지우기] 로 지운다.

### 페이지가 하는 일

| 부분 | 내용 |
|---|---|
| 이 폰 정보 | 주소, `display-mode: standalone`, `share`/`canShare` 있는지, 사진별 `canShare({ files })`, `navigator.userActivation` 있는지, userAgent |
| 보낼 사진 | 작은 PNG 400×400, 결산표 크기 PNG 720×2344(캔버스), 실제 앱처럼 html2canvas(scale 2, 흰 바탕)로 그린 결산표 720×2344. 페이지를 열 때 미리 만든다 |
| 공유 버튼 | 바로 / 1초 / 3초 / 6초 뒤 × 사진만 / 사진+글자(title·text). 누른 뒤 html2canvas 로 만들고 바로 공유(실제 앱 순서) 두 개 |
| 기록 | 버튼, 사진·용량, canShare, 부를 때 사용자 활성화(`userActivation.isActive`), 사진 만들기 ms, 누른 뒤 공유 부르기까지 ms, 공유 창 결과까지 ms, 결과(성공 / 오류 이름 NotAllowedError·AbortError·TypeError 등 + 메시지), standalone. 공유 창이 답하지 않으면 "결과 기다리는 중"(점선)으로 남는다 |
| 대체 | `<a download>` 내려받기 |
| 결과 복사 | 이 폰 정보 + 기록 전체를 글로 복사. 복사가 막히면 글 상자를 보여 주고 전체 선택 |
| 홈 화면 추가 | manifest(scope `/dongari/lab/share-test/`, standalone) + 캐시 없는 서비스 워커. 홈 화면 아이콘으로 열면 standalone 이 true |

## 확인 항목 (이슈 #114)

1. 크롬·삼성 인터넷·홈 화면 추가(standalone)에서 `canShare({ files: [png] })` 가 참인지, 공유 창이 뜨는지
2. 카카오톡 → 단톡방을 고르면 **사진**으로 올라가는지(파일 첨부가 아니라), 화질·크기
3. 지연(사진 만드는 시간) 뒤에도 공유 창이 열리는지 — 사용자 활성화가 끝나면 `NotAllowedError`. 한 번 더 눌러야 하는지, 미리 만들어 두면 되는지
4. 공유 창을 그냥 닫았을 때(`AbortError`), 공유를 못 쓸 때 내려받기
5. 글자(title·text) + 사진을 같이 보낼 수 있는지, 카톡에서 어떻게 보이는지

## 결과 (실기기, 빈칸은 사용자 폰에서 채운다)

### 기기·브라우저별

| 기기 | 브라우저 | standalone | canShare | 공유 창 | 카톡에 사진으로 올라감 | 화질·크기 | 글자 같이 보이나 | 닫았을 때 오류 |
|---|---|---|---|---|---|---|---|---|
|  | 크롬 | 아니오 |  |  |  |  |  |  |
|  | 삼성 인터넷 | 아니오 |  |  |  |  |  |  |
|  | 홈 화면 추가 (크롬) | 예 |  |  |  |  |  |  |
|  | 홈 화면 추가 (삼성 인터넷) | 예 |  |  |  |  |  |  |

### 지연별 (사진만 / 사진+글자, 결과 = 성공·오류 이름)

| 브라우저 | 바로 | 1초 | 3초 | 6초 | 만들고 공유 (만들기 ms) |
|---|---|---|---|---|---|
| 크롬 |  |  |  |  |  |
| 삼성 인터넷 |  |  |  |  |  |
| 홈 화면 추가 |  |  |  |  |  |

### 데스크톱 크롬 (참고, 2026-10-16 Playwright headless 151, macOS)

- canShare 세 사진 모두 true, html2canvas 결산표 만들기 약 255ms, 251KB
- 바로 공유: 공유 창을 불렀지만 headless 라 답이 없음("결과 기다리는 중"으로 남음). 그 상태에서 다른 공유를 누르면 `InvalidStateError`(An earlier share has not yet completed) — 실기기에서도 공유 창이 떠 있는 동안 두 번 누르면 이 오류가 날 수 있다
- 결과 복사(clipboard) 동작

## 결론 (실기기 결과 뒤)

- [ ] 갤럭시에서 공유 창 사용 여부:
- [ ] 미리 만들어 두기 / 한 번 더 누르기 필요 여부:
- [ ] 글자 같이 보내기 여부:
- [ ] 버튼 이름:
- [ ] SPEC-003 열린 질문 반영
