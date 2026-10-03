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
- v1 코드(`src/`)는 월별 집계 모델이다. v2 는 거래 기록 모델로 새로 짠다 (`docs/prd.md` 데이터 모델).

## 스택

- React 19 + TypeScript + Vite 7 + Tailwind CSS v4
- 저장: localStorage (버전 있는 스키마, `docs/decisions/001-storage.md`)
- 보고서 이미지: html2canvas
- 테스트: Vitest + Testing Library (v2.0 에서 도입)
- 배포: GitHub Pages (`base: '/dongari/'`)

## 실행

```bash
npm install
npm run dev -- --port 7777   # 개발 서버
npm run lint
npm run build
npm run deploy               # GitHub Pages
```

## 폴더 구조

```
docs/          기획(prd, specs, decisions, design, qa-checklist)
dev/active/    이슈별 작업 메모 (머지 후 dev/archive/)
src/
├── domain/      v2 데이터 타입 (Entry, Ledger, StoredData)
├── storage/     v2 저장 계층 (LedgerRepository, 스키마 가드, 마이그레이션)
├── components/  tabs, report, common (v1)
├── hooks/       useAccountingData (v1)
├── types/
└── utils/       calculations, storage, imageExport (v1)
```
