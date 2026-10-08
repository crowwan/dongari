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
- 개발 서버는 3000 포트 금지 → `npm run dev -- --port 7777`.

## 현재 상태

- 최신 릴리스: v2.2.0 (2026-10-08, 날짜(일) 적기). 진행 중: v2.3 항목별 합계(SPEC-003), v2.4 여러 장부(SPEC-005)
- 끝난 스펙: SPEC-001 한 줄 장부 입력, SPEC-002 안전한 저장과 백업, SPEC-003 월 정리와 올해 결산
- v2.0.0 은 갤럭시 실기기 QA(홈 화면 추가·오프라인, 사진 저장 Download 앨범, 백업 보내기·불러오기)와 어머니 사용성 테스트(SPEC-001 AC-13) 전에 배포했다. 남은 확인은 릴리스 이슈 #40 체크리스트
- backlog 스펙: SPEC-004 적어 둔 글로 한 번에 적기 (draft — 1단계: 글 붙여넣기·공유 받기 → 확인 화면, 사진 인식기는 엔진 비교 후 2단계. 사진 → 글 추출이 동작할 때 다시 본다)
- GitHub Project: crowwan #3
- v2 는 거래 기록 모델이다 (`docs/prd.md` 데이터 모델). v1 코드는 #16 에서 모두 정리했다 (v1 연말 양식은 `features/report/sheet` 로 옮겨 `YearReport` 를 그린다).

## 스택

- React 19 + TypeScript + Vite 7, 순수 CSS + 디자인 토큰(`src/styles/tokens.css`, 개인 디자인 시스템 역할 구조). Tailwind 는 #12 에서 걷어냄
- 글꼴 Pretendard(앱에 포함, 오프라인 미리 저장), 아이콘 lucide-react (#45)
- 저장: localStorage (버전 있는 스키마, 지금 v3 = 장부 여러 개, `docs/decisions/001-storage.md`)
- 월 정리·올해 결산 사진: html2canvas (누를 때만 불러온다) → `canvas.toBlob` → Blob 주소 `<a download>`. 아이폰·아이패드는 공유 시트(`navigator.share`, "이미지 저장")로 사진 앱에 (#58)
- 테스트: Vitest + Testing Library (v2.0 에서 도입)
- 배포: GitHub Pages (`base: '/dongari/'`), 홈 화면 추가·오프라인은 vite-plugin-pwa (#10)

## 실행

```bash
npm install
npm run dev -- --port 7777   # 개발 서버
npm run lint
npm run build
npm run build:preview        # 미리보기 경로(/dongari/preview/)로 빌드
```

- 빌드 경로는 환경변수 `APP_BASE`(기본 `/dongari/`) 하나로 정한다 (`vite.config.ts`). 화면 파일·아이콘 경로, manifest `id`·`start_url`·`scope`, 서비스 워커 범위가 모두 따라간다. `build:preview` 는 `APP_BASE=/dongari/preview/`.

### 배포 (자동, `.github/workflows/deploy.yml`, #52)

GitHub Pages 는 `gh-pages` 브랜치를 그대로 보여 준다. 워크플로는 린트·타입 검사·테스트를 통과한 뒤 `gh-pages` 브랜치에만 쓴다(작성자 github-actions 봇).

| 언제 | 어디로 | gh-pages 에서 바뀌는 것 |
|---|---|---|
| main 에 머지(push) | 미리보기 `https://crowwan.github.io/dongari/preview/` | `preview/` 폴더만 새로 채움(옛 해시 파일 정리). 본 주소·`lab/` 은 그대로 |
| 태그 `v*` push (`/release`) | 본 주소 `https://crowwan.github.io/dongari/` | 브랜치 전체를 새 빌드로 바꿈 → 옛 해시 파일·`preview/`·`lab/` 이 지워진다(아래 이유). 미리보기는 다음 main 머지 때 다시 생긴다 |

- 두 배포는 같은 concurrency 그룹에서 차례로 돈다(진행 중인 배포는 끊지 않음). `/release` 는 릴리스 PR 머지(미리보기) 뒤 태그(본 주소) 순서라 마지막에 본 주소 배포가 미리보기를 지운다. 대기 중인 배포가 있을 때 또 하나가 오면 GitHub 이 대기 중인 쪽을 취소하니, 태그 배포가 취소됐으면 Actions 에서 다시 실행한다.
- 본 주소 서비스 워커(범위 `/dongari/`)와 미리보기 (#54):
  - v2.0.0 의 본 주소 서비스 워커는 `/dongari/preview/` 화면 요청도 받아 본 주소 `index.html` 로 답했다(navigateFallback, 제외 목록 없음). 그래서 본 주소를 한 번 연 폰에서는 미리보기가 안 열렸다.
  - v2.1.0 부터 본 주소 빌드에만 `navigateFallbackDenylist`(`/dongari/preview`·`/dongari/lab` 아래, base 에서 만든다, `src/pwa/pwaOptions.ts`)를 넣어 그 화면 요청은 네트워크로 보낸다. 미리보기 빌드에는 넣지 않는다(범위가 `/dongari/preview/` 안이라 본 주소 화면·파일 요청을 받지 않는다).
  - 효과는 새 본 주소 서비스 워커가 폰에 깔린 뒤부터다. 이미 v2.0.0 서비스 워커가 있는 폰은 v2.1.0 배포 뒤 본 주소를 한 번 열어 서비스 워커가 바뀐 다음부터(autoUpdate, 다음에 열 때) 미리보기가 열린다. 그 전까지는 v2.0.0 처럼 덮인다.
  - 미리보기 화면의 js·css 요청은 본 주소 서비스 워커가 받지 않는다(미리보기 화면은 미리보기 서비스 워커 또는 네트워크가 답하고, 본 주소 미리 저장 목록에는 `/dongari/preview/` 파일이 없음. 런타임 캐시는 쓰지 않는다).
  - 남은 간섭 하나: 본 주소 서비스 워커가 새로 깔릴 때(릴리스 뒤 처음 열 때) 옛 캐시 정리(`cleanupOutdatedCaches`)가 이름에 `/dongari/` 가 들어간 미리보기 미리 저장 캐시도 지운다. 미리보기는 온라인이면 네트워크로 받아 열리지만, 캐시는 다시 채워지지 않아(workbox 는 무결성 값이 있을 때만 채움) 다음 미리보기 배포로 미리보기 서비스 워커가 새로 깔릴 때까지 오프라인으로는 안 열린다. 본 주소 서비스 워커는 릴리스 때만 바뀌고 그때 미리보기도 지워졌다가 다음 main 머지 때 새로 깔리므로 지금 흐름에서는 QA 에 걸리지 않는다. 본 주소의 옛 캐시 정리를 끄는 쪽이 더 위험해 그대로 둔다.
- 릴리스 때 미리보기를 계속 지운다 (#54 에서 다시 판단):
  - 릴리스 순서가 릴리스 PR 머지(미리보기) → 태그(본 주소)라, 릴리스 직후 미리보기는 본 주소와 같은 내용이다. 남겨도 QA 할 거리가 없고 다음 main 머지 때 다시 채워진다.
  - 남기려면 본 주소 배포를 통째 교체에서 "`preview/`·`lab/` 빼고 지우기"(gh-pages `--remove` 글롭)로 바꿔야 한다. 글롭이 틀리면 옛 해시 파일이 쌓이거나 미리보기가 섞이는데, 얻는 것(본 주소와 같은 화면)에 비해 위험이 크다.
  - 위 캐시 정리 때문에 릴리스 뒤 남겨 둔 미리보기는 본 주소를 연 폰에서 오프라인으로 안 열린다. 지웠다가 다음 main 머지로 새로 까는 지금 흐름이 오히려 깔끔하다.
  - 릴리스 뒤에도 미리보기 주소를 계속 열어 둬야 하는 일(예: 본 주소 핫픽스 전 QA)이 생기면 그때 바꾼다.
  - 다음 버전 QA 는 main 머지로 다시 채워진 미리보기에서 한다. v2.1.0 서비스 워커가 깔린 폰이면 본 주소를 연 폰에서도 된다(그 전 폰은 본 주소를 안 연 테스트용 폰·브라우저로).
- 수동 배포(비상용, Actions 가 막혔을 때만): `npm run deploy:preview`(= 워크플로 미리보기와 같은 동작), `npm run deploy`(= 태그 배포와 같은 동작). 내 git 계정으로 gh-pages 에 바로 push 한다.
- 미리보기 주의:
  - 미리보기와 본 주소는 같은 출처(`crowwan.github.io`)라 localStorage(`dongari:v2`)를 같이 쓴다. 미리보기에서 적은 QA 기록이 본 주소 v2 에도 보인다 → QA 는 테스트용 폰·브라우저로 하거나 끝나고 지운다.
  - `/dongari/preview/` 는 본 주소 서비스 워커 범위 안이다. v2.1.0 서비스 워커가 깔리기 전 폰에서는 미리보기가 본 주소 화면으로 열린다(위 #54). 미리보기는 릴리스 전 QA 에만 쓴다.

## 폴더 구조

```
docs/          기획(prd, specs, decisions, design, qa-checklist)
dev/active/    이슈별 작업 메모 (머지 후 dev/archive/)
src/
├── main.tsx     진입점: 저장소를 한 번 읽어(LoadResult) App 에 넘김, 개발 모드 카탈로그 분기
├── App.tsx      앱 뼈대: 첫 실행(새 장부 만들기) / 장부(첫 화면)·내역 적기·고치기·설정·월 정리·올해 결산·새 장부 만들기 화면 전환(탭 없음, features/useScreenHistory: 뒤로 버튼·닫기 전 확인·선택 창 openSheet/closeSheet) + 저장 상태 안내
├── domain/      v2 데이터 타입과 계산 순수 함수 (Entry, Ledger, Book, StoredData(schemaVersion 3, 장부 여러 개), book.ts 지금 장부·장부 잔액·종류별 이월금 문구, ledger.ts 장부, report.ts 월 정리·올해 결산, entryDate.ts 날짜(일) 검증·날짜순)
├── storage/     v2 저장 계층 (LedgerRepository, LocalStorage·Memory 구현, 스키마 가드, 마이그레이션(v2 → v3 장부 하나로, 옛 원본 보관), 백업 파일 만들기·읽기)
├── features/    화면 단위 (books: 장부 고르기 창 목록·새 장부 만들기, ledger: 장부·새 연도 시작·내역 적기(하나씩 채우기 entrySteps)·고치기·useLedger, settings, report: 월 정리·올해 결산·사진으로 저장, report/sheet: v1 연말 양식(인라인 hex 예외), storage: 저장 안내 문구, backup: 백업 보내기·불러오기 흐름, install: 설정 [홈 화면에 추가] 줄 규칙·설치 제안·방법 안내, useScreenHistory·BackToLedger)
├── pwa/         홈 화면 추가·오프라인 설정 (vite-plugin-pwa 옵션, manifest 색은 tokens.css 에서)
├── ui/          기본 컴포넌트 (Button, Icon, ListRow, OptionList, SegmentedControl, BottomSheet, MonthPicker, DayInput, MonthButton, EntryCard, SavedEntries, AmountDisplay, IconButton, NoticeBar, BalanceCard, MonthStepper, …, keyboard: 아이폰 키패드가 뜬 동안 아래 고정 버튼을 질문 바로 아래로)
├── styles/      tokens.css (디자인 토큰, 값의 유일한 기준), font.css + fonts/ (Pretendard 가변 서브셋, scripts/subset-font.py 로 만든다)
├── catalog/     디자인 카탈로그 `/#/dev/catalog` (개발 모드 전용, 프로덕션 번들 제외)
└── test/        Vitest 설정, 여러 테스트가 같이 쓰는 장부 기록(ledgerFixtures: v1 예시 1년치, 장부·저장 데이터 만들기)
public/icons/  앱 아이콘 (scripts/make-icons.mjs 가 토큰 색으로 만든다)
```
