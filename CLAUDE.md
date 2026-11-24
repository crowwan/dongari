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

- 최신 릴리스: v2.7.0 (2026-10-16, 홈 화면 추가 그림 안내·연습 끝 설치 묻기·카톡 안 안내·예전에 쓴 항목 더 보기, #152). 진행 중 마일스톤 v2.8: SPEC-010 회비 낸 분과 엑셀 주고받기(#158, 하위 #159~#169 모두 머지, 엑셀 라이브러리 ADR 009, 저장 형식 v4) + SPEC-011 보관본 날짜별 사본·서버 밖 사본(#184, 하위 #185·#186, ADR 010 — 앱 화면은 그대로, 되살리기는 개발자 꺼내기 스크립트). 이모 실제 엑셀은 연락처·계좌가 있어 레포(공개)에 넣지 않는다 — 테스트는 지어낸 표만. 갤럭시 실기기 확인은 #141(backlog). 미리보기 https://uri-jangbu-preview.pages.dev/ (Cloudflare Pages, #128)
- 끝난 스펙: SPEC-001 한 줄 장부 입력, SPEC-002 안전한 저장과 백업, SPEC-003 월 정리와 올해 결산
- v2.0.0 은 갤럭시 실기기 QA(홈 화면 추가·오프라인, 사진 저장 Download 앨범, 백업 보내기·불러오기)와 어머니 사용성 테스트(SPEC-001 AC-13) 전에 배포했다. 남은 확인은 릴리스 이슈 #40 체크리스트
- v2.6 에서 끝낸 스펙: SPEC-007 자동 보관 지켜보기, SPEC-008 처음 쓰는 분 연습 장부, SPEC-001·002·003·006 v2.6 보강
- backlog 스펙: SPEC-004 적어 둔 글로 한 번에 적기 (draft — 1단계: 글 붙여넣기·공유 받기 → 확인 화면, 사진 인식기는 엔진 비교 후 2단계. 사진 → 글 추출이 동작할 때 다시 본다)
- GitHub Project: crowwan #3
- v2 는 거래 기록 모델이다 (`docs/prd.md` 데이터 모델). v1 코드는 #16 에서 모두 정리했다 (v1 연말 양식은 `features/report/sheet` 로 옮겨 `YearReport` 를 그린다).

## 스택

- React 19 + TypeScript + Vite 7, 순수 CSS + 디자인 토큰(`src/styles/tokens.css`, 개인 디자인 시스템 역할 구조). Tailwind 는 #12 에서 걷어냄
- 글꼴 Pretendard(앱에 포함, 오프라인 미리 저장), 아이콘 lucide-react (#45)
- 저장: localStorage (버전 있는 스키마, 지금 v4 = 장부 여러 개 + 회원 명단·월 회비·낸 분(SPEC-010 #159), `docs/decisions/001-storage.md`)
- 월 정리·올해 결산 사진: html2canvas (누를 때·공유 창이 되는 폰은 화면을 열 때 미리 불러온다) → `canvas.toBlob` → [사진으로 저장] Blob 주소 `<a download>`(아이폰·아이패드는 공유 시트 "이미지 저장"으로 사진 앱에, #58) / [사진 보내기] 폰 공유 창 `navigator.share({ files })`, `canShare` 가 거짓이면 버튼 숨김 (v2.6 #130)
- 엑셀 읽기·쓰기(SPEC-010): SheetJS CE 0.20.3 을 **SheetJS CDN tgz** 로 설치(npm 레지스트리 `xlsx` 아님, ADR 009). 엑셀 기능을 누를 때 동적 import 로만 받고, 부르는 곳은 어댑터 `features/excel/sheetjs.ts` 하나. `npm run build` 끝의 `scripts/check-excel-bundle.mjs` 가 첫 화면 파일에 SheetJS 가 없고 서비스 워커가 그 조각을 미리 받는지, SheetJS 조각이 하나는 있는지 본다(아니면 빌드 실패, #165·#166). 엑셀 읽은 내용 확인 화면과 읽는 규칙도 화면을 열 때 받는 조각(`ExcelImportScreen`, `ExcelImportSlot` 이 동적 import)이라 첫 화면에는 입구·읽는 중·안내 모습만 있다(#166). 내보내기 규칙·파일 만들기도 누를 때 받는 조각(`excelExport`, `useExcelExport` 가 동적 import)이고 첫 화면에는 설정 줄과 선택 창만 있다(#167)
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
- 미리보기 빌드를 로컬에서 보기: `npm run build:preview && APP_BASE=/ npx vite preview --port 7777` → `http://localhost:7777/` (manifest `scope`·서비스 워커 범위가 `/`. `vite preview` 도 설정의 `base` 를 따르므로 `APP_BASE=/` 를 같이 준다 — 없으면 `/dongari/` 에서만 열린다)
- 개발 확인 화면 `/#/dev/env` (SPEC-009 기술 확인, #141): 브라우저 값(user agent·카톡 안·standalone·설치 이벤트·공유)과 클립보드·openExternal·크롬 intent 시험, [결과 복사]. **개발 모드와 미리보기 빌드(`APP_BASE=/` → vite define `__PREVIEW_BUILD__`)에서만** 열리고 본 주소 빌드 번들에는 없다.
  - 여는 법: 미리보기 `https://uri-jangbu-preview.pages.dev/#/dev/env`(폰에서는 카톡 나와의 채팅에 이 주소를 보내 누르면 카톡 안에서도 열린다), 개발 서버 `http://localhost:7777/dongari/#/dev/env`, 로컬 미리보기 빌드 `http://localhost:7777/#/dev/env`. 크롬 intent 로 넘어온 주소는 해시 대신 `?dev=env`.
  - 장부(localStorage)는 건드리지 않는다. 결과 기록은 그 탭의 sessionStorage(`dongari-dev:env-log`)에만.
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
  - 보관 서버는 같은 서버(`VITE_KEEP_URL` 그대로)를 쓰지만, 미리보기 출처의 요청은 KV 의 다른 자리(`preview:keep:<id>`·`preview:status:<id>`, 날짜별·달별 사본도 `preview:snap:`·`preview:month:`)에 둔다. 미리보기에서 어머니 복구 코드로 불러오면 본 사본이 아니라 미리보기 자리(대개 "없음")를 보고, 미리보기 자동 보관은 본 사본을 덮어쓰지 않는다. 보관 지켜보기 요약(`/v1/report`)은 본 자리(`status:`)만 본다.
  - 그래서 미리보기에서 본 장부 내용으로 QA 하려면 본 주소에서 기록 파일을 보내 미리보기에서 불러온다(복구 코드로는 못 가져온다). 기록 파일에는 복구 코드도 들어 있어 미리보기가 본 주소와 같은 코드를 쓰게 되지만, 서버 자리가 달라 본 사본을 덮지 않는다.

### 자동 보관 서버 배포 (Cloudflare Worker, `.github/workflows/worker.yml`, #97)

복구 코드 자동 보관(SPEC-006, ADR 005)의 서버. `worker/` 는 앱과 따로 있는 작은 패키지다(자기 `package.json`·`tsconfig.json`·테스트, 루트 lint·타입 검사·테스트·빌드는 `worker/` 를 보지 않는다).

| 언제 | 하는 일 |
|---|---|
| PR 에서 `worker/**` 가 바뀜 | `worker-test`(타입 검사·테스트)만. main 필수 체크 `test`(ci.yml)와 별개 |
| main 에 `worker/**` 변경이 들어옴, 또는 Actions → "보관 서버" → Run workflow | 테스트 → `wrangler deploy` → 내보내기 토큰 넣기(SPEC-011 #186) |

- 이름 `uri-jangbu-keep`, KV 바인딩 `KEEP`(namespace id 는 `worker/wrangler.toml`). 계정 id 는 파일에 쓰지 않고 비밀값으로 넘긴다.
- 레포 Secrets 두 개가 필요하다: `CLOUDFLARE_API_TOKEN`(Workers 편집·KV 쓰기 권한 토큰. 미리보기 배포도 같은 토큰을 써서 Cloudflare Pages 편집 권한도 필요, #128), `CLOUDFLARE_ACCOUNT_ID`. 없으면 배포 단계가 "보관 서버 배포 비밀값 없음" 오류로 끝난다 → 넣고 Run workflow 로 다시 돌린다. 서버 밖 사본용 `KEEP_EXPORT_TOKEN` 은 아래 "내보내기 토큰"(없으면 배포는 되고 "내보내기 토큰 없음" 경고만).
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
- 날짜별·달별 사본(SPEC-011 1절, #185, ADR 010): `PUT /v1/keep/<id>` 는 새 값을 쓰기 전에, 지금 최신본의 보관일(한국 시간)이 오늘보다 앞이면 `snap:<id>:<YYYY-MM-DD>`(TTL 31일 = 2,678,400초)로, 보관 달이 이번 달이 아니면 `month:<id>:<YYYY-MM>`(TTL 400일 = 34,560,000초)로도 복사한다. 그래서 사본은 그날(그달) 마지막으로 보관된 모습이고, 고치지 않은 날은 사본이 없다.
  - 최신본·사본에는 KV metadata `{ savedAt }`(서버가 받은 시각, 날 가르기 기준)을 둔다. 이 기능 전에 저장된 최신본은 metadata 가 없어 겉봉투 `savedAt` 으로 날을 정한다(그 폰 시계가 미래면 사본을 만들지 않는다, #186).
  - 복사(또는 최신본 읽기)가 실패하면 최신본을 바꾸지 않고 503. 최신본 쓰기가 실패해도(KV 쓰기 한도 등) CORS 있는 503(#186). 폰은 실패로 보고 다시 보낸다.
  - 미리보기 출처는 `preview:snap:`·`preview:month:`. 오래된 사본은 KV 가 TTL 로 지운다(정리 작업 없음).
  - `DELETE /v1/keep/<id>`([지우기])는 최신본·상태 신호와 그 이름의 사본(KV list 로 찾음)을 모두 지운다. KV list 는 최대 60초 늦게 보여서, 사본이 생기고 1분 안에 지우면 그 사본은 TTL 까지 남을 수 있다.
  - 개발자용 읽기(꺼내기 스크립트가 부른다, 출처 검사 그대로): `GET /v1/keep/<id>/history` → `{ latest?: { savedAt }, days: [{ date, savedAt }], months: [{ month, savedAt }] }`(최신 것부터, KV list 의 metadata 로 만들고 본문은 읽지 않음), `GET /v1/keep/<id>?day=YYYY-MM-DD`·`?month=YYYY-MM` → 그 사본(없으면 404, 형식이 틀리거나 둘을 함께 주면 400). 배포 뒤 확인: `curl -s -H 'Origin: https://crowwan.github.io' "$KEEP_URL/v1/keep/$(printf x | shasum -a 256 | cut -c1-64)/history"` → `{"days":[],"months":[]}`
- 요약 토큰(SPEC-007, #104): 보관 지켜보기 워크플로(#106)가 `GET /v1/report` 를 부를 때 쓴다. 넣지 않으면 요약은 늘 401.
  ```bash
  TOKEN=$(openssl rand -hex 32)
  cd worker && printf %s "$TOKEN" | npx wrangler secret put REPORT_TOKEN   # Worker 비밀값
  ```
  같은 값을 레포 Secrets `KEEP_REPORT_TOKEN` 에도 넣는다. 확인:
  ```bash
  curl -i -H "Authorization: Bearer $TOKEN" "$KEEP_URL/v1/report"   # 200 + { now, devices: [...], export }
  curl -i "$KEEP_URL/v1/report"                                     # 401
  ```
- 내보내기 토큰(SPEC-011 2절, #186, ADR 010): 비공개 백업 레포의 주간 워크플로(아래 "서버 밖 주간 사본")가 `GET /v1/export` 를 부를 때 쓴다. 요약 토큰과 별개(요약 토큰으로는 안 열림). 넣지 않으면 내보내기는 늘 401.
  - `GET /v1/export` → `{ exportedAt, items: [{ id, savedAt, envelope }] }`: 본 자리 최신본만(미리보기·날짜별·달별 사본 제외), id 순, `savedAt` 은 서버 시각(옛 최신본은 겉봉투), `envelope` 은 겉봉투 객체. 출처 검사·CORS 없음, GET 만(그 밖 405). 주고 나서 KV `export:last` 에 `{ at, count }`(못 쓰면 503), 요약 `/v1/report` 의 `export: { lastAt, count } | null` 이 이것. 최신본 목록은 KV list 한 장(1,000개)만 읽고, 잘리면(`list_complete` false) 잘린 목록 대신 503(#194 리뷰).
  - 값은 `openssl rand -hex 32` 로 만들어 **레포 Secrets `KEEP_EXPORT_TOKEN`** 과 **백업 레포 Secrets `EXPORT_TOKEN`** 에 같게 넣는다. Worker 비밀값 `EXPORT_TOKEN` 은 `worker.yml` 이 배포 뒤 "내보내기 토큰 넣기" 단계에서 `KEEP_EXPORT_TOKEN` 을 표준 입력으로 넣는다(배포마다, 값은 로그에 안 찍힘). 레포 비밀값을 바꿨으면 Actions → "보관 서버" → Run workflow. 레포 비밀값이 없으면 그 단계는 경고만 하고 건너뛴다(이미 넣은 Worker 비밀값은 남음).
  - 확인: `curl -s -o /dev/null -w '%{http_code}\n' "$KEEP_URL/v1/export"` → 401(토큰 없음). 토큰을 넣은 확인은 백업 레포 워크플로를 손으로 돌려 본다(토큰을 셸에 꺼내지 않게).
- 로컬: `cd worker && npm install && npm test`, 실제 런타임으로 보려면 `npx wrangler dev --local --port 8787`(로컬 KV, 실제 KV 안 건드림). 날 바뀜을 흉내 내려면 로컬 KV 의 최신본을 어제 보관한 것으로 넣고 PUT 한다: `npx wrangler kv key put "keep:<id>" "$(cat 겉봉투.json)" --binding KEEP --local --metadata '{"savedAt":"<어제 ISO 시각>"}'` (`--local` 을 빼면 실제 KV 에 쓰니 주의. `wrangler dev` 에 `--persist-to` 를 줬으면 여기도 같은 값).
- 수동 배포(비상용): `cd worker && CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npx wrangler deploy` (또는 `npx wrangler login` 뒤). 값은 셸에만, 파일에 쓰지 않는다.
- API 는 SPEC-006 기술 메모 "서버 API", 상태 신호·요약은 SPEC-007 기술 메모 "서버 API 추가", 날짜별·달별 사본은 SPEC-011 1절, 내보내기는 SPEC-011 2절.

### 보관 지켜보기 (`.github/workflows/keep-watch.yml`, SPEC-007, #106)

자동 보관이 밀리거나 서버가 죽었는지 개발자(나)가 메일로 알게 하는 일일 점검. 사용자 화면과는 상관없다.

| 언제 | 하는 일 |
|---|---|
| 매일 UTC 0시(KST 9시, `schedule`), 또는 Actions → "보관 지켜보기" → Run workflow | `GET $KEEP_URL/v1/report` 를 받아 `scripts/keep-watch.mjs` 가 판정 |

- 판정(SPEC-007 "판정" 표): 서버 응답 없음·5xx·형식 틀림, 토큰 틀림(401), 3일 넘게 밀림, 1MB 넘음, 서버 밖 사본 내보내기가 8일 넘게 없음("서버 밖 사본이 N일째 없어요", SPEC-011 #186) → **실패**. 자동 보관 꺼짐, 30일 넘게 신호 없음, 신호 하나도 없음, 내보낸 적 없음("아직 서버 밖 사본이 없어요" — 요약에 `export` 칸이 없는 예전 서버도) → 경고(성공). 실행 요약 끝에 마지막 내보내기 때·보관본 개수 한 줄.
- 실패하면 GitHub 가 실패 메일을 보낸다(내 계정 Settings → Notifications → Actions 에서 메일 알림이 켜져 있어야 한다. 예약 실행의 알림은 워크플로를 만든 사람, cron 을 다른 사람이 고쳤으면 그 사람에게 간다). 실행 화면 요약(Summary)에 결과·실패/경고 목록·기기별 표(시각은 KST)가 남는다.
- 필요한 값: 레포 Secrets `KEEP_REPORT_TOKEN`(넣는 법은 위 "요약 토큰"), 저장소 변수 `KEEP_URL`(앱 배포와 같은 값). 없으면 "보관 지켜보기 비밀값 없음/변수 없음" 오류로 끝난다 → 넣고 Run workflow 로 다시 돌린다.
- 판정은 `scripts/keepWatch.ts`(순수 함수, 테스트 `scripts/keepWatch.test.ts`, 루트 `npm test` 가 같이 돈다). `keep-watch.mjs` 는 Node 24 가 이 파일의 타입만 지우고 불러 쓴다 — 빌드·`npm ci` 없음. 그래서 `keepWatch.ts` 에는 타입 지우기로 없어지는 문법만 쓰고(enum 등 금지, `erasableSyntaxOnly`), 다른 패키지를 불러오지 않는다.
- 로컬에서 돌리기: `KEEP_URL=… KEEP_REPORT_TOKEN=… node scripts/keep-watch.mjs` (토큰은 셸에만. 출력에 토큰은 찍히지 않는다)
- 레포에 60일 동안 활동(커밋 등)이 없으면 GitHub 가 예약 실행을 멈춘다(멈추기 전에 메일로 알림). 멈췄으면 Actions → "보관 지켜보기" → 위쪽 안내의 [Enable workflow] 로 다시 켜고, Run workflow 로 한 번 돌려 본다.

### 보관본 꺼내기 (개발자용, `scripts/keep-rescue.mjs`, #154, SPEC-011 #185·#186)

사용자가 앱에서 [복구 코드로 불러오기]를 못 할 때(카톡 안 브라우저, 앱 오류 등) 복구 코드를 받아 내가 대신 서버 보관본을 꺼내 기록 파일로 만들어 준다. 잘못 지우거나 망가진 상태가 보관됐으면 `--list` 로 서버의 날짜별·달별 사본을 보고 그 전 날·달 사본을 골라 꺼낸다(SPEC-011). 서버가 통째로 없어졌거나 31일·400일보다 옛 모습이 필요하면 비공개 백업 레포의 주간 사본 파일을 `--file` 로 푼다(아래 "서버 밖 주간 사본"). 서버에는 `GET` 만 보낸다(최신본 `/v1/keep/<id>`, 고른 사본 `?day=`·`?month=`, 목록 `/v1/keep/<id>/history`, 출처 `https://crowwan.github.io` 라 본 자리) — 쓰기·지우기 없음. `--file` 은 서버를 부르지 않는다.

```bash
KEEP_URL=$(gh variable get KEEP_URL) node scripts/keep-rescue.mjs                    # 최신본. 코드를 물으면 붙여 넣고 Enter
KEEP_URL=$(gh variable get KEEP_URL) node scripts/keep-rescue.mjs --list             # 있는 사본 목록
KEEP_URL=$(gh variable get KEEP_URL) node scripts/keep-rescue.mjs --day 2026-11-21   # 그 날 사본
KEEP_URL=$(gh variable get KEEP_URL) node scripts/keep-rescue.mjs --month 2026-10    # 그 달 사본
node scripts/keep-rescue.mjs --file ../dongari-keep-backup/keep/<id>.json            # 백업 레포 파일 (KEEP_URL 필요 없음)
```

- `--list`: 최신본·날짜별(만든 날부터 31일 남음)·달별(400일 남음) 사본을 최신 것부터, 보관 시각(한국 시간)과 사본마다 풀어 본 장부 이름·기록 건수로 보인다(목록 하나 + 사본마다 GET 하나). 못 푼 사본은 그 줄에 이유를 적는다(목록을 받은 사이 사라진 사본은 "서버에서 사라졌어요"). 파일은 만들지 않는다.
- `--day YYYY-MM-DD`·`--month YYYY-MM`: 그 사본으로 기록 파일을 만든다. 옵션은 하나만 쓰고, 날·달 형식이 틀리거나(달력에 없는 날 포함) 모르는 옵션이면 쓰는 법을 찍고 멈춘다(코드를 묻기 전에).
- `--file <keep/<id>.json 경로>`: 백업 레포 파일(겉봉투 그대로)을 푼다. 다른 옵션과 같이 못 쓰고, 파일은 코드를 묻기 전에 읽는다. 파일 이름이 이 코드의 `<id>.json` 이 아니면 "이 코드의 파일이 아니에요. 이 코드의 파일은 백업 레포의 keep/1a2b3c4d….json 이에요"(id 앞 8자)로 멈춘다 — 어느 파일인지 모르면 아무 파일로 한 번 돌려 찾는다. 지난 주 모습은 백업 레포 README "되살리는 법"(이름은 `<id>.json` 그대로).
- 코드는 인자(`node scripts/keep-rescue.mjs HK7M-…`)로도 되지만 셸 기록에 남으니 표준 입력을 쓴다. 출력에 코드는 찍히지 않는다.
- 레포 밖 `~/Downloads`(없으면 홈)에 기록 파일을 만들고 꺼낸 사본·전체 경로·보관 시각·장부 이름·기록 건수를 찍는다. 이름은 최신본 `우리장부-기록-YYYY-MM-DD-최신.txt`(보관한 날, 한국 시간 — 같은 날 `--day` 파일과 겹치지 않게, #186), `--day` 는 `우리장부-기록-YYYY-MM-DD.txt`, `--month` 는 `우리장부-기록-YYYY-MM.txt`, `--file` 은 `우리장부-기록-YYYY-MM-DD-주간사본.txt`. 다른 폴더는 `RESCUE_DIR=… ` 로. 같은 이름 파일이 있으면 덮어쓰지 않고 멈춘다.
- 파일에는 그 사람 장부 전체와 복구 코드가 평문으로 들어 있다. 레포는 공개라 레포 안에 두지 않는다(`.gitignore` 에 `우리장부-기록-*.txt` 를 넣어 두었지만 안전망일 뿐).
- 이 파일을 카톡으로 보내 앱 설정의 [기록 파일 불러오기]로 열게 한다. 불러오면 파일 속 복구 코드로 자동 보관이 같은 자리를 이어 쓴다.
- **다 보냈으면 파일을 지운다** (복구 코드가 들어 있음).
- 안내: 코드 형식 틀림 / 보관본 없음(404, 목록이 비었을 때도) / 고른 날·달 사본 없음(404, `--list` 로 보라고) / 목록 경로가 없는 예전 서버(배포 확인) / 코드가 안 맞음(풀기 실패) / 서버 오류(HTTP 코드) / 연결 실패 / (`--file`) 파일을 못 읽음·이 코드의 파일이 아님·보관본 모양이 아님이 각각 다르고, 실패면 종료 코드 1.
- **주의: 받은 코드로 내 브라우저(본 주소)에서 [복구 코드로 불러오기]를 하지 않는다.** 같은 서버 자리를 쓰게 돼 내 쪽 자동 보관이 그 사람 보관본을 덮어쓸 수 있다. 꺼내기는 이 스크립트로만.
- 푸는 방식은 `scripts/keepRescue.ts`(순수 함수, `keepWatch.ts` 와 같은 제약: 타입 지우기 문법만, 다른 패키지·src 불러오기 없음). 그래서 `keepCrypto.ts`·`recoveryCode.ts` 의 암호 방식·코드 정규화를 옮겨 두었고, `scripts/keepRescue.test.ts` 가 앱의 `sealKeep`·`keepIdOf` 로 만든 값을 풀어 `readBackup` 으로 읽어 본다 — 앱 쪽 방식을 바꾸면 이 테스트가 깨지니 같이 고친다.
- `scripts/*.test.ts` 는 앱 코드를 불러오고 vitest(jsdom)에서 돌아서 타입 검사는 `tsconfig.app.json` 이 한다(`tsconfig.node.json` 은 테스트를 뺀 스크립트와 `ops/keep-backup/scripts`).

### 서버 밖 주간 사본 (비공개 레포 `crowwan/dongari-keep-backup`, SPEC-011 2절, #186, ADR 010)

보관 서버(Cloudflare 한 계정)가 통째로 사라져도 남게, 비공개 GitHub 레포가 주 1회 본 자리 최신본 전부(암호문)를 끌어와 커밋한다. 커밋 이력이 곧 주간 사본이다. 사용자 화면과는 상관없다.

| 언제 | 하는 일 |
|---|---|
| 매주 일요일 23:00 UTC(월요일 08:00 KST), 또는 백업 레포 Actions → "주간 보관본" → Run workflow | `GET $KEEP_URL/v1/export` → `keep/<id>.json`(겉봉투 그대로)·`index.json`(id·savedAt·bytes), 목록에 없는 id 파일은 지움(한 번에 1개까지), 바뀐 게 있으면 "주간 보관본 YYYY-MM-DD" 커밋(그 레포 `GITHUB_TOKEN`) |

- **파일 원본은 이 레포 `ops/keep-backup/`**(`.github/workflows/backup.yml`·`README.md`·`scripts/backup.mjs`·`scripts/backupPlan.ts`). 고칠 때는 여기서 PR 로 리뷰·테스트(`scripts/keepBackupPlan.test.ts`, 루트 `npm test`)하고, 머지 뒤 백업 레포에 손으로 옮긴다(같은 경로로 복사해 커밋·push).
- 백업 레포 값: Secrets `EXPORT_TOKEN`(이 레포 `KEEP_EXPORT_TOKEN` 과 같은 값, 위 "내보내기 토큰"), Variables `KEEP_URL`(이 레포와 같은 값).
- 실패하면(토큰 401·예전 서버 404·서버 오류·응답 모양 틀림·id 모양 틀림) 아무것도 쓰지 않고 GitHub 실패 메일. **서버가 0개를 줬는데 레포에 파일이 있거나, 지울 파일이 2개 이상이면 지우지 않고 실패**한다(서버 KV 를 잃은 뒤 폰 몇 대만 다시 보관했을 수 있음, #194 리뷰) — 정말 지울 일이면 백업 레포 README "지우지 않고 멈췄을 때"(문구에 나온 id 파일을 손으로 `git rm`·push 뒤 다시 실행).
- 알림의 나눔: 서버가 답을 줄 때 `export:last` 를 쓰므로, 워크플로가 **서버를 부르지 못하면**(예약 실행 멈춤·꺼짐, 토큰 401, 서버 오류) 보관 지켜보기가 8일 뒤 실패로 알리고, **답을 받은 뒤 실패하면**(모양 거절·지우기 멈춤·커밋·push 실패) 백업 레포 실패 메일만 온다.
- 되살리기: 위 "보관본 꺼내기" `--file`. 지워 달라는 요청(커밋 이력까지)은 백업 레포 README "지워 달라는 요청을 받았을 때"(`git filter-repo` 로 그 id 파일을 이력에서 지우고 force push).
- 로컬에서 변환만 확인: `wrangler dev --local`(가짜 `--var EXPORT_TOKEN:…`) 에 보관본을 올리고, 스크래치 폴더에 `ops/keep-backup` 을 복사해 `KEEP_URL=http://localhost:8787 EXPORT_TOKEN=… node scripts/backup.mjs`. 실제 서버·토큰은 쓰지 않는다.

## 폴더 구조

```
docs/          기획(prd, specs, decisions, design, qa-checklist)
dev/active/    이슈별 작업 메모 (머지 후 dev/archive/)
src/
├── main.tsx     진입점: 저장소를 한 번 읽어(LoadResult) AppRoot(features/practice: 첫 실행 물음·연습 장부·진짜 App 갈아 끼우기)에 넘김, 개발 모드 카탈로그·개발 모드/미리보기 개발 확인 화면 분기
├── App.tsx      앱 뼈대: 첫 실행(새 장부 만들기) / 장부(첫 화면)·내역 적기·고치기·설정·월 정리·올해 결산·새 장부 만들기·회비 표 화면 전환(탭 없음, features/useScreenHistory: 뒤로 버튼·닫기 전 확인·선택 창 openSheet/closeSheet·확인 창 openDialog/closeDialog, features/useScreenHeading: 화면이 바뀌면 h1 포커스·브라우저 제목) + 저장 상태 안내
├── domain/      v2 데이터 타입과 계산 순수 함수 (Entry, Ledger, Book, Member, StoredData(schemaVersion 4, 장부 여러 개 + 회원 명단·월 회비·낸 분), book.ts 지금 장부·장부 잔액·종류별 이월금 문구, ledger.ts 장부(낸 분 붙이기 assignPayers = 기록 칸은 손대지 않고 낸 분만, 검사는 updateEntry set 과 같은 checkPayers, SPEC-010 7절 #164), report.ts 월 정리·올해 결산, entryDate.ts 날짜(일) 검증·날짜순, dues.ts 회비 기록 판정 isDuesEntry·낸 분 똑같이 나누기 splitEvenly(SPEC-010), duesTable.ts 회비 표 계산: 칸 채우기·입금 짝짓기·덜 낸 돈·요약·낸 분 없는 회비·그 해 월 회비 monthlyFeeOf(SPEC-010 2절 #160), members.ts 회원 명단·월 회비·회비 표 시작 달 바꾸기와 달(YYYY-MM) 계산(SPEC-010 6절 #161)·쉬는 기간 넣기·빼기 restMember·resumeMember(5절 #163)·"낸 분을 안 적은 회비" 카드 숨기기 hideUnassignedDues(7절 #164), payers.ts 내역 적기·고치기 "누가 냈어요?" 묻는 장부 asksPayers·목록·[지난번 낸 분] payerChoices(SPEC-010 3절 #162))
├── storage/     v2 저장 계층 (LedgerRepository, LocalStorage·Memory 구현, 저장 성공 알림 NotifyingRepository(자동 보관용), 스키마 가드, 마이그레이션(v2 → v3 장부 하나로, v3 → v4 번호만, 옛 원본 보관), 백업 파일 만들기·읽기)
├── features/    화면 단위 (books: 장부 고르기 창 목록·새 장부 만들기, ledger: 장부·새 연도 시작·내역 적기(하나씩 채우기 entrySteps)·고치기·useLedger, 회비 적기(SPEC-010 3절 #162: "누가 냈어요?" PayerPicker·한 분씩 금액 PayerSharesPage·회원 넣기 창 AddPayerSheet·몫 정하기 payerShares·넘길 것 entryDues), settings, report: 월 정리·올해 결산(단톡방용 요약·결산표)·사진으로 저장·사진 보내기, report/sheet: v1 연말 양식(인라인 hex 예외), storage: 저장 안내 문구, backup: 백업 보내기·불러오기 흐름, install: 설정 [홈 화면에 추가] 줄 규칙·설치 제안·누름 동작 useInstallAction, 그림으로 따라 하는 방법 안내 InstallGuide(문구·순서 installGuideSteps 한 곳)·브라우저 화면 모형 BrowserPicture·TapMark·홈 화면 모습 그림 HomeScreenPreview(SPEC-009 #142), 첫 장부 뒤 장부 위 권하기 카드 InstallOfferCard·상태 dongari:install-offer(SPEC-002 #135), 카톡 안에서 열렸을 때 안내 InAppBrowserScreen·가져오기 카드 InAppImportCard·판단·문구·표시 dongari:in-app inAppBrowser(SPEC-009 C #144), version: 설정 버전 줄 값(__APP_VERSION__ + 미리보기 VITE_BUILD_SHA)·새 버전 받음(controllerchange, #135), keep: 복구 코드·암호화·자동 보관기·복구 코드로 불러오기(SPEC-006), guide: 진짜 장부 복구 코드 안내 말풍선(4번) 규칙·기기 상태 dongari:guide(SPEC-008), practice: 첫 실행 물음·연습 장부(메모리 저장소로 그린 App + 연습 띠·단계 말풍선 practiceSteps·끝 화면, SPEC-008 #132), 동아리 6단계·가계부 5단계 — 회비 이름 고르기·회비 표·연습용 엑셀(시트 배열 practiceExcel, 엑셀 조각 readExcelSource 만 부르고 SheetJS 는 받지 않음, SPEC-010 10절 #168), 연습 끝 홈 화면에 추가 묻기·설치 확인 PracticeInstall·묻는 조건 askInstall·연습 마침 표시 dongari:practice practiceMark(SPEC-009 B #143), excel: 엑셀 읽기(SPEC-010 #165) — 시트 모양 sheet.ts·SheetJS 어댑터 sheetjs.ts(readWorkbook·writeWorkbook)·읽는 규칙 순수 함수 readExcelBook(시트별 ledgerSheet·duesSheet·payers, 고친 월 회비로 다시 읽기)·고른 파일 판별 excelFile·파일 머리 excelBytes, 엑셀로 새 장부(#166) — 첫 화면 쪽 입구 useExcelImport·조각 자리 ExcelImportSlot·읽는 중/안내 ExcelStatus·문구 excelMessages, 조각 쪽 읽은 내용 확인 ExcelImportScreen(ImportFacts·월 회비 고치기)·확인 화면 글 importFacts, 사실 카드·알림 줄 ExcelParts(ExcelFacts·ExcelNote, 첫 화면 쪽, 내보내기와 같이 씀), 엑셀 내보내기(#167) — 장부 → 시트 배열 순수 함수 exportBook(회비내역은 duesTable 그대로)·조각 excelExport(시트 → xlsx 파일)·첫 화면 쪽 흐름 useExcelExport(동적 import, 보내기 창/내려받기)·선택 창 ExcelExportSheet, 엑셀로 기존 장부에 넣기(#169) — 조각 쪽 넣기 규칙 순수 함수 mergeBook(해 줄·처음 체크·확인 창 내용·이름으로 회원 합치기)·해 고르기 ExcelMergePage(확인 창 MergeConfirmDialog), 저장은 useLedger.importIntoBook(저장에 성공했을 때만 화면에 들임), dues: 회비 표 DuesScreen(해 넘기기·요약 카드·알약·사람별 줄, 회원 명단·월 회비·회원 정보는 settings 화면을 그대로)·한 분 보기 MemberDuesPage(달 칸 선택 창 → 쉬는 기간)·12칸 띠 DuesStrip·4열 달력 DuesCalendar·화면 문구 duesWords·장부 버튼 덜 낸 분 수 useBehindCount(SPEC-010 4·5절 #163), 낸 분 붙이기(7절 #164) — 회비 표 카드 UnassignedDuesCard·붙이기 화면 AssignPayersPage(회원 명단 [낸 분 붙이기]에서도)·넘길 것과 아래 안내 payerAssign, useScreenHistory·BackToLedger)
├── pwa/         홈 화면 추가·오프라인 설정 (vite-plugin-pwa 옵션, manifest 색은 tokens.css 에서, 앱 이름 APP_SHORT_NAME)
├── ui/          기본 컴포넌트 (Button, Icon, ListRow, OptionList, CheckList(세로 체크 목록, #162), SegmentedControl, BottomSheet, MonthPicker, DayInput, MonthButton, EntryCard, SavedEntries, AmountDisplay, IconButton, NoticeBar, BalanceCard, MonthStepper, …, keyboard: 아이폰 키패드가 뜬 동안 아래 고정 버튼을 질문 바로 아래로, modalLayer: 창이 떠 있는 동안 뒤 화면 inert·포커스 옮기기/돌려주기(떠 있는 창 목록으로 정함 — 말풍선(keepOpen)이 열어 둔 요소는 다른 창이 잠근 곳 안이라도 열림, 포커스는 옮기기 전 자리로 돌려줌, #168; body 바로 아래 `data-outside-layer` 숨은 파일 칸은 잠그지 않음, #178), CoachMark: 꼬리 달린 안내 말풍선, SlideGuide: 넘겨 보는 안내 틀)
├── styles/      tokens.css (디자인 토큰, 값의 유일한 기준), font.css + fonts/ (Pretendard 가변 서브셋, scripts/subset-font.py 로 만든다)
├── catalog/     디자인 카탈로그 `/#/dev/catalog` (개발 모드 전용, 프로덕션 번들 제외)
├── devtools/    개발 확인 화면 `/#/dev/env` (개발 모드·미리보기 빌드 전용, 본 주소 번들 제외, SPEC-009 #141)
└── test/        Vitest 설정, 여러 테스트가 같이 쓰는 장부 기록(ledgerFixtures: v1 예시 1년치, 장부·저장 데이터 만들기, v4 회비 칸이 든 장부 duesBook·그 저장 데이터 duesData, 저장 전 가드(#172)에 걸리는 낸 분 PAYERS_OFF_AMOUNT(합 ≠ 금액)·PAYERS_OFF_ROSTER(명단에 없는 번호)·두 경우 목록 BROKEN_PAYERS), 지어낸 엑셀 표(excelFixtures: 입출금내역·회비내역 시트 모양 — 회비내역은 이모 엑셀 모양과 앱이 내보낸 9절 모양, 실제 엑셀은 넣지 않음)
public/icons/  앱 아이콘 (scripts/make-icons.mjs 가 토큰 색으로 만든다)
scripts/       아이콘·글꼴 만들기, 보관 지켜보기(keep-watch.mjs + 판정 keepWatch.ts, 워크플로 keep-watch.yml 이 돌린다), 보관본 꺼내기(keep-rescue.mjs + 풀기 keepRescue.ts, 개발자가 손으로), 엑셀 조각 검사(check-excel-bundle.mjs + 판정 excelBundle.ts, npm run build 끝에서 돈다)
worker/        자동 보관 서버 (Cloudflare Worker + KV, 따로 있는 패키지). src/index.ts 진입점(기본 내보내기만), src/keep.ts 요청 처리, wrangler.toml
ops/keep-backup/  비공개 백업 레포(crowwan/dongari-keep-backup)에 올리는 파일 원본: 주간 워크플로·README·받기 backup.mjs + 변환 규칙 backupPlan.ts (테스트는 scripts/keepBackupPlan.test.ts, SPEC-011 #186)
```
