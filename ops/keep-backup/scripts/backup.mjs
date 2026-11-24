// 주간 보관본 받기 (우리 장부 SPEC-011 2절) — .github/workflows/backup.yml 이 일주일에 한 번 돌린다
//
// 보관 서버 내보내기(GET {KEEP_URL}/v1/export, Bearer EXPORT_TOKEN)를 받아 지금 폴더의
// keep/<id>.json(겉봉투 그대로)·index.json 을 고친다(규칙은 scripts/backupPlan.ts). 커밋은 워크플로가 한다.
// 실패는 ::error 후 exit 1(→ GitHub 실패 메일). 토큰·서버 주소는 출력하지 않는다.
// 의존성 없음. Node 24 가 backupPlan.ts 의 타입만 지우고 바로 불러온다(빌드·npm 없음).
//
//   KEEP_URL=https://… EXPORT_TOKEN=… node scripts/backup.mjs     # 레포 맨 위 폴더에서
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { INDEX_FILE, KEEP_DIR, planBackup } from './backupPlan.ts'

const TIMEOUT_MS = 30_000

function fail(message) {
  console.log(`::error title=주간 보관본::${message}`)
  process.exit(1)
}

const keepUrl = (process.env.KEEP_URL ?? '').replace(/\/+$/, '')
const token = process.env.EXPORT_TOKEN ?? ''
if (!keepUrl || !token) fail('환경변수 KEEP_URL 과 EXPORT_TOKEN 이 필요해요')

// 서버를 부른다. 오류 내용(주소가 들어 있을 수 있음)은 찍지 않고 까닭만 나눈다
async function fetchExport() {
  let response
  try {
    response = await fetch(`${keepUrl}/v1/export`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    fail('보관 서버에 닿지 못했어요 (연결 실패). 서버가 살아 있는지, 변수 KEEP_URL 이 맞는지 확인하세요')
  }
  if (response.status === 401) {
    fail(
      '보관 서버가 내보내기 토큰을 받지 않아요 (401). 이 레포 비밀값 EXPORT_TOKEN 과 dongari 레포 비밀값 KEEP_EXPORT_TOKEN 이 같은 값인지 보고, ' +
        'dongari Actions "보관 서버" 를 다시 실행(Run workflow)해 Worker 비밀값 EXPORT_TOKEN 에 넣으세요',
    )
  }
  if (response.status === 404) fail('보관 서버에 내보내기 경로가 없어요 (404, 예전 버전). dongari 보관 서버 배포를 확인하세요')
  if (response.status !== 200) fail(`보관 서버가 오류로 답했어요 (HTTP ${response.status}). 잠시 뒤 다시 실행하세요`)
  return response.json().catch(() => undefined)
}

const body = await fetchExport()
const existing = existsSync(KEEP_DIR) ? readdirSync(KEEP_DIR) : []
const plan = planBackup(body, existing)
if (!plan.ok) fail(plan.message)

mkdirSync(KEEP_DIR, { recursive: true })
for (const file of plan.files) writeFileSync(file.path, file.text)
for (const path of plan.removePaths) rmSync(path)
writeFileSync(INDEX_FILE, plan.indexText)

console.log(`보관본 ${plan.files.length}개를 썼고, 서버 목록에 없는 ${plan.removePaths.length}개를 지웠어요 (내보낸 때 ${plan.exportedAt})`)
