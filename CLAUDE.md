# 동아리 회계

어머니가 스마트폰으로 동아리 수입·지출을 한 줄씩 적으면 연말 정산 보고서가 만들어지는 모바일 웹앱.

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

- 최신 릴리스: v2.0.0 (2026-10-07, 리뉴얼). 다음 마일스톤 v2.1: SPEC-001 연달아 적기
- 끝난 스펙: SPEC-001 한 줄 장부 입력, SPEC-002 안전한 저장과 백업, SPEC-003 월 정리와 올해 결산
- v2.0.0 은 갤럭시 실기기 QA(홈 화면 추가·오프라인, 사진 저장 Download 앨범, 백업 보내기·불러오기)와 어머니 사용성 테스트(SPEC-001 AC-13) 전에 배포했다. 남은 확인은 릴리스 이슈 #40 체크리스트
- backlog 스펙: SPEC-004 적어 둔 글로 한 번에 적기 (draft — 1단계: 글 붙여넣기·공유 받기 → 확인 화면, 사진 인식기는 엔진 비교 후 2단계. 사진 → 글 추출이 동작할 때 다시 본다)
- GitHub Project: crowwan #3
- v2 는 거래 기록 모델이다 (`docs/prd.md` 데이터 모델). v1 코드는 #16 에서 모두 정리했다 (v1 연말 양식은 `features/report/sheet` 로 옮겨 `YearReport` 를 그린다).

## 스택

- React 19 + TypeScript + Vite 7, 순수 CSS + 디자인 토큰(`src/styles/tokens.css`, 개인 디자인 시스템 역할 구조). Tailwind 는 #12 에서 걷어냄
- 글꼴 Pretendard(앱에 포함, 오프라인 미리 저장), 아이콘 lucide-react (#45)
- 저장: localStorage (버전 있는 스키마, `docs/decisions/001-storage.md`)
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
| 태그 `v*` push (`/release`) | 본 주소 `https://crowwan.github.io/dongari/` | 브랜치 전체를 새 빌드로 바꿈 → 옛 해시 파일·`preview/`·`lab/` 이 지워진다. 미리보기는 다음 main 머지 때 다시 생긴다 |

- 두 배포는 같은 concurrency 그룹에서 차례로 돈다(진행 중인 배포는 끊지 않음). `/release` 는 릴리스 PR 머지(미리보기) 뒤 태그(본 주소) 순서라 마지막에 본 주소 배포가 미리보기를 지운다. 대기 중인 배포가 있을 때 또 하나가 오면 GitHub 이 대기 중인 쪽을 취소하니, 태그 배포가 취소됐으면 Actions 에서 다시 실행한다.
- 릴리스 때 미리보기를 지우는 이유: 본 주소에 v2(서비스 워커 범위 `/dongari/`)가 올라가면 그 서비스 워커가 `/dongari/preview/` 화면 요청도 받아 본 주소 `index.html` 로 답한다(navigateFallback, 제외 목록 없음). 본 주소를 한 번 연 폰에서는 미리보기가 사실상 안 열리므로, 릴리스 직후 본 주소와 같은 내용의 미리보기를 남겨 둘 이유가 없다. 다음 버전 QA 는 main 머지로 다시 채워진 미리보기를 본 주소를 안 연 테스트용 폰·브라우저에서 한다.
- 수동 배포(비상용, Actions 가 막혔을 때만): `npm run deploy:preview`(= 워크플로 미리보기와 같은 동작), `npm run deploy`(= 태그 배포와 같은 동작). 내 git 계정으로 gh-pages 에 바로 push 한다.
- 미리보기 주의:
  - 미리보기와 본 주소는 같은 출처(`crowwan.github.io`)라 localStorage(`dongari:v2`)를 같이 쓴다. 미리보기에서 적은 QA 기록이 본 주소 v2 에도 보인다 → QA 는 테스트용 폰·브라우저로 하거나 끝나고 지운다.
  - 본 주소에 v2(서비스 워커 범위 `/dongari/`)가 올라간 뒤에는 `/dongari/preview/` 도 그 범위 안이다(위 이유). 미리보기는 릴리스 전 QA 에만 쓴다.

## 폴더 구조

```
docs/          기획(prd, specs, decisions, design, qa-checklist)
dev/active/    이슈별 작업 메모 (머지 후 dev/archive/)
src/
├── main.tsx     진입점: 저장소를 한 번 읽어(LoadResult) App 에 넘김, 개발 모드 카탈로그 분기
├── App.tsx      앱 뼈대: 첫 실행 화면 / 장부(첫 화면)·내역 적기·고치기·설정·월 정리·올해 결산 화면 전환(탭 없음, features/useScreenHistory: 뒤로 버튼·닫기 전 확인·선택 창 openSheet/closeSheet) + 저장 상태 안내
├── domain/      v2 데이터 타입과 계산 순수 함수 (Entry, Ledger, StoredData, ledger.ts 장부, report.ts 월 정리·올해 결산)
├── storage/     v2 저장 계층 (LedgerRepository, LocalStorage·Memory 구현, 스키마 가드, 마이그레이션, 백업 파일 만들기·읽기)
├── features/    화면 단위 (ledger: 장부·시작·내역 적기(하나씩 채우기 entrySteps)·고치기·useLedger, settings, report: 월 정리·올해 결산·사진으로 저장, report/sheet: v1 연말 양식(인라인 hex 예외), storage: 저장 안내 문구, backup: 백업 보내기·불러오기 흐름, install: 설정 [홈 화면에 추가] 줄 규칙·설치 제안·방법 안내, useScreenHistory·BackToLedger)
├── pwa/         홈 화면 추가·오프라인 설정 (vite-plugin-pwa 옵션, manifest 색은 tokens.css 에서)
├── ui/          기본 컴포넌트 (Button, Icon, ListRow, OptionList, SegmentedControl, BottomSheet, MonthPicker, PickRow, EntryCard, SavedEntries, AmountDisplay, IconButton, NoticeBar, BalanceCard, MonthStepper, …, keyboard: 아이폰 키패드가 뜬 동안 아래 고정 버튼을 질문 바로 아래로)
├── styles/      tokens.css (디자인 토큰, 값의 유일한 기준), font.css + fonts/ (Pretendard 가변 서브셋, scripts/subset-font.py 로 만든다)
├── catalog/     디자인 카탈로그 `/#/dev/catalog` (개발 모드 전용, 프로덕션 번들 제외)
└── test/        Vitest 설정, 여러 테스트가 같이 쓰는 장부 기록(ledgerFixtures: v1 예시 1년치)
public/icons/  앱 아이콘 (scripts/make-icons.mjs 가 토큰 색으로 만든다)
```
