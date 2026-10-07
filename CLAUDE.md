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

- 마일스톤: v2.0 (리뉴얼)
- 진행 중 스펙: SPEC-001 한 줄 장부 입력, SPEC-002 안전한 저장과 백업, SPEC-003 보고서 바로 보내기
- backlog 스펙: SPEC-004 사진으로 한 번에 적기 (draft)
- GitHub Project: crowwan #3
- v2 는 거래 기록 모델이다 (`docs/prd.md` 데이터 모델). v1 코드는 #16 에서 모두 정리했다 (v1 연말 양식은 `features/report/sheet` 로 옮겨 `YearReport` 를 그린다).

## 스택

- React 19 + TypeScript + Vite 7, 순수 CSS + 디자인 토큰(`src/styles/tokens.css`, 개인 디자인 시스템 역할 구조). Tailwind 는 #12 에서 걷어냄
- 글꼴 Pretendard(앱에 포함, 오프라인 미리 저장), 아이콘 lucide-react (#45)
- 저장: localStorage (버전 있는 스키마, `docs/decisions/001-storage.md`)
- 월 정리·올해 결산 사진: html2canvas (누를 때만 불러온다) → `canvas.toBlob` → Blob 주소 `<a download>`
- 테스트: Vitest + Testing Library (v2.0 에서 도입)
- 배포: GitHub Pages (`base: '/dongari/'`), 홈 화면 추가·오프라인은 vite-plugin-pwa (#10)

## 실행

```bash
npm install
npm run dev -- --port 7777   # 개발 서버
npm run lint
npm run build
npm run deploy               # GitHub Pages 본 주소 (/dongari/)
npm run deploy:preview       # QA 미리보기 (/dongari/preview/)
```

- 빌드 경로는 환경변수 `APP_BASE`(기본 `/dongari/`) 하나로 정한다 (`vite.config.ts`). 화면 파일·아이콘 경로, manifest `id`·`start_url`·`scope`, 서비스 워커 범위가 모두 따라간다. `build:preview` 는 `APP_BASE=/dongari/preview/`.
- `deploy:preview` 는 gh-pages 브랜치의 `preview/` 폴더만 갈아 끼운다(`--dest preview --add`, 본 주소 파일은 그대로).
- `deploy` 는 `--add` 없이 gh-pages 브랜치를 통째로 바꾼다 → `preview/` 와 lab 검증 페이지도 함께 지워진다. 릴리스 뒤 미리보기 정리는 이걸로 된다.
- 미리보기 주의:
  - 미리보기와 본 주소는 같은 출처(`crowwan.github.io`)라 localStorage(`dongari:v2`)를 같이 쓴다. 미리보기에서 적은 QA 기록이 본 주소 v2 에도 보인다 → QA 는 테스트용 폰·브라우저로 하거나 끝나고 지운다.
  - 본 주소에 v2(서비스 워커 범위 `/dongari/`)가 올라간 뒤에는 `/dongari/preview/` 도 그 범위 안이다. 미리보기는 릴리스 전 QA 에만 쓴다.

## 폴더 구조

```
docs/          기획(prd, specs, decisions, design, qa-checklist)
dev/active/    이슈별 작업 메모 (머지 후 dev/archive/)
src/
├── main.tsx     진입점: 저장소를 한 번 읽어(LoadResult) App 에 넘김, 개발 모드 카탈로그 분기
├── App.tsx      앱 뼈대: 첫 실행 화면 / 장부(첫 화면)·내역 적기·고치기·설정·월 정리·올해 결산 화면 전환(탭 없음, features/useScreenHistory: 뒤로 버튼·닫기 전 확인) + 저장 상태 안내
├── domain/      v2 데이터 타입과 계산 순수 함수 (Entry, Ledger, StoredData, ledger.ts 장부, report.ts 월 정리·올해 결산)
├── storage/     v2 저장 계층 (LedgerRepository, LocalStorage·Memory 구현, 스키마 가드, 마이그레이션, 백업 파일 만들기·읽기)
├── features/    화면 단위 (ledger: 장부·시작·내역 적기·useLedger, settings, report: 월 정리·올해 결산·사진으로 저장, report/sheet: v1 연말 양식(인라인 hex 예외), storage: 저장 안내 문구, backup: 백업 보내기·불러오기 흐름, install: 설치 안내 띠, useScreenHistory·BackToLedger)
├── pwa/         홈 화면 추가·오프라인 설정 (vite-plugin-pwa 옵션, manifest 색은 tokens.css 에서)
├── ui/          기본 컴포넌트 (Button, Icon, ListRow, SegmentedControl, BottomSheet, MonthPicker, PickRow, AnswerChip, AmountDisplay, IconButton, NoticeBar, BalanceCard, MonthStepper, …)
├── styles/      tokens.css (디자인 토큰, 값의 유일한 기준), font.css + fonts/ (Pretendard 가변 서브셋, scripts/subset-font.py 로 만든다)
├── catalog/     디자인 카탈로그 `/#/dev/catalog` (개발 모드 전용, 프로덕션 번들 제외)
└── test/        Vitest 설정, 여러 테스트가 같이 쓰는 장부 기록(ledgerFixtures: v1 예시 1년치)
public/icons/  앱 아이콘 (scripts/make-icons.mjs 가 토큰 색으로 만든다)
```
