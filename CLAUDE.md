# 우리 장부 (옛 이름 동아리 회계)

어머니가 스마트폰으로 동아리 수입·지출(과 개인 가계부, v2.4 여러 장부)을 한 줄씩 적으면 연말 정산 보고서가 만들어지는 모바일 웹앱. 주소(`/dongari/`)·저장 키(`dongari:v2`)는 옛 이름 그대로.

## 개발 규칙

개인 프로젝트 공용 규칙(`~/Works/personal/_playbook/PLAYBOOK.md`)을 따른다.

- 기획: `docs/prd.md`, `docs/specs/SPEC-*.md` — 스펙이 동작의 기준. 구현 중 동작이 바뀌면 스펙부터 고친다.
- 작업: GitHub Issues + Projects. 이슈는 approved 스펙에서만 만든다 (`/spec-issues`).
- 브랜치 `<종류>/<이슈번호>-<이름>`, 커밋 `feat: 한글 메시지 (#12)`, PR 로만 머지 (squash).
- 테스트: 스펙 ID 를 테스트 묶음 이름에, AC 내용을 테스트 이름에 한글로.
- 릴리스: `/release v2.0`
- 디자인 기준(큰 글씨·쉬운 말)은 `docs/design.md`. 대상 기기는 갤럭시(삼성 인터넷·크롬).
- 화면 말(v2.6 #120): "백업 파일" → **기록 파일**, "자동 보관" → **자동으로 지키기**. 화면 문구·화면 읽기 이름에만 쓰고, 코드 이름(`backup.ts`·`useBackup`·`AutoKeeper` 등)·저장 키·개발 문서는 옛 말 그대로 둔다(SPEC-006 v2.6 "용어 바꾸기").
- 개발 서버는 3000 포트 금지 → `npm run dev -- --port 7777`.

## 현재 상태

- 최신 릴리스: v2.6.0 (2026-10-16, 이모 첫 사용 — 연습 장부·결산 보내기·큰 글씨·설정 정리·자동 보관 지켜보기, #137). 다음 마일스톤 미정. 미리보기 https://uri-jangbu-preview.pages.dev/ (Cloudflare Pages, #128)
- 끝난 스펙: SPEC-001 한 줄 장부 입력, SPEC-002 안전한 저장과 백업, SPEC-003 월 정리와 올해 결산
- v2.0.0 은 갤럭시 실기기 QA(홈 화면 추가·오프라인, 사진 저장 Download 앨범, 백업 보내기·불러오기)와 어머니 사용성 테스트(SPEC-001 AC-13) 전에 배포했다. 남은 확인은 릴리스 이슈 #40 체크리스트
- v2.6 에서 끝낸 스펙: SPEC-007 자동 보관 지켜보기, SPEC-008 처음 쓰는 분 연습 장부, SPEC-001·002·003·006 v2.6 보강
- backlog 스펙: SPEC-004 적어 둔 글로 한 번에 적기 (draft — 1단계: 글 붙여넣기·공유 받기 → 확인 화면, 사진 인식기는 엔진 비교 후 2단계. 사진 → 글 추출이 동작할 때 다시 본다)
- GitHub Project: crowwan #3
- v2 는 거래 기록 모델이다 (`docs/prd.md` 데이터 모델). v1 코드는 #16 에서 모두 정리했다 (v1 연말 양식은 `features/report/sheet` 로 옮겨 `YearReport` 를 그린다).

## 스택

- React 19 + TypeScript + Vite 7, 순수 CSS + 디자인 토큰(`src/styles/tokens.css`, 개인 디자인 시스템 역할 구조). Tailwind 는 #12 에서 걷어냄
- 글꼴 Pretendard(앱에 포함, 오프라인 미리 저장), 아이콘 lucide-react (#45)
- 저장: localStorage (버전 있는 스키마, 지금 v3 = 장부 여러 개, `docs/decisions/001-storage.md`)
- 월 정리·올해 결산 사진: html2canvas (누를 때·공유 창이 되는 폰은 화면을 열 때 미리 불러온다) → `canvas.toBlob` → [사진으로 저장] Blob 주소 `<a download>`(아이폰·아이패드는 공유 시트 "이미지 저장"으로 사진 앱에, #58) / [사진 보내기] 폰 공유 창 `navigator.share({ files })`, `canShare` 가 거짓이면 버튼 숨김 (v2.6 #130)
- 테스트: Vitest + Testing Library (v2.0 에서 도입)
- 배포: 본 주소 GitHub Pages (`base: '/dongari/'`), 미리보기 Cloudflare Pages (`base: '/'`, #128). 홈 화면 추가·오프라인은 vite-plugin-pwa (#10)

## 실행

```bash
npm install
npm run dev -- --port 7777   # 개발 서버
npm run lint
npm run build
npm run build:preview        # 미리보기 경로(/, Cloudflare Pages)로 빌드
```

- 빌드 경로는 환경변수 `APP_BASE`(기본 `/dongari/`) 하나로 정한다 (`vite.config.ts`). 화면 파일·아이콘 경로, manifest `id`·`start_url`·`scope`, 서비스 워커 범위가 모두 따라간다. `build:preview` 는 `APP_BASE=/`(미리보기는 따로 된 주소의 맨 위, #128).
- 미리보기 빌드를 로컬에서 보기: `npm run build:preview && npx vite preview --port 7777` → `http://localhost:7777/` (manifest `scope`·서비스 워커 범위가 `/`)
- 자동 보관 서버 주소는 빌드 환경변수 `VITE_KEEP_URL`(SPEC-006). 없으면 자동 보관이 꺼진다(설정 맨 위 복구 코드 카드·"다른 방법으로 옮기기" 없이 기록 파일 보내기·불러오기 두 줄만, 복구 코드로 불러오기 없음, v2.6 #120). 배포 워크플로는 저장소 변수(Settings → Secrets and variables → Actions → Variables) `KEEP_URL` 을 넘긴다. 로컬에서 보려면 `VITE_KEEP_URL=http://localhost:8787 npm run dev -- --port 7777` + `cd worker && npx wrangler dev --local --port 8787`(서버는 본 주소 `https://crowwan.github.io`·미리보기 `https://uri-jangbu-preview.pages.dev` 두 출처만 받으니 로컬 화면 확인은 CORS 를 여는 가짜 서버로)

### 배포 (자동, `.github/workflows/deploy.yml`, #52·#128)

워크플로는 린트·타입 검사·테스트를 통과한 뒤 배포한다. 미리보기와 본 주소는 **다른 출처(origin)** 다 (#128, ADR 008).

| 언제 | 어디로 | 바뀌는 것 |
|---|---|---|
| main 에 머지(push) | 미리보기 `https://uri-jangbu-preview.pages.dev/` (Cloudflare Pages 프로젝트 `uri-jangbu-preview`, 빌드 `APP_BASE=/`) | `wrangler pages deploy dist --branch main` — 운영 브랜치 배포라 고정 주소가 새 빌드로 바뀐다. 본 주소(gh-pages)는 건드리지 않는다 |
| 태그 `v*` push (`/release`) | 본 주소 `https://crowwan.github.io/dongari/` (GitHub Pages, `gh-pages` 브랜치) | 브랜치 전체를 새 빌드로 바꿈 → 옛 해시 파일·옛 `preview/`·`lab/` 이 지워진다 |

- 미리보기 배포는 레포 Secrets `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID`(보관 서버와 같은 값)를 쓴다. 토큰에 **Account · Cloudflare Pages · Edit** 권한이 있어야 한다.
  - 배포 전에 "미리보기 프로젝트 확인" 단계가 Cloudflare API 로 프로젝트를 읽어 보고, 없으면 처음 한 번 만든다(운영 브랜치 `main`). 손으로 만들려면 `cd worker && npx wrangler pages project create uri-jangbu-preview --production-branch main`.
  - 비밀값이 없으면 "미리보기 배포 비밀값 없음", 권한이 없으면 "미리보기 프로젝트 확인 실패"/"미리보기 프로젝트 만들기 실패"(HTTP 코드·Cloudflare 오류 코드와 토큰 권한 넣는 길 안내)로 끝난다 → 고치고 Actions 에서 Re-run.
  - 프로젝트가 처음 생긴 뒤 `*.pages.dev` 주소가 열리기까지 몇 분 걸릴 수 있다.
  - wrangler 는 `worker/` 에 잠근 버전을 쓴다(워크플로가 `worker/` 에서 `npm ci` 뒤 `npx wrangler`).
- 미리보기 빌드에만 `VITE_BUILD_SHA=${GITHUB_SHA::7}` 를 넘겨 설정 버전 줄이 "2.6.0 · 미리보기 abc1234" 로 보인다(본 주소 태그 빌드는 버전만, #135). 로컬에서 보려면 `APP_BASE=/ VITE_BUILD_SHA=abc1234 npm run build`.
- 미리보기는 `--branch main` 하나로만 올린다. 배포마다 생기는 배포별 주소(`https://<hash>.uri-jangbu-preview.pages.dev`)는 보관 서버가 받지 않으니(정확한 주소만 허용) QA 는 고정 주소에서 한다.
- 두 배포는 같은 concurrency 그룹에서 차례로 돈다(진행 중인 배포는 끊지 않음). 대기 중인 배포가 있을 때 또 하나가 오면 GitHub 이 대기 중인 쪽을 취소하니, 태그 배포가 취소됐으면 Actions 에서 다시 실행한다.
- gh-pages 의 옛 `preview/`(#128 전 미리보기 자리)는 더 채우지 않는다. 다음 릴리스(통째 교체) 때 정리된다. 실험 페이지 `lab/share-test` 는 #114(#130 으로 합침, 실기기 확인은 미리보기에서) 참고용으로 gh-pages 에 남아 있다(`npx gh-pages --add` 로 손으로 올린 것, 다음 릴리스 때 같이 지워진다 — `dev/archive/114-share-validation/README.md`).
- 본 주소 서비스 워커(범위 `/dongari/`)와 하위 폴더 (#54):
  - v2.0.0 의 본 주소 서비스 워커는 `/dongari/preview/` 화면 요청도 받아 본 주소 `index.html` 로 답했다. v2.1.0 부터 본 주소 빌드에만 `navigateFallbackDenylist`(`/dongari/preview`·`/dongari/lab` 아래, `src/pwa/pwaOptions.ts`)를 넣어 그 화면 요청은 네트워크로 보낸다. `lab/` 이 남아 있어 그대로 둔다.
  - **미리보기는 #128 부터 다른 출처라 이 간섭(서비스 워커 범위, 옛 캐시 정리가 미리보기 캐시를 지우던 일, 릴리스 때 미리보기가 지워지던 일)이 모두 해당 없다.** 미리보기 빌드(`/`)에는 제외 목록을 넣지 않는다(옆에 하위 폴더 화면이 없음).
- 수동 배포(비상용, Actions 가 막혔을 때만): `npm run deploy:preview`(= 워크플로 미리보기와 같은 동작, `worker/` 의 wrangler 로 — `cd worker && npm install` 과 `npx wrangler login` 또는 `CLOUDFLARE_ACCOUNT_ID`·`CLOUDFLARE_API_TOKEN` 셸 변수가 먼저 필요), `npm run deploy`(= 태그 배포와 같은 동작, 내 계정으로 gh-pages 에 바로 push).
- 미리보기 주의:
  - 미리보기는 본 주소와 다른 출처라 localStorage(`dongari:v2`·`dongari:keep`·`dongari:guide`·`dongari:install-offer`)·서비스 워커·홈 화면 앱이 따로다. 미리보기에서 적고 지운 것은 본 장부에 안 보인다.
  - 보관 서버는 같은 서버(`VITE_KEEP_URL` 그대로)를 쓰지만, 미리보기 출처의 요청은 KV 의 다른 자리(`preview:keep:<id>`·`preview:status:<id>`)에 둔다. 미리보기에서 어머니 복구 코드로 불러오면 본 사본이 아니라 미리보기 자리(대개 "없음")를 보고, 미리보기 자동 보관은 본 사본을 덮어쓰지 않는다. 보관 지켜보기 요약(`/v1/report`)은 본 자리(`status:`)만 본다.
  - 그래서 미리보기에서 본 장부 내용으로 QA 하려면 본 주소에서 기록 파일을 보내 미리보기에서 불러온다(복구 코드로는 못 가져온다). 기록 파일에는 복구 코드도 들어 있어 미리보기가 본 주소와 같은 코드를 쓰게 되지만, 서버 자리가 달라 본 사본을 덮지 않는다.

### 자동 보관 서버 배포 (Cloudflare Worker, `.github/workflows/worker.yml`, #97)

복구 코드 자동 보관(SPEC-006, ADR 005)의 서버. `worker/` 는 앱과 따로 있는 작은 패키지다(자기 `package.json`·`tsconfig.json`·테스트, 루트 lint·타입 검사·테스트·빌드는 `worker/` 를 보지 않는다).

| 언제 | 하는 일 |
|---|---|
| PR 에서 `worker/**` 가 바뀜 | `worker-test`(타입 검사·테스트)만. main 필수 체크 `test`(ci.yml)와 별개 |
| main 에 `worker/**` 변경이 들어옴, 또는 Actions → "보관 서버" → Run workflow | 테스트 → `wrangler deploy` |

- 이름 `uri-jangbu-keep`, KV 바인딩 `KEEP`(namespace id 는 `worker/wrangler.toml`). 계정 id 는 파일에 쓰지 않고 비밀값으로 넘긴다.
- 레포 Secrets 두 개가 필요하다: `CLOUDFLARE_API_TOKEN`(Workers 편집·KV 쓰기 권한 토큰. 미리보기 배포도 같은 토큰을 써서 Cloudflare Pages 편집 권한도 필요, #128), `CLOUDFLARE_ACCOUNT_ID`. 없으면 배포 단계가 "보관 서버 배포 비밀값 없음" 오류로 끝난다 → 넣고 Run workflow 로 다시 돌린다.
- 주소: `https://uri-jangbu-keep.<계정 서브도메인>.workers.dev`. 확인 방법은 둘 중 하나
  - Actions 배포 로그의 `wrangler deploy` 출력 마지막 주소
  - Cloudflare 대시보드 → Workers & Pages → `uri-jangbu-keep` → Domains
- 살아 있는지 확인(값은 아무 64자 16진수):
  ```bash
  curl -i "$KEEP_URL/"                                     # 404 (경로 없음 = 서버는 응답)
  curl -i -X OPTIONS -H 'Origin: https://crowwan.github.io' \
    "$KEEP_URL/v1/keep/$(printf x | shasum -a 256 | cut -c1-64)"   # 204 + Access-Control-Allow-Origin
  ```
  출처(Origin) 없이 `/v1/keep/...` 를 부르면 403 이 맞다. 미리보기 출처 `https://uri-jangbu-preview.pages.dev` 로 보내도 204 + 같은 출처(#128).
- 받는 출처와 KV 자리(#128, `worker/src/keep.ts` `ORIGIN_KEY_PREFIXES`): 본 주소 `https://crowwan.github.io` → `keep:<id>`·`status:<id>`, 미리보기 `https://uri-jangbu-preview.pages.dev` → `preview:keep:<id>`·`preview:status:<id>`. 정확한 주소만(배포별 `<hash>.uri-jangbu-preview.pages.dev`·http 는 403). CORS `Access-Control-Allow-Origin` 은 요청 출처 그대로(`Vary: Origin`).
- 요약 토큰(SPEC-007, #104): 보관 지켜보기 워크플로(#106)가 `GET /v1/report` 를 부를 때 쓴다. 넣지 않으면 요약은 늘 401.
  ```bash
  TOKEN=$(openssl rand -hex 32)
  cd worker && printf %s "$TOKEN" | npx wrangler secret put REPORT_TOKEN   # Worker 비밀값
  ```
  같은 값을 레포 Secrets `KEEP_REPORT_TOKEN` 에도 넣는다. 확인:
  ```bash
  curl -i -H "Authorization: Bearer $TOKEN" "$KEEP_URL/v1/report"   # 200 + { now, devices: [...] }
  curl -i "$KEEP_URL/v1/report"                                     # 401
  ```
- 로컬: `cd worker && npm install && npm test`, 실제 런타임으로 보려면 `npx wrangler dev --local --port 8787`(로컬 KV, 실제 KV 안 건드림).
- 수동 배포(비상용): `cd worker && CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npx wrangler deploy` (또는 `npx wrangler login` 뒤). 값은 셸에만, 파일에 쓰지 않는다.
- API 는 SPEC-006 기술 메모 "서버 API", 상태 신호·요약은 SPEC-007 기술 메모 "서버 API 추가".

### 보관 지켜보기 (`.github/workflows/keep-watch.yml`, SPEC-007, #106)

자동 보관이 밀리거나 서버가 죽었는지 개발자(나)가 메일로 알게 하는 일일 점검. 사용자 화면과는 상관없다.

| 언제 | 하는 일 |
|---|---|
| 매일 UTC 0시(KST 9시, `schedule`), 또는 Actions → "보관 지켜보기" → Run workflow | `GET $KEEP_URL/v1/report` 를 받아 `scripts/keep-watch.mjs` 가 판정 |

- 판정(SPEC-007 "판정" 표): 서버 응답 없음·5xx·형식 틀림, 토큰 틀림(401), 3일 넘게 밀림, 1MB 넘음 → **실패**. 자동 보관 꺼짐, 30일 넘게 신호 없음, 신호 하나도 없음 → 경고(성공).
- 실패하면 GitHub 가 실패 메일을 보낸다(내 계정 Settings → Notifications → Actions 에서 메일 알림이 켜져 있어야 한다. 예약 실행의 알림은 워크플로를 만든 사람, cron 을 다른 사람이 고쳤으면 그 사람에게 간다). 실행 화면 요약(Summary)에 결과·실패/경고 목록·기기별 표(시각은 KST)가 남는다.
- 필요한 값: 레포 Secrets `KEEP_REPORT_TOKEN`(넣는 법은 위 "요약 토큰"), 저장소 변수 `KEEP_URL`(앱 배포와 같은 값). 없으면 "보관 지켜보기 비밀값 없음/변수 없음" 오류로 끝난다 → 넣고 Run workflow 로 다시 돌린다.
- 판정은 `scripts/keepWatch.ts`(순수 함수, 테스트 `scripts/keepWatch.test.ts`, 루트 `npm test` 가 같이 돈다). `keep-watch.mjs` 는 Node 24 가 이 파일의 타입만 지우고 불러 쓴다 — 빌드·`npm ci` 없음. 그래서 `keepWatch.ts` 에는 타입 지우기로 없어지는 문법만 쓰고(enum 등 금지, `erasableSyntaxOnly`), 다른 패키지를 불러오지 않는다.
- 로컬에서 돌리기: `KEEP_URL=… KEEP_REPORT_TOKEN=… node scripts/keep-watch.mjs` (토큰은 셸에만. 출력에 토큰은 찍히지 않는다)
- 레포에 60일 동안 활동(커밋 등)이 없으면 GitHub 가 예약 실행을 멈춘다(멈추기 전에 메일로 알림). 멈췄으면 Actions → "보관 지켜보기" → 위쪽 안내의 [Enable workflow] 로 다시 켜고, Run workflow 로 한 번 돌려 본다.

## 폴더 구조

```
docs/          기획(prd, specs, decisions, design, qa-checklist)
dev/active/    이슈별 작업 메모 (머지 후 dev/archive/)
src/
├── main.tsx     진입점: 저장소를 한 번 읽어(LoadResult) AppRoot(features/practice: 첫 실행 물음·연습 장부·진짜 App 갈아 끼우기)에 넘김, 개발 모드 카탈로그 분기
├── App.tsx      앱 뼈대: 첫 실행(새 장부 만들기) / 장부(첫 화면)·내역 적기·고치기·설정·월 정리·올해 결산·새 장부 만들기 화면 전환(탭 없음, features/useScreenHistory: 뒤로 버튼·닫기 전 확인·선택 창 openSheet/closeSheet·확인 창 openDialog/closeDialog, features/useScreenHeading: 화면이 바뀌면 h1 포커스·브라우저 제목) + 저장 상태 안내
├── domain/      v2 데이터 타입과 계산 순수 함수 (Entry, Ledger, Book, StoredData(schemaVersion 3, 장부 여러 개), book.ts 지금 장부·장부 잔액·종류별 이월금 문구, ledger.ts 장부, report.ts 월 정리·올해 결산, entryDate.ts 날짜(일) 검증·날짜순)
├── storage/     v2 저장 계층 (LedgerRepository, LocalStorage·Memory 구현, 저장 성공 알림 NotifyingRepository(자동 보관용), 스키마 가드, 마이그레이션(v2 → v3 장부 하나로, 옛 원본 보관), 백업 파일 만들기·읽기)
├── features/    화면 단위 (books: 장부 고르기 창 목록·새 장부 만들기, ledger: 장부·새 연도 시작·내역 적기(하나씩 채우기 entrySteps)·고치기·useLedger, settings, report: 월 정리·올해 결산(단톡방용 요약·결산표)·사진으로 저장·사진 보내기, report/sheet: v1 연말 양식(인라인 hex 예외), storage: 저장 안내 문구, backup: 백업 보내기·불러오기 흐름, install: 설정 [홈 화면에 추가] 줄 규칙·설치 제안·방법 안내·누름 동작 useInstallAction, 첫 장부 뒤 장부 위 권하기 카드 InstallOfferCard·상태 dongari:install-offer(SPEC-002 #135), version: 설정 버전 줄 값(__APP_VERSION__ + 미리보기 VITE_BUILD_SHA)·새 버전 받음(controllerchange, #135), keep: 복구 코드·암호화·자동 보관기·복구 코드로 불러오기(SPEC-006), guide: 진짜 장부 복구 코드 안내 말풍선(4번) 규칙·기기 상태 dongari:guide(SPEC-008), practice: 첫 실행 물음·연습 장부(메모리 저장소로 그린 App + 연습 띠·단계 말풍선 practiceSteps·끝 화면, SPEC-008 #132), useScreenHistory·BackToLedger)
├── pwa/         홈 화면 추가·오프라인 설정 (vite-plugin-pwa 옵션, manifest 색은 tokens.css 에서)
├── ui/          기본 컴포넌트 (Button, Icon, ListRow, OptionList, SegmentedControl, BottomSheet, MonthPicker, DayInput, MonthButton, EntryCard, SavedEntries, AmountDisplay, IconButton, NoticeBar, BalanceCard, MonthStepper, …, keyboard: 아이폰 키패드가 뜬 동안 아래 고정 버튼을 질문 바로 아래로, modalLayer: 창이 떠 있는 동안 뒤 화면 inert·포커스 옮기기/돌려주기, CoachMark: 꼬리 달린 안내 말풍선)
├── styles/      tokens.css (디자인 토큰, 값의 유일한 기준), font.css + fonts/ (Pretendard 가변 서브셋, scripts/subset-font.py 로 만든다)
├── catalog/     디자인 카탈로그 `/#/dev/catalog` (개발 모드 전용, 프로덕션 번들 제외)
└── test/        Vitest 설정, 여러 테스트가 같이 쓰는 장부 기록(ledgerFixtures: v1 예시 1년치, 장부·저장 데이터 만들기)
public/icons/  앱 아이콘 (scripts/make-icons.mjs 가 토큰 색으로 만든다)
scripts/       아이콘·글꼴 만들기, 보관 지켜보기(keep-watch.mjs + 판정 keepWatch.ts, 워크플로 keep-watch.yml 이 돌린다)
worker/        자동 보관 서버 (Cloudflare Worker + KV, 따로 있는 패키지). src/index.ts 진입점(기본 내보내기만), src/keep.ts 요청 처리, wrangler.toml
```
