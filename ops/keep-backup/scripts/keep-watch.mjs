// 보관 지켜보기 (우리 장부 SPEC-007·SPEC-012) — .github/workflows/keep-watch.yml 이 하루 한 번 돌린다
//
// 보관 서버 요약(GET {KEEP_URL}/v1/report, Bearer REPORT_TOKEN)을 받아 레포 맨 위 devices.json(기기 이름표)과 함께
// 판정하고(scripts/keepWatch.ts), $GITHUB_STEP_SUMMARY 에 기기별 표와 앱 오류 표(SPEC-012 2절, 마지막 칸 위치)를 쓴다. 실패는 ::error 후 exit 1(→ GitHub 실패 메일),
// 경고는 ::warning. devices.json 이 없으면 모든 기기가 "이름 없는 기기" 경고고, 읽지 못하면(폴더·권한) 오류 코드(EISDIR·EACCES 등)를 붙인 모양 틀림 실패다.
// 의존성 없음. Node 24 가 keepWatch.ts 의 타입만 지우고 바로 불러온다(빌드·npm 없음).
//
//   KEEP_URL=https://… REPORT_TOKEN=… node scripts/keep-watch.mjs     # 레포 맨 위 폴더에서
//
// 토큰은 요청 헤더에만 쓰고 출력하지 않는다.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { annotations, DEVICES_FILE, judgeReport, readDeviceNames, renderSummary } from './keepWatch.ts'

const TIMEOUT_MS = 15_000

const keepUrl = (process.env.KEEP_URL ?? '').replace(/\/+$/, '')
const token = process.env.REPORT_TOKEN ?? ''
if (!keepUrl || !token) {
  console.log('::error title=보관 지켜보기 설정 없음::환경변수 KEEP_URL 과 REPORT_TOKEN 이 필요해요')
  process.exit(1)
}

// 서버를 불러 판정 함수가 받는 모양으로 바꾼다. 본문은 200 일 때만 JSON 으로 읽는다
async function fetchReport() {
  try {
    const response = await fetch(`${keepUrl}/v1/report`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = response.status === 200 ? await response.json().catch(() => undefined) : undefined
    return { kind: 'http', status: response.status, body }
  } catch {
    return { kind: 'unreachable' }
  }
}

// 기기 이름표는 지금 폴더(워크플로에서는 레포 맨 위)의 devices.json. 없으면 undefined → 빈 이름표.
// 읽다 던진 예외(폴더·권한)는 readDeviceNames 가 오류 코드를 붙인 모양 틀림으로 바꾼다 — 요약은 그대로 쓴다 (#207·#209 리뷰)
const deviceNames = readDeviceNames(() => (existsSync(DEVICES_FILE) ? readFileSync(DEVICES_FILE, 'utf8') : undefined))
const verdict = judgeReport(await fetchReport(), deviceNames)
const summary = renderSummary(verdict)

console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
for (const line of annotations(verdict)) console.log(line)

process.exit(verdict.failures.length > 0 ? 1 : 0)
