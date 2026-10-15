---
id: SPEC-007
title: 자동 보관 지켜보기
status: in-progress
milestone: v2.6
issue: "#103"
prototype:
updated: 2026-10-15
---

# SPEC-007 자동 보관 지켜보기

## 배경과 목표

SPEC-006 자동 보관은 실패해도 조용히 기다린다(사용자를 귀찮게 하지 않으려고). 그래서 서버가 깨지거나 앱 버그로 몇 주째 보관이 안 돼도 아무도 모르고, 폰을 잃어버린 뒤에야 알게 된다 — 자동 보관이 막으려던 바로 그 상황이다. 앱 안 7일 안내 띠(SPEC-006)는 있지만 사용자(어머니)가 보고 대처하기를 기대하기 어렵다.

이 기능이 끝나면 **개발자(나)가** 보관이 밀리거나 서버가 죽었을 때 하루 안에 메일로 안다. 사용자 화면은 바뀌지 않는다. 근거: [ADR 006](../decisions/006-keep-status-signal.md).

## 동작 정의

### 기본 흐름

1. 앱을 열 때(자동 보관 `start` 의 올리기 시도가 끝난 뒤) 폰이 서버에 **상태 신호**를 한 번 보낸다. 담는 것: 자동 보관 켜짐 여부, 밀린 변경이 생긴 때(`pendingSince`), 마지막 보관 성공 시각(`lastKeptAt`), 너무 커서 못 올림(`tooLarge`), 앱 버전. 장부 내용·복구 코드는 넣지 않는다.
2. 서버는 신호를 보관 자리 이름(복구 코드 해시, 이미 서버가 아는 값)별로 덮어쓰고, 받은 때(서버 시각)를 붙인다.
3. 하루 한 번(오전 9시 KST) GitHub Actions 워크플로 "보관 지켜보기" 가 서버의 요약(`/v1/report`, 비밀 토큰 필요)을 받아 판정한다.
4. 문제가 있으면 워크플로가 실패로 끝나고, GitHub 가 실패 메일을 보낸다. 실행 요약(Job summary)에 기기별 표가 남는다.

### 판정

| 상황 | 결과 | 요약에 쓰는 말 |
|---|---|---|
| 서버가 응답하지 않음 / 5xx / 요약 형식이 틀림 | 실패 | 보관 서버가 응답하지 않아요 |
| 어떤 기기든 `pendingSince` 가 신호 받은 때 기준 3일(72시간) 넘음 | 실패 | 기기 `ab12cd34` 가 3일 넘게 보관하지 못했어요 (밀린 때 …) |
| 어떤 기기든 `tooLarge` | 실패 | 기기 `ab12cd34` 의 기록이 1MB 를 넘어 보관하지 못했어요 |
| 어떤 기기든 자동 보관 꺼짐 | 경고(성공) | 기기 `ab12cd34` 가 자동 보관을 껐어요 |
| 마지막 신호가 30일 넘음 | 경고(성공) | 기기 `ab12cd34` 가 30일 넘게 앱을 열지 않았어요 |
| 신호가 하나도 없음 | 경고(성공) | 아직 상태 신호가 없어요 |

- 기기는 이름(64자 해시)의 앞 8자로만 보여 준다.
- 3일은 앱 안 띠(7일)보다 먼저 알기 위한 값이다.

### 예외와 경계 상황

- 신호를 못 보내도(인터넷 없음·서버 오류) 앱은 아무것도 하지 않는다. 다시 시도하지 않고 다음 앱 열기 때 보낸다.
- 자동 보관이 꺼졌어도 복구 코드가 있으면 신호는 보낸다(꺼짐을 알아야 하므로). 복구 코드가 없으면(읽기 전용 등) 보내지 않는다.
- 읽기 전용(SPEC-002)이면 보내지 않는다(`start` 를 부르지 않는 것과 같이).
- `VITE_KEEP_URL` 이 없는 빌드는 보내지 않는다.
- 서버의 보관본을 지우면(`DELETE /v1/keep/:id`) 그 기기의 상태 신호도 지운다.
- 신호는 앱을 열 때만 보내므로 앱을 안 열면 `pendingSince` 를 알 수 없다. 이때는 30일 경고로만 안다.
- 레포에 60일 동안 활동이 없으면 GitHub 가 예약 워크플로를 멈춘다. 멈추면 GitHub 가 미리 메일로 알려 주고, Actions 화면에서 다시 켠다(CLAUDE.md 에 적는다).
- KV 쓰기 하루 1,000회 한도: 신호는 앱 열 때 한 번이라 하루 몇 회다.

## 수용 기준

- [ ] AC-1 앱을 열면 보관 시도가 끝난 뒤 상태 신호를 한 번 보낸다. 내용은 켜짐·`pendingSince`·`lastKeptAt`·`tooLarge`·앱 버전뿐이다 (자동, 가짜 서버)
- [ ] AC-2 신호 실패는 화면에 아무것도 띄우지 않고 다시 시도하지 않는다. 읽기 전용·복구 코드 없음·서버 주소 없음이면 보내지 않는다 (자동)
- [ ] AC-3 Worker: `PUT /v1/status/:id` 는 허용 출처만, 형식이 맞으면 받은 때를 붙여 덮어쓴다. 형식이 틀리면 400, 크기 4KB 초과 413 (자동, Worker 테스트)
- [ ] AC-4 Worker: `GET /v1/report` 는 맞는 토큰이면 기기별 요약을, 토큰이 없거나 틀리면 401 을 준다. 출처 검사는 하지 않는다 (자동, Worker 테스트)
- [ ] AC-5 Worker: `DELETE /v1/keep/:id` 는 같은 이름의 상태 신호도 지운다 (자동, Worker 테스트)
- [ ] AC-6 판정 스크립트: 위 "판정" 표의 각 상황에서 실패/경고와 문구가 맞다 (자동, 스크립트 테스트)
- [ ] AC-7 실제 배포에서 워크플로를 수동 실행하면 요약 표가 나오고, 토큰을 틀리게 하면 실패하고 메일이 온다 (수동 QA)

## 범위 밖

- 사용자 화면 변경(앱 안 안내는 SPEC-006 7일 띠 그대로)
- 프론트엔드 오류 수집(Sentry 등), 사용량 분석, 업타임 상시 감시
- 메일 말고 다른 알림 수단(푸시·카톡), Cloudflare Cron Trigger

## 기술 메모

- 서버 API 추가 (`worker/src/`)
  - `PUT /v1/status/:id` — 출처·이름 검사는 `/v1/keep/:id` 와 같다. 본문 `{ "v": 1, "enabled": boolean, "pendingSince"?: ISO, "lastKeptAt"?: ISO, "tooLarge": boolean, "appVersion": string(32자 이하) }`. 서버가 `seenAt`(서버 시각)을 붙여 KV `status:<id>` 에 저장 204. CORS 메서드에 맞춰 PUT 은 이미 허용.
  - `GET /v1/report` — `Authorization: Bearer <REPORT_TOKEN>`(Worker 비밀값, `wrangler secret put REPORT_TOKEN`). KV `list({ prefix: 'status:' })` 로 모아 `{ now, devices: [{ id: 앞 8자, seenAt, enabled, pendingSince?, lastKeptAt?, tooLarge, appVersion }] }` 200. 비교는 시간 일정 비교(길이 같을 때 바이트 XOR). `Origin` 검사 없음(GitHub Actions 에서 부른다), CORS 헤더 없음.
  - 신호를 받는 것만으로 서버가 살아 있는지도 확인되므로 `/health` 는 따로 두지 않는다 — `/v1/report` 가 KV 를 읽으므로 그 응답이 곧 건강 확인이다.
- 앱 (`src/features/keep/`)
  - `keepServer.ts` 에 `sendStatus(id, status)` (실패는 삼킨다).
  - `AutoKeeper.start` 끝에서 한 번 부른다. 앱 버전은 빌드 때 `package.json` version 을 `define` 으로 넣는다(이미 있으면 그것).
- 워크플로 `.github/workflows/keep-watch.yml`
  - `schedule: cron '0 0 * * *'`(UTC 0시 = KST 9시) + `workflow_dispatch`.
  - 비밀값 `KEEP_REPORT_TOKEN`, 주소는 저장소 변수 `KEEP_URL`(앱 배포와 같은 값).
  - 판정은 `scripts/keep-watch.mjs`(Node, 의존성 없음): 요약 JSON 을 받아 실패·경고 목록을 만들고 `$GITHUB_STEP_SUMMARY` 에 표를 쓴다. 실패가 있으면 `::error` 후 exit 1, 경고는 `::warning`. 판정 함수는 순수 함수로 나눠 vitest 로 시험한다.
- 비밀값 넣기(사용자 할 일): `openssl rand -hex 32` 로 만든 값을 Worker 비밀값 `REPORT_TOKEN` 과 레포 Secrets `KEEP_REPORT_TOKEN` 에 같게 넣는다. 둘 중 하나라도 없으면 워크플로가 넣는 방법을 알려 주고 실패한다(worker.yml 비밀값 확인과 같은 모양).

## 열린 질문

- 앱이 배포는 됐는데 `VITE_KEEP_URL` 이 빠지는 등 신호 자체가 끊기는 경우는 30일 경고로만 안다. 배포 직후 앱 번들에 서버 주소가 들어갔는지 deploy.yml 에서 확인할지 — 결정: 구현 중
- 기준 3일·30일이 알맞은지 — 결정: v2.6 사용 후

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-15 | 초안 (사용자: "이건 사용자가 아니라 내가 볼 수 있어야 할 것 같은데" → 상태 신호 + GitHub Actions 일일 점검·실패 메일) |
| 2026-10-15 | 승인 (사용자: "진행") |
| 2026-10-15 | 이슈 분해: #103 (하위 #104 서버, #105 앱 신호, #106 워크플로) |
