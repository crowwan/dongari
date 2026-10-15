// 보관 지켜보기 (SPEC-007, #106) — .github/workflows/keep-watch.yml 이 하루 한 번 돌린다
//
// 보관 서버 요약(GET {KEEP_URL}/v1/report)을 받아 판정하고(scripts/keepWatch.ts),
// $GITHUB_STEP_SUMMARY 에 기기별 표를 쓴다. 실패는 ::error 후 exit 1(→ GitHub 실패 메일), 경고는 ::warning.
// 의존성 없음. Node 24 가 keepWatch.ts 의 타입만 지우고 바로 불러온다(빌드 없음).
//
//   KEEP_URL=https://… KEEP_REPORT_TOKEN=… node scripts/keep-watch.mjs
//
// 토큰은 요청 헤더에만 쓰고 출력하지 않는다.
import { appendFileSync } from 'node:fs'
import { annotations, judgeReport, renderSummary } from './keepWatch.ts'

const TIMEOUT_MS = 15_000

const keepUrl = (process.env.KEEP_URL ?? '').replace(/\/+$/, '')
const token = process.env.KEEP_REPORT_TOKEN ?? ''
if (!keepUrl || !token) {
  console.log('::error title=보관 지켜보기 설정 없음::환경변수 KEEP_URL 과 KEEP_REPORT_TOKEN 이 필요해요')
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

const verdict = judgeReport(await fetchReport())
const summary = renderSummary(verdict)

console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
for (const line of annotations(verdict)) console.log(line)

process.exit(verdict.failures.length > 0 ? 1 : 0)
