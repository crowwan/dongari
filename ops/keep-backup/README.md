# 우리 장부 주간 보관본 (비공개)

[우리 장부](https://github.com/crowwan/dongari) 자동으로 지키기의 **서버 밖 주간 사본**이다(dongari `docs/specs/SPEC-011-keep-history.md` 2절, `docs/decisions/010-keep-history-offsite.md`). 보관 서버(Cloudflare Worker + KV)가 계정 문제나 잘못 지우기로 한꺼번에 사라져도 다른 회사(GitHub)에 한 벌이 남게 한다. 커밋 이력이 곧 주마다의 사본이다.

> 이 레포 파일의 원본은 dongari 레포 `ops/keep-backup/` 이다. 고칠 때는 거기서 PR 로 리뷰·테스트(`scripts/keepBackupPlan.test.ts`)하고 이 레포에 옮긴다.

## 들어 있는 것

| 파일 | 내용 |
|---|---|
| `keep/<id>.json` | 보관 서버 본 자리 최신본의 겉봉투 `{ v, savedAt, iv, data }` 그대로(한 줄). `<id>` 는 복구 코드에서 만든 64자 해시 |
| `index.json` | `[{ id, savedAt, bytes }]` (id 순). `savedAt` 은 서버가 받은 시각, `bytes` 는 파일 크기 |
| `scripts/backup.mjs`·`scripts/backupPlan.ts` | 받기·파일로 바꾸기 (Node 24, 의존성 없음) |
| `.github/workflows/backup.yml` | 매주 실행 |

- **암호문만 있다.** 장부 내용은 폰에서 복구 코드로 잠근 것이라, 복구 코드를 아는 사람만 풀 수 있다. 이 레포를 봐도 장부 이름·금액·사람 이름은 보이지 않는다. 보이는 것은 해시 이름(id)·보관 시각·크기뿐이다.
- 미리보기 주소(`preview:`)의 보관본과 서버의 날짜별·달별 사본은 넣지 않는다. 본 주소 최신본만.

## 언제 도나

- 매주 일요일 23:00 UTC(월요일 08:00 KST). dongari 보관 지켜보기(매일 09:00 KST)보다 앞.
- 손으로: Actions → "주간 보관본" → Run workflow.
- `GET $KEEP_URL/v1/export` 를 받아 `keep/<id>.json` 을 쓰고, 이번 목록에 없는 id 의 파일은 지우고(앱에서 [지우기]를 한 사람), `index.json` 을 쓴다. 바뀐 게 있으면 "주간 보관본 YYYY-MM-DD"(한국 날짜)로 커밋한다. 아무도 기록을 고치지 않은 주는 커밋이 없다.
- 실패하면 GitHub 가 실패 메일을 보낸다(예약 실행의 메일은 워크플로를 만든 사람, cron 을 다른 사람이 고쳤으면 그 사람에게. 계정 Settings → Notifications → Actions 에서 메일이 켜져 있어야 한다). 내보내기가 8일 넘게 없으면 dongari 보관 지켜보기도 "서버 밖 사본이 N일째 없어요"로 실패한다.

## 필요한 값

| 이름 | 종류 | 값 |
|---|---|---|
| `EXPORT_TOKEN` | Secrets | dongari 레포 비밀값 `KEEP_EXPORT_TOKEN` 과 같은 값. dongari "보관 서버" 배포가 그 값을 Worker 비밀값 `EXPORT_TOKEN` 으로 넣는다 |
| `KEEP_URL` | Variables | dongari 의 `KEEP_URL` 과 같은 보관 서버 주소 |

- 토큰을 바꿀 때: `openssl rand -hex 32` 로 만든 값을 이 레포 `EXPORT_TOKEN` 과 dongari `KEEP_EXPORT_TOKEN` 에 같게 넣고, dongari Actions "보관 서버" → Run workflow 로 Worker 에 넣은 뒤 여기 Run workflow.
- 로그: 토큰은 GitHub 가 가리고 스크립트도 찍지 않는다. `KEEP_URL` 은 변수라 GitHub 가 단계 머리(env)에 보여 줄 수 있다 — 앱 화면 파일에 들어 있는 공개 주소라 괜찮다. 스크립트는 주소를 찍지 않는다.

## 실패 메일을 받았을 때

| 문구 | 고칠 곳 |
|---|---|
| 비밀값 없음 / 변수 없음 | 위 "필요한 값"을 넣고 Run workflow |
| 내보내기 토큰을 받지 않아요 (401) | 이 레포 `EXPORT_TOKEN` 과 dongari `KEEP_EXPORT_TOKEN` 이 같은지 보고, dongari "보관 서버" Run workflow |
| 내보내기 경로가 없어요 (404) | dongari 보관 서버가 예전 버전. dongari Actions "보관 서버" 배포 확인 |
| 닿지 못했어요 / HTTP 5xx | 보관 서버 상태(Cloudflare 대시보드). 잠시 뒤 Run workflow |
| 답이 틀렸어요 (id·모양·같은 id) | 서버가 이상한 답을 줌. 아무것도 쓰지 않고 멈췄다. dongari `worker/src/keep.ts` 내보내기 확인 |
| 보관본 0개를 줬는데 레포에는 N개 | 아래 "0개라서 멈췄을 때" |

### 0개라서 멈췄을 때

서버가 보관본을 하나도 주지 않았는데 레포에 파일이 있으면, 한꺼번에 지우지 않고 실패로 멈춘다. 서버(KV)가 비었거나 잘못 답한 것일 수 있기 때문이다. 먼저 보관 서버를 확인한다(dongari CLAUDE.md "자동 보관 서버 배포").

정말 모두가 [지우기]를 해서 다 지울 일이면 손으로 지운다:

```bash
git rm -q keep/*.json && printf '[]\n' > index.json && git add index.json
git commit -m "보관본 모두 지움" && git push
```

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
4. Enable workflow 로 다시 켠다. 손에 남은 옛 clone 들도 지운다.
5. GitHub 는 지운 커밋을 SHA 주소로 한동안 열어 줄 수 있다. 완전히 지우려면 GitHub 지원에 캐시된 보기 정리를 요청한다(GitHub 문서 "Removing sensitive data from a repository").
