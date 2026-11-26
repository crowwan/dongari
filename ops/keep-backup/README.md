# 우리 장부 주간 보관본·보관 지켜보기 (비공개)

[우리 장부](https://github.com/crowwan/dongari) 자동으로 지키기를 개발자만 보는 곳에서 지키는 레포다. 두 가지를 한다.

- **주간 보관본**: 자동으로 지키기의 **서버 밖 주간 사본**(dongari `docs/specs/SPEC-011-keep-history.md` 2절, `docs/decisions/010-keep-history-offsite.md`). 보관 서버(Cloudflare Worker + KV)가 계정 문제나 잘못 지우기로 한꺼번에 사라져도 다른 회사(GitHub)에 한 벌이 남게 한다. 커밋 이력이 곧 주마다의 사본이다.
- **보관 지켜보기**: 보관이 밀리거나 서버가 죽었는지, 폰에서 앱 오류가 났는지 매일 아침 판정해 문제가 있으면 실패 메일로 알린다(dongari `docs/specs/SPEC-007-keep-watch.md`·`SPEC-012-watch-and-app-errors.md` 1·2절, `docs/decisions/011-private-watch-and-app-errors.md`). 결과에 기기마다 앱을 연 때·앱 버전·앱 오류가 들어 있어 공개 레포(dongari)가 아니라 여기서 돈다.

> 이 레포 파일의 원본은 dongari 레포 `ops/keep-backup/` 이다. 고칠 때는 거기서 PR 로 리뷰·테스트(`scripts/keepBackupPlan.test.ts`·`scripts/keepWatch.test.ts`)하고 이 레포에 같은 경로로 옮긴다. 이 레포에만 있는 `devices.json`·`keep/`·`index.json` 은 dongari 에 없다(옮길 때 덮지 않는다). 워크플로를 올리는 커밋은 개발자 계정으로 한다(예약 실행의 실패 메일은 cron 을 마지막으로 고친 사람에게 간다).

## 들어 있는 것

| 파일 | 내용 |
|---|---|
| `keep/<id>.json` | 보관 서버 본 자리 최신본의 겉봉투 `{ v, savedAt, iv, data }` 그대로(한 줄). `<id>` 는 복구 코드에서 만든 64자 해시 |
| `index.json` | `[{ id, savedAt, bytes }]` (id 순). `savedAt` 은 서버가 받은 시각, `bytes` 는 파일 크기 |
| `devices.json` | 보관 지켜보기의 기기 이름표 `{ "aaa97843": "엄마 폰" }` (아래 "기기 이름표"). 이 레포에서 손으로 쓴다 |
| `scripts/backup.mjs`·`scripts/backupPlan.ts` | 주간 보관본 받기·파일로 바꾸기 (Node 24, 의존성 없음) |
| `scripts/keep-watch.mjs`·`scripts/keepWatch.ts` | 보관 지켜보기 요약 받기·판정 (Node 24, 의존성 없음) |
| `.github/workflows/backup.yml` | 주간 보관본, 매주 실행 |
| `.github/workflows/keep-watch.yml` | 보관 지켜보기, 매일 실행 |

- **보관본은 암호문만 있다.** 장부 내용은 폰에서 복구 코드로 잠근 것이라, 복구 코드를 아는 사람만 풀 수 있다. 이 레포를 봐도 장부 이름·금액·사람 이름은 보이지 않는다. 보이는 것은 해시 이름(id)·보관 시각·크기뿐이다.
- 미리보기 주소(`preview:`)의 보관본과 서버의 날짜별·달별 사본은 넣지 않는다. 본 주소 최신본만.
- `devices.json` 과 지켜보기 실행 기록에는 가족 이름(이름표)과 앱을 연 때가 평문으로 있다. 이 레포를 공개로 바꾸지 않는다.

## 언제 도나

### 주간 보관본 (`backup.yml`)

- 매주 일요일 23:00 UTC(월요일 08:00 KST).
- 손으로: Actions → "주간 보관본" → Run workflow.
- `GET $KEEP_URL/v1/export` 를 받아 `keep/<id>.json` 을 쓰고, 이번 목록에 없는 id 의 파일은 지우고(앱에서 [지우기]를 한 사람, **한 번에 1개까지**), `index.json` 을 쓴다. 바뀐 게 있으면 "주간 보관본 YYYY-MM-DD"(한국 날짜)로 커밋한다. 아무도 기록을 고치지 않은 주는 커밋이 없다.
- 실패하면 GitHub 가 실패 메일을 보낸다(예약 실행의 메일은 워크플로를 만든 사람, cron 을 다른 사람이 고쳤으면 그 사람에게. 계정 Settings → Notifications → Actions 에서 메일이 켜져 있어야 한다).
- 알림은 둘로 나뉜다. 서버는 답을 줄 때 "마지막 내보내기"를 적어 둔다. 그래서 **워크플로가 서버를 부르지 못하면**(예약 실행이 멈춤·꺼짐, 토큰 401, 서버 오류) 이 레포의 보관 지켜보기가 8일 뒤 "서버 밖 사본이 N일째 없어요"로 실패하고, **답을 받은 뒤 실패하면**(모양 거절·지우기 멈춤·커밋·push 실패) 지켜보기는 모르고 주간 보관본의 실패 메일만 온다.
- 지켜보기(매일 07:17 KST)가 주간 보관본(월요일 08:00 KST)보다 먼저 돈다. 그래서 월요일 아침 지켜보기는 지난주 내보내기를 보고, 월요일 실행이 빠지면 수요일 아침 지켜보기가 "서버 밖 사본이 8일째 없어요"로 알린다.

### 보관 지켜보기 (`keep-watch.yml`)

- 매일 22:17 UTC(다음 날 07:17 KST). 정각(0분)은 GitHub 예약 실행이 몰려 늦거나 빠질 수 있어 피했다.
- 손으로: Actions → "보관 지켜보기" → Run workflow.
- `GET $KEEP_URL/v1/report`(Bearer `REPORT_TOKEN`)를 받아 레포 맨 위 `devices.json`(기기 이름표)과 함께 판정한다. 판정 규칙은 dongari SPEC-007 "판정" 표와 SPEC-012 "판정에 더하는 것"·2절 6번(앱 오류).
- 문제가 있으면 실패로 끝나고 GitHub 가 실패 메일을 보낸다(메일을 받는 사람은 주간 보관본과 같다). 경고는 성공으로 끝나 메일이 오지 않는다 — 가끔 실행 요약을 본다.
- 실행 화면 요약(Summary)에 결과 줄, 실패·경고 목록, 기기별 표(기기·마지막 신호·자동 보관·밀린 때·마지막 보관·크기·앱 버전, 시각은 KST), "앱 오류" 표(기기·화면·종류·이름·글·횟수·처음·마지막·위치, 폰 시각을 KST 로), 마지막 내보내기 한 줄이 남는다.
- 앱 오류는 폰이 최근 7일 것을 상태 신호에 실어 보낸다(dongari SPEC-012 2절). 마지막 때가 요약 시각 앞뒤 36시간 안인 줄만 실패이고, 그보다 오래된 줄(폰 시계가 36시간 넘게 앞선 줄도)은 "앱 오류" 표에만 남는다. 오류가 없으면 표 대신 "앱 오류가 없어요".
- Actions 시간: 한 번 1분 안쪽이라 한 달 30분쯤(비공개 레포 무료 2,000분).

## 필요한 값

| 이름 | 종류 | 쓰는 곳 | 값 |
|---|---|---|---|
| `EXPORT_TOKEN` | Secrets | 주간 보관본 | dongari 레포 비밀값 `KEEP_EXPORT_TOKEN` 과 같은 값. dongari "보관 서버" 배포가 그 값을 Worker 비밀값 `EXPORT_TOKEN` 으로 넣는다 |
| `REPORT_TOKEN` | Secrets | 보관 지켜보기 | dongari 레포 비밀값 `KEEP_REPORT_TOKEN` 과 같은 값. dongari "보관 서버" 배포가 그 값을 Worker 비밀값 `REPORT_TOKEN` 으로 넣는다 |
| `KEEP_URL` | Variables | 둘 다 | dongari 의 `KEEP_URL` 과 같은 보관 서버 주소 |

- 토큰을 바꿀 때: `openssl rand -hex 32` 로 만든 값을 이 레포 비밀값과 dongari 비밀값(`EXPORT_TOKEN` ↔ `KEEP_EXPORT_TOKEN`, `REPORT_TOKEN` ↔ `KEEP_REPORT_TOKEN`)에 같게 넣고, dongari Actions "보관 서버" → Run workflow 로 Worker 에 넣은 뒤 여기 Run workflow. 두 토큰은 서로 다른 값이다(요약 토큰으로는 내보내기가 안 열린다).
- 로그: 토큰은 GitHub 가 가리고 스크립트도 찍지 않는다. `KEEP_URL` 은 변수라 GitHub 가 단계 머리(env)에 보여 줄 수 있다 — 앱 화면 파일에 들어 있는 공개 주소라 괜찮다. 스크립트는 주소를 찍지 않는다.

## 기기 이름표 (`devices.json`)

지켜보기는 기기를 서버 이름(64자 해시)의 앞 8자로 안다. 이 레포 맨 위 `devices.json` 에 이름을 적어 두면 실패·경고 문구와 기기별 표에 `엄마 폰 (aaa97843)` 처럼 보인다.

```json
{
  "aaa97843": "엄마 폰",
  "bbb12345": "이모 폰"
}
```

1. 그 폰의 복구 코드를 받는다(앱 설정 맨 위 복구 코드 카드).
2. dongari 폴더에서 앞 8자를 본다. 코드를 물으면 붙여 넣고 Enter → 앞 8자 한 줄만 나온다(서버를 부르지 않고, 코드는 찍지 않는다).
   ```bash
   node scripts/keep-rescue.mjs --which
   ```
3. `devices.json` 에 `"앞 8자": "이름"` 을 더해 커밋·push 한다. 다음 실행부터 이름으로 보인다(Run workflow 로 바로 봐도 된다).

- 모양: 키는 **소문자 16진수 8자**(`--which` 가 찍는 그대로), 값은 빈칸 아닌 글자(앞뒤 빈칸은 지운다). 이름에는 줄바꿈 같은 제어 문자, `|`, 백틱을 넣지 않는다(표와 문구가 깨진다). JSON 이 아니거나 하나라도 틀리면 "기기 이름 파일(`devices.json`) 모양이 틀려요" 로 **실패**한다(판정과 표는 그대로 하고 기기는 앞 8자로 보인다). 파일이 폴더이거나 읽을 수 없어도 같은 실패이고, 그때는 문구 끝에 오류 코드가 붙는다("(읽지 못함: EISDIR)").
- 메모장 등이 파일 맨 앞에 붙이는 UTF-8 BOM 은 지우고 읽는다.
- 파일이 없으면 실패가 아니고 모든 기기가 "이름 없는 기기 `aaa97843` 가 있어요" 경고다.
- 요약에는 없는데 이름표에만 있는 기기는 "이름표의 `엄마 폰 (aaa97843)` 이 요약에 없어요" 경고다. 그 폰이 [지우기]를 했거나 복구 코드가 바뀐 것이다 — 새 코드면 `--which` 로 새 앞 8자를 보고 줄을 고친다. 지운 기기면 줄을 지운다.
- 이 파일은 dongari(공개)에 두지 않는다. dongari 는 `.gitignore` 로 막아 두었다.

## 실패 메일을 받았을 때

### 주간 보관본

| 문구 | 고칠 곳 |
|---|---|
| 비밀값 없음 / 변수 없음 | 위 "필요한 값"을 넣고 Run workflow |
| 내보내기 토큰을 받지 않아요 (401) | 이 레포 `EXPORT_TOKEN` 과 dongari `KEEP_EXPORT_TOKEN` 이 같은지 보고, dongari "보관 서버" Run workflow |
| 내보내기 경로가 없어요 (404) | dongari 보관 서버가 예전 버전. dongari Actions "보관 서버" 배포 확인 |
| 닿지 못했어요 / HTTP 5xx | 보관 서버 상태(Cloudflare 대시보드). 잠시 뒤 Run workflow. 503 은 서버가 내보낸 때를 적지 못했거나 보관본 목록이 1,000개를 넘어 잘린 것(잘린 목록은 주지 않는다) |
| 답이 틀렸어요 (id·모양·같은 id) | 서버가 이상한 답을 줌. 아무것도 쓰지 않고 멈췄다. dongari `worker/src/keep.ts` 내보내기 확인 |
| 보관본 0개를 줬는데 레포에는 N개 | 아래 "지우지 않고 멈췄을 때" |
| 서버 목록에 없는 보관본이 N개(…)라 지우지 않고 멈춰요 | 아래 "지우지 않고 멈췄을 때" |

#### 지우지 않고 멈췄을 때

다음 두 경우에는 **아무것도 지우지(쓰지) 않고** 실패로 멈춘다.

- 서버가 보관본을 하나도 주지 않았는데 레포에 파일이 있음.
- 이번 목록에 없어 지울 파일이 2개 이상임(한 번에 1개까지만 지운다). 문구에 그 파일들의 id 앞 8자가 있다.

보관본이 사라지는 길은 앱의 [지우기]뿐이고, 한 주에 둘 이상 지우는 일은 드물다. 그보다 서버(KV)를 잃은 뒤 폰 몇 대만 다시 보관했거나 서버가 잘못 답한 것일 수 있다 — 이 레포가 있는 바로 그 사고다. 먼저 보관 서버를 확인한다(dongari CLAUDE.md "자동 보관 서버 배포"). 서버를 잃은 것이면 레포 파일이 지금 유일한 사본이니 지우지 않는다.

정말 그 사람들이 [지우기]를 해서 지울 일이면, 문구에 나온 파일을 손으로 지우고 다시 실행한다(`index.json` 은 다음 실행이 맞춘다):

```bash
git rm -q keep/<id 1>.json keep/<id 2>.json     # 모두 지울 일이면 keep/*.json
git commit -m "보관본 손으로 지움" && git push
# 그 뒤 Actions → "주간 보관본" → Run workflow
```

### 보관 지켜보기

실패(메일이 온다). 문구의 기기는 이름표에 이름이 있으면 `엄마 폰 (aaa97843)`, 없으면 기기 `aaa97843` 로 보인다.

| 문구 | 고칠 곳 |
|---|---|
| 보관 지켜보기 비밀값 없음 / 변수 없음 | 위 "필요한 값"의 `REPORT_TOKEN`·`KEEP_URL` 을 넣고 Run workflow |
| 보관 서버가 요약 토큰을 받지 않아요 (401) | 이 레포 `REPORT_TOKEN` 과 dongari `KEEP_REPORT_TOKEN` 이 같은지 보고, dongari Actions "보관 서버" → Run workflow(Worker 에 넣는다) 뒤 여기 Run workflow |
| 보관 서버가 응답하지 않아요 (연결 실패 · HTTP 코드 · 요약 형식이 틀림) | 보관 서버 상태(Cloudflare 대시보드)와 dongari "보관 서버" 배포. 404 는 요약 경로가 없는 예전 서버, "요약 형식이 틀림"은 서버가 이상한 답을 준 것(dongari `worker/src/keep.ts` 요약) |
| … 이 3일 넘게 보관하지 못했어요 (밀린 때 …) | 그 폰에서 자동으로 지키기가 막혔다. 그 폰에서 인터넷이 되는 곳에서 앱을 열어 보게 하고, 안 풀리면 기록 파일 보내기로 따로 지킨다 |
| … 의 기록이 1MB 를 넘어 보관하지 못했어요 | 그 장부가 보관 크기 한도(dongari SPEC-006)를 넘었다. 기록 파일 보내기로 따로 지키게 한다 |
| 서버 밖 사본이 N일째 없어요 | 위 "주간 보관본" 실행 기록을 본다(예약 실행이 꺼짐·401·서버 오류) |
| … 에서 앱 오류가 났어요: 화면 · 종류 · 이름 "글" · N번 · 마지막 … KST | 그 폰에서 36시간 안에 앱 오류가 났다(아래 "앱 오류가 났을 때") |
| 기기 이름 파일(`devices.json`) 모양이 틀려요 | 위 "기기 이름표"의 모양대로 고쳐 push. 끝에 "(읽지 못함: EISDIR)"처럼 붙었으면 모양이 아니라 파일을 읽지 못한 것이다(EISDIR 은 같은 이름의 폴더, EACCES 는 권한) |

경고(성공으로 끝나 메일은 오지 않는다, 실행 요약에서 본다): 자동 보관을 껐어요 / 30일 넘게 앱을 열지 않았어요 / 아직 상태 신호가 없어요 / 아직 서버 밖 사본이 없어요 / 이름 없는 기기 `…` 가 있어요 / 이름표의 `…` 이 요약에 없어요. 이름 경고 둘은 위 "기기 이름표".

#### 앱 오류가 났을 때

- 문구 예: `` `엄마 폰 (aaa97843)` 에서 앱 오류가 났어요: 회비 표(`dues`) · render · TypeError "Cannot read properties of undefined (reading '…')" · 3번 · 마지막 2026-11-25 14:02 KST ``.
  - 화면은 사람 말과 앱 안 이름이다. 오류가 난 화면은 그리려던 화면이다(새 화면이 처음 그릴 때 났어도 그 화면). 장부 화면들 밖에는 첫 실행 물음(`first-run`)·연습 장부(`practice`)·카톡 안 안내(`in-app`)가 있다. 모르는 화면은 이름만(`unknown`, 앱을 열자마자 화면을 고르기 전에 난 오류도) 보인다.
  - 종류: `render` 화면 그리기(사용자는 "다시 열기" 화면을 봤다), `uncaught` 잡히지 않은 오류, `rejection` 잡히지 않은 Promise 거절, `save` 기록 저장 실패.
- 글은 폰이 정리한 것이라 숫자는 `#`, 한글 같은 글자는 `…`, 주소는 파일 이름만 보인다. 표와 문구에 넣을 때 `|` 는 `¦`, 백틱은 `'`, `<` `>` 는 `‹` `›`, `[` `]` 는 `［` `］`, 줄바꿈은 빈칸으로 바뀐다(기기별 표의 앱 버전도).
- 36시간 기준이라 같은 오류로 메일이 이틀 올 수 있다. 다음 날도 오면 폰에서 또 난 것이다(마지막 때를 본다).
- 고칠 곳: dongari 에서 그 화면을 재현해 본다. "앱 오류" 표 마지막 **위치** 칸(번들 파일이름:줄:칸, 예 `index-BjTnp9wE.js:1:23456`, 저장 실패처럼 위치가 없으면 `-`)으로, 그 버전 태그를 소스맵과 함께 다시 빌드해 찾는다(소스맵 올리기는 dongari SPEC-012 범위 밖). 위치는 실패 문구에는 넣지 않는다.
- 미리보기 주소에서 난 오류는 미리보기 자리에만 남아 여기에 나오지 않는다.

## 되살리는 법

사용자가 복구 코드를 알려 주면, dongari 레포의 개발자용 꺼내기 스크립트가 이 레포 파일을 기록 파일로 푼다(서버를 부르지 않는다).

```bash
# 이 레포와 dongari 를 나란히 clone 해 둔 경우, dongari 폴더에서
node scripts/keep-rescue.mjs --file ../dongari-keep-backup/keep/<id>.json
# 복구 코드를 물으면 붙여 넣고 Enter → ~/Downloads/우리장부-기록-YYYY-MM-DD-주간사본.txt
```

- 어느 파일인지 모르면 아무 `keep/*.json` 으로 한 번 돌려 본다. 다른 코드의 파일이면 "이 코드의 파일이 아니에요. 이 코드의 파일은 백업 레포의 keep/1a2b3c4d….json 이에요"(id 앞 8자)라고 알려 준다.
- 지난 주의 모습이 필요하면 그 주 커밋에서 꺼낸다. **파일 이름은 `<id>.json` 그대로** 둬야 한다(꺼내기가 이름으로 코드를 맞춰 본다).
  ```bash
  git log --oneline -- keep/<id>.json                 # 그 파일이 바뀐 주들
  mkdir -p ~/keep-old && git show <커밋>:keep/<id>.json > ~/keep-old/<id>.json
  node scripts/keep-rescue.mjs --file ~/keep-old/<id>.json   # dongari 폴더에서
  ```
- 만든 기록 파일을 카톡으로 보내 앱 설정 [기록 파일 불러오기]로 열게 한다. 기록 파일에는 장부 전체와 복구 코드가 평문으로 들어 있으니 **다 보냈으면 지운다**. 더 자세한 것은 dongari CLAUDE.md "보관본 꺼내기".

## 지워 달라는 요청을 받았을 때 (이력 지우기)

앱에서 자동으로 지키기를 끄고 [지우기]를 하면 서버의 최신본·날짜별 사본은 지워지고, 다음 주 실행이 이 레포의 `keep/<id>.json` 도 지운다. 하지만 **지난 커밋에는 남는다.** 그것까지 지워 달라고 하면 이력을 다시 쓴다.

1. 서버에서 지워졌는지 먼저 본다(사용자가 [지우기]를 했는지). 서버에 남아 있으면 다음 주에 파일이 다시 생긴다.
2. Actions → "주간 보관본" → ··· → Disable workflow (지우는 동안 커밋이 끼지 않게).
3. 새로 clone 해서 그 파일을 모든 커밋에서 지운다 (`brew install git-filter-repo`).
   ```bash
   git clone git@github.com:crowwan/dongari-keep-backup.git keep-backup-clean && cd keep-backup-clean
   git filter-repo --invert-paths --path keep/<id>.json
   # index.json 이력의 그 id(해시·시각·크기, 내용 아님)까지 가리려면
   printf '%s==>지운-보관본\n' '<id>' > ../replace.txt && git filter-repo --replace-text ../replace.txt
   git remote add origin git@github.com:crowwan/dongari-keep-backup.git   # filter-repo 가 origin 을 지운다
   git push --force origin main
   ```
4. Enable workflow 로 다시 켠다. 손에 남은 옛 clone 들도 지운다. `devices.json` 에 그 기기 줄이 있으면 지운다(남겨 두면 지켜보기가 매일 "요약에 없어요" 경고).
5. GitHub 는 지운 커밋을 SHA 주소로 한동안 열어 줄 수 있다. 완전히 지우려면 GitHub 지원에 캐시된 보기 정리를 요청한다(GitHub 문서 "Removing sensitive data from a repository").
