---
id: SPEC-011
title: 보관본 날짜별 사본과 서버 밖 사본
status: in-progress
milestone: v2.8
issue: "#184"
prototype: https://claude.ai/artifact/YGW12D9fPMnTfQiZg9s5Ac
updated: 2026-11-24
---

# SPEC-011 보관본 날짜별 사본과 서버 밖 사본

## 배경과 목표

자동으로 지키기(SPEC-006)는 서버에 최신본 한 벌만 덮어쓴다. 잘못 지우거나 망가진 상태가 보관되면 좋은 사본이 사라지고, 모든 보관본이 한 Cloudflare 계정에만 있다. 엑셀 불러오기(SPEC-010)로 데이터가 커지고 중요해져서 두 구멍을 메운다. 결정과 이유: [ADR 010](../decisions/010-keep-history-offsite.md).

사용자 결정(2026-11-24): 시안 결정 셋 "추천대로", 다만 "지금 당장 사용자에게 복구하는 기능을 제공하진 않아도 되지만, 복구 코드를 나한테 알려주면 내가 복구해줄 수 있는 방법 정도만 있어도 돼" → **앱 화면은 바꾸지 않고**, 서버 사본 + 서버 밖 사본 + 개발자 꺼내기 도구만.

선행: SPEC-006(보관 서버·꺼내기 스크립트), SPEC-007(보관 지켜보기).

## 동작 정의

### 1. 서버 날짜별 사본 (Worker)

- 날짜는 **한국 시간(UTC+9)** 의 날. 최신본을 저장할 때 KV metadata 에 `savedAt`(서버 받은 시각, ISO)을 함께 둔다. 이 기능 전에 저장된 최신본은 metadata 가 없으니 보관본 겉봉투의 `savedAt` 으로 그 날을 정한다.
- `PUT /v1/keep/<id>`(출처별 자리 그대로: 본 `keep:` / 미리보기 `preview:keep:`)를 받으면, 새 값을 쓰기 전에:
  1. 기존 최신본이 있고 그 보관일 ≠ 오늘이면 → 기존 값을 `{자리}snap:<id>:<보관일 YYYY-MM-DD>` 로 복사(metadata `savedAt`, `expirationTtl` 31일 = 2,678,400초). 이미 있으면 덮어쓴다.
  2. 기존 최신본의 보관 달 ≠ 오늘의 달이면 → 기존 값을 `{자리}month:<id>:<보관 달 YYYY-MM>` 로도 복사(`expirationTtl` 400일 = 34,560,000초).
  3. 새 값을 최신본으로 쓴다(metadata `savedAt` = 지금).
- 그래서 사본은 "그날(그달) 마지막으로 보관된 모습"이고, 기록을 고치지 않은 날은 사본이 없다.
- 복사 중 실패하면 새 값 쓰기를 하지 않고 5xx 로 답한다(최신본만 바뀌고 사본이 빠지는 일 없게). 폰은 지금처럼 다시 보낸다.
- `DELETE /v1/keep/<id>`(자동으로 지키기 끄기 [지우기])는 최신본·상태 신호와 함께 그 id 의 `snap:`·`month:` 사본을 모두 지운다.
- 개발자용 읽기(출처 검사는 지금 그대로 — 꺼내기 스크립트가 본 주소 출처를 붙인다):
  - `GET /v1/keep/<id>/history` → `{ latest?: { savedAt }, days: [{ date, savedAt }], months: [{ month, savedAt }] }`(최신 것부터). 없으면 빈 목록.
  - `GET /v1/keep/<id>?day=YYYY-MM-DD` / `?month=YYYY-MM` → 그 사본 본문(없으면 404). 쿼리 없으면 지금처럼 최신본.
- 쓰기 늘어남: 기기당 하루 최대 2번(날·달이 바뀐 첫 보관). 무료 한도(하루 1,000) 안.
- 구현에서 정한 것 (#185):
  - 달 사본에도 metadata `savedAt`(그 사본이 담은 보관 시각)을 둔다 — 목록이 본문을 읽지 않고 보관 시각을 주려고. 날짜 사본과 같은 값.
  - 날을 가르는 보관 시각은 최신본 metadata 의 **서버 시각**이고, 겉봉투 `savedAt`(폰 시계)은 metadata 없는 옛 최신본에만 쓴다.
  - 복사 실패(복사 전 최신본 읽기 실패 포함)는 503.
  - `?day=`(YYYY-MM-DD)·`?month=`(YYYY-MM) 형식이 틀리거나 둘을 함께 주면 400. `/history` 는 GET 만(그 밖 405), 출처·이름 형식 검사는 보관본 경로와 같다(미리 요청 OPTIONS 204).
  - `/history` 는 KV list 의 metadata 로 만든다. metadata 가 없거나 키 끝이 날·달 모양이 아닌 키는 빼고 준다(서버가 쓴 사본에는 늘 있다). 최신본이 없으면 `latest` 칸이 없다.

### 2. 서버 밖 주간 사본 (비공개 레포)

- Worker `GET /v1/export`: `Authorization: Bearer <EXPORT_TOKEN>`(Worker 비밀값, 요약 토큰과 별개). 출처 검사 없음(서버끼리). 토큰이 없거나 틀리면 401. 본 자리(`keep:`)의 **최신본만**(미리보기·사본 제외) `{ exportedAt, items: [{ id, savedAt, envelope }] }` 로 준다. 주고 나서 `export:last` 에 `{ at, count }` 를 쓴다.
- `GET /v1/report`(SPEC-007) 응답에 `export: { lastAt, count } | null` 을 더한다.
- 보관 지켜보기(SPEC-007 판정 표)에 줄 추가: `export` 가 있고 8일 넘음 → **실패**("서버 밖 사본이 N일째 없어요"). `export` 가 없음 → 경고("아직 서버 밖 사본이 없어요")(첫 주).
- 비공개 레포 `crowwan/dongari-keep-backup`:
  - 워크플로 `backup.yml`: 매주 일요일 23:00 UTC(월요일 08:00 KST, 보관 지켜보기 09:00 앞) + 손으로 실행(workflow_dispatch).
  - `GET $KEEP_URL/v1/export` → `keep/<id>.json`(겉봉투 그대로)로 쓰고, 이번 목록에 없는 id 파일은 지운다. `index.json`(id·savedAt·크기)도 쓴다. 바뀐 게 있으면 `GITHUB_TOKEN`(권한 `contents: write`)으로 커밋 "주간 보관본 YYYY-MM-DD".
  - 비밀값 `EXPORT_TOKEN`, 변수 `KEEP_URL`. 실패하면 GitHub 가 실패 메일을 보낸다.
  - README: 무엇인지, 암호문이라는 것, 되살리는 법(꺼내기 스크립트 `--file`), 지워 달라는 요청 때 이력 지우는 법.
- `EXPORT_TOKEN` 은 dongari 레포 비밀값 `KEEP_EXPORT_TOKEN` 에도 넣고, 보관 서버 배포 워크플로(`worker.yml`)가 배포 때 Worker 비밀값으로 넣는다(값은 로그에 찍지 않음).

### 3. 개발자 꺼내기 (`scripts/keep-rescue.mjs`)

지금(최신본 → 기록 파일)에 더해:

- `--list`: 코드를 물은 뒤 있는 사본을 보여 준다: 최신본(보관 시각, KST) / 날짜별(날짜·보관 시각) / 달별(달·보관 시각). 각 줄에 풀었을 때 장부 이름·기록 건수를 같이 보인다(풀어 보고 세기).
- `--day YYYY-MM-DD` / `--month YYYY-MM`: 그 사본으로 기록 파일을 만든다. 파일 이름에 그 날·달(`우리장부-기록-2026-11-21.txt`).
- `--file <겉봉투 JSON 경로>`: 서버 대신 백업 레포 파일(`keep/<id>.json`)을 푼다. 파일 이름의 id 와 코드에서 만든 id 가 다르면 "이 코드의 파일이 아니에요"로 멈춘다.
- 출력에 코드를 찍지 않고, 기록 파일은 레포 밖(`~/Downloads`)에 만드는 규칙은 그대로.
- `scripts/keepRescue.ts` 의 제약(타입 지우기 문법만, src 불러오기 없음) 그대로.
- 구현에서 정한 것 (#185, `--file` 은 #186):
  - `--list`·`--day`·`--month` 는 하나만 쓴다. 날·달 형식이 틀리거나(달 01~12, 날 01~31), 옵션을 함께 주거나, 모르는 옵션·남는 인자가 있으면 쓰는 법을 찍고 종료 코드 1(코드를 묻기 전, 서버를 부르기 전).
  - `--list` 는 목록 하나 + 사본마다 GET 하나로 풀어 본다. 줄의 보관 시각은 서버 목록의 시각(한국 시간). 못 푼 사본은 그 줄에 "풀지 못했어요 (이유)" 를 적고 나머지는 보인다. 사본이 하나도 없으면 최신본 없음과 같은 안내, 목록 경로가 없는(이 기능 전) 서버면 "예전 버전이에요 (404). 보관 서버 배포를 확인하세요". 파일은 만들지 않는다.
  - 출력 모양: "최신본: 2026-11-24 09:30 보관 · 꽃동아리 · 기록 3건", 그 아래 "날짜별 사본"·"달별 사본" 묶음에 `  2026-11-21: …` 줄(없으면 "(없어요)"), 묶음 머리에 남는 기간과 꺼내는 옵션.
  - `--month` 파일 이름은 `우리장부-기록-2026-10.txt`. 고른 날·달 사본이 없으면 "2026-11-19 날짜별 사본이 서버에 없어요 (404). --list 로 있는 날·달을 보세요".
  - 꺼낸 뒤 요약 첫 줄에 "꺼낸 사본: 최신본 / 2026-11-21 날짜별 사본 / 2026-10 달별 사본".

### 4. 앱

바뀌지 않는다. (사용자 화면 "예전 날 기록 보기"는 범위 밖 — 시안 A-2 는 나중에 필요해지면.)

### 예외와 경계 상황

- 여러 기기가 같은 코드: 그날 마지막으로 보관한 기기의 모습이 사본. 자정 근처 KV 지연(최대 60초)으로 하루 어긋날 수 있음(허용).
- [지우기]는 사본을 KV list 로 찾는데, list 도 최대 60초 늦게 보인다. 사본이 생기고 1분 안에 지우면 그 사본은 TTL(31일·400일)까지 남을 수 있음(허용, #185).
- 미리보기 출처의 보관은 `preview:snap:`·`preview:month:` 로 나뉘어 본 사본과 섞이지 않는다. 내보내기는 본 자리만.
- 보관본이 1MB 를 넘으면 지금처럼 받지 않는다(사본도 안 생김).
- `/v1/export` 응답 크기: 가족 몇 명 × 수백 KB. 10MB 를 넘기 전에 나눠 받기를 생각한다(지금은 범위 밖, 기술 메모).
- 백업 레포 워크플로가 실패해도 Worker·앱은 영향 없음. 보관 지켜보기가 8일 뒤 알림.

## 수용 기준

- [ ] AC-1 날(KST)이 바뀐 뒤 첫 PUT 은 기존 최신본을 그 보관일 사본(31일 TTL)으로, 달이 바뀐 첫 PUT 은 달 사본(400일 TTL)으로도 남기고, 같은 날 두 번째 PUT 은 사본을 만들지 않는다 (자동)
- [ ] AC-2 metadata 없는 옛 최신본은 겉봉투 `savedAt` 으로 날을 정한다. 사본 복사가 실패하면 최신본을 바꾸지 않고 5xx (자동)
- [ ] AC-3 `GET …/history` 가 최신본·날짜·달 목록을 최신 것부터, `?day=`·`?month=` 가 그 사본을(없으면 404) 준다. 미리보기 출처는 미리보기 자리만 본다 (자동)
- [ ] AC-4 `DELETE` 가 그 id 의 사본까지 지운다 (자동)
- [ ] AC-5 `GET /v1/export` 는 토큰이 맞을 때만 본 자리 최신본 전부를 주고 `export:last` 를 남기며, `/v1/report` 에 `export` 가 실린다 (자동)
- [ ] AC-6 보관 지켜보기가 내보내기 8일 넘음을 실패, 없음을 경고로 판정한다 (자동)
- [ ] AC-7 꺼내기 스크립트 `--list`·`--day`·`--month`·`--file` 이 각각 목록·기록 파일을 만들고, 다른 코드의 파일이면 멈춘다 (자동)
- [ ] AC-8 비공개 레포 워크플로를 손으로 실행하면 `keep/<id>.json`·`index.json` 이 커밋되고, 그 파일로 꺼내기 `--file` 이 기록 파일을 만든다 (수동 QA)
- [ ] AC-9 본 주소에서 하루 지나 다시 보관한 뒤 `--list` 에 어제 날짜 사본이 보이고 `--day` 로 꺼낸 기록 파일을 앱 [기록 파일 불러오기]로 열 수 있다 (수동 QA)

## 범위 밖

- 사용자 화면에서 예전 날 고르기(시안 A-2), 되돌리기 전 사본.
- 사본 목록·내보내기 나눠 받기(사용자 수가 늘면).
- R2 등 다른 저장소.

## 기술 메모

- `KeepStore` 에 `put(key, value, { metadata, expirationTtl })`, `list` 의 metadata, `getWithMetadata` 를 더한다(Cloudflare KV 그대로).
- KST 날: `new Date(ms + 9h).toISOString().slice(0, 10)`. 시각 주입(테스트).
- 사본 키 모양 `snap:<id>:<YYYY-MM-DD>`·`month:<id>:<YYYY-MM>`, 자리 접두사는 `ORIGIN_KEY_PREFIXES` 그대로.
- 백업 레포는 공개 dongari 레포와 따로. 그 레포에는 암호문만 들어간다.
- 운영 문서: CLAUDE.md "자동 보관 서버 배포"·"보관 지켜보기"·"보관본 꺼내기" 절에 새 비밀값·워크플로·옵션을 적는다.
- 자리(#185):
  - `worker/src/keep.ts`: `KeepStore`(Cloudflare KV 의 `put(key, value, { metadata, expirationTtl })`·`getWithMetadata`·`list` 의 `metadata` 와 같은 모양 — `@cloudflare/workers-types` 의 `KVNamespace` 가 `KeepStore` 자리에 들어가는지 레포 밖에서 타입 검사로 확인), 사본 남기기 `copyBeforeOverwrite`, 목록 `getHistory`, 지우기 `deleteKeep`, 키 모양 `keepKeysOf`. 서버 시각은 `handleKeepRequest(request, env, clock)` 의 `clock`(기본 `new Date()`, 상태 신호 `seenAt`·요약 `now` 도 같은 시계). 테스트 `worker/src/index.test.ts` "SPEC-011"(가짜 KV 가 metadata·TTL·쓰기 실패를 흉내).
  - `scripts/keepRescue.ts`: 명령줄 `parseRescueArgs`, 목록 `listKeep`·`describeList`, 사본 받기 `rescueKeep(code, keepUrl, fetchFn, target)`. 테스트 `scripts/keepRescue.test.ts` "SPEC-011"(가짜 서버, 앱의 `sealKeep` 으로 잠근 사본).

## 열린 질문

- Cloudflare API 토큰 바꾸기(예전에 채팅에 붙임) — 결정: 사용자가 대시보드에서 새로 만들어 레포 비밀값 교체(이 스펙 이슈와 별개)

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-11-24 | 초안·승인. 시안 https://claude.ai/artifact/YGW12D9fPMnTfQiZg9s5Ac (독립 점검 반영), 결정 A-1·B-1 추천안, A-2(사용자 화면)는 사용자 요청으로 빼고 개발자 꺼내기만 |
| 2026-11-24 | 이슈 분해: 상위 #184, 하위 #185 보관 서버 날짜별 사본·꺼내기 날짜 고르기, #186 서버 밖 주간 사본·보관 지켜보기 |
| 2026-11-24 | 서버 날짜별 사본·꺼내기 날짜 고르기 구현(#185): 1절·3절 "구현에서 정한 것"(달 사본 metadata, 날 가르기는 서버 시각, 복사 실패 503, 쿼리 형식 400, 목록은 KV list metadata, 옵션 하나만·쓰는 법, 목록 줄 모양·못 푼 줄, 달 파일 이름, 없는 날·달 안내), 예외에 [지우기]와 KV list 지연, 기술 메모에 코드 자리 |
