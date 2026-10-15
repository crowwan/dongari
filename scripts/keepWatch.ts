// 보관 지켜보기 판정 (SPEC-007 "판정", #106)
//
// 서버 요약(`GET /v1/report`) 응답을 받아 실패·경고 문구와 실행 요약 표를 만든다. 입출력 없는 순수 함수만 둔다.
// 워크플로는 scripts/keep-watch.mjs 가 이 파일을 그대로 불러 쓴다(Node 24 가 타입만 지우고 실행, 빌드 없음).
// 그래서 타입 지우기로 없어지는 문법만 쓴다(enum·namespace 없음, tsconfig erasableSyntaxOnly).

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// 앱 안 띠(7일)보다 먼저 알기 위한 값
export const PENDING_LIMIT_MS = 3 * DAY_MS
export const SILENT_LIMIT_MS = 30 * DAY_MS
const KST_OFFSET_MS = 9 * HOUR_MS
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export const SERVER_DOWN = '보관 서버가 응답하지 않아요'
export const TOKEN_REJECTED = '보관 서버가 요약 토큰을 받지 않아요 (401). 레포 Secrets `KEEP_REPORT_TOKEN` 과 Worker 비밀값 `REPORT_TOKEN` 이 같은 값인지 확인하세요'
export const NO_SIGNAL = '아직 상태 신호가 없어요'

// 서버를 부른 결과: 연결 자체가 안 됐거나(시간 초과 포함), 상태 코드와 JSON 본문(못 읽었으면 undefined)
export type ReportResponse =
  | { kind: 'unreachable' }
  | { kind: 'http'; status: number; body: unknown }

export interface DeviceReport {
  id: string
  seenAt: string
  enabled: boolean
  pendingSince?: string
  lastKeptAt?: string
  tooLarge: boolean
  appVersion: string
}

export interface Report {
  now: string
  devices: DeviceReport[]
}

export interface Verdict {
  // 요약 형식이 맞았을 때만 있다 (표를 그릴 거리)
  report?: Report
  failures: string[]
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
}

function isOptionalIsoDate(value: unknown): value is string | undefined {
  return value === undefined || isIsoDate(value)
}

function toDevice(value: unknown): DeviceReport | null {
  if (!isRecord(value)) return null
  const { id, seenAt, enabled, pendingSince, lastKeptAt, tooLarge, appVersion } = value
  if (typeof id !== 'string' || id.length === 0) return null
  if (!isIsoDate(seenAt) || typeof enabled !== 'boolean' || typeof tooLarge !== 'boolean') return null
  if (!isOptionalIsoDate(pendingSince) || !isOptionalIsoDate(lastKeptAt)) return null
  if (typeof appVersion !== 'string') return null
  return { id, seenAt, enabled, pendingSince, lastKeptAt, tooLarge, appVersion }
}

// 서버 요약 형식 `{ now, devices: [...] }` 이 맞으면 Report, 하나라도 틀리면 null
export function parseReport(body: unknown): Report | null {
  if (!isRecord(body) || !isIsoDate(body.now) || !Array.isArray(body.devices)) return null
  const devices: DeviceReport[] = []
  for (const item of body.devices) {
    const device = toDevice(item)
    if (!device) return null
    devices.push(device)
  }
  return { now: body.now, devices }
}

// 사람이 읽는 시각: 한국 시간 `2026-10-12 09:30`
export function formatKst(iso: string): string {
  const shifted = new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString()
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)}`
}

function judgeDevice(device: DeviceReport, now: number): { failures: string[]; warnings: string[] } {
  const name = `기기 \`${device.id}\``
  const failures: string[] = []
  const warnings: string[] = []

  // 밀린 시간은 신호를 받은 때 기준이다. 앱을 안 열면 그 뒤 보관됐는지 알 수 없으니 (그때는 30일 경고로만 안다)
  if (device.pendingSince !== undefined && Date.parse(device.seenAt) - Date.parse(device.pendingSince) > PENDING_LIMIT_MS) {
    failures.push(`${name} 가 3일 넘게 보관하지 못했어요 (밀린 때 ${formatKst(device.pendingSince)} KST)`)
  }
  if (device.tooLarge) failures.push(`${name} 의 기록이 1MB 를 넘어 보관하지 못했어요`)
  if (!device.enabled) warnings.push(`${name} 가 자동 보관을 껐어요`)
  if (now - Date.parse(device.seenAt) > SILENT_LIMIT_MS) warnings.push(`${name} 가 30일 넘게 앱을 열지 않았어요`)
  return { failures, warnings }
}

// 응답 하나를 판정한다. 시각 비교는 서버 요약의 now 로 한다 (실행기 시계와 무관)
export function judgeReport(response: ReportResponse): Verdict {
  if (response.kind === 'unreachable') return { failures: [`${SERVER_DOWN} (연결 실패)`], warnings: [] }
  if (response.status === 401) return { failures: [TOKEN_REJECTED], warnings: [] }
  if (response.status !== 200) return { failures: [`${SERVER_DOWN} (HTTP ${response.status})`], warnings: [] }

  const report = parseReport(response.body)
  if (!report) return { failures: [`${SERVER_DOWN} (요약 형식이 틀림)`], warnings: [] }
  if (report.devices.length === 0) return { report, failures: [], warnings: [NO_SIGNAL] }

  const now = Date.parse(report.now)
  const judged = report.devices.map((device) => judgeDevice(device, now))
  return {
    report,
    failures: judged.flatMap((result) => result.failures),
    warnings: judged.flatMap((result) => result.warnings),
  }
}

function deviceRow(device: DeviceReport): string {
  const cells = [
    `\`${device.id}\``,
    formatKst(device.seenAt),
    device.enabled ? '켜짐' : '꺼짐',
    device.pendingSince === undefined ? '-' : formatKst(device.pendingSince),
    device.lastKeptAt === undefined ? '-' : formatKst(device.lastKeptAt),
    device.tooLarge ? '1MB 넘음' : '-',
    device.appVersion,
  ]
  return `| ${cells.join(' | ')} |`
}

function messageList(title: string, messages: string[]): string[] {
  if (messages.length === 0) return []
  return [`### ${title}`, '', ...messages.map((message) => `- ${message}`), '']
}

// 실행 요약(Job summary)에 쓸 마크다운: 결과 한 줄, 실패·경고 목록, 기기별 표
export function renderSummary(verdict: Verdict): string {
  const { report, failures, warnings } = verdict
  const headline = failures.length > 0 ? '실패' : warnings.length > 0 ? '경고 있음(성공)' : '문제 없음'
  const lines = ['## 보관 지켜보기', '', `결과: **${headline}**`, '']
  lines.push(...messageList('실패', failures), ...messageList('경고', warnings))

  if (report) {
    lines.push(`### 기기별 상태 (서버 시각 ${formatKst(report.now)} KST, 시각은 모두 KST)`, '')
    if (report.devices.length === 0) {
      lines.push(NO_SIGNAL, '')
    } else {
      lines.push(
        '| 기기 | 마지막 신호 | 자동 보관 | 밀린 때 | 마지막 보관 | 크기 | 앱 버전 |',
        '|---|---|---|---|---|---|---|',
        ...report.devices.map(deviceRow),
        '',
      )
    }
  }
  return lines.join('\n')
}

// GitHub Actions 작업 명령의 메시지 칸 이스케이프 (줄바꿈·% 가 명령을 깨지 않게)
function escapeCommand(message: string): string {
  return message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

// 로그에 찍을 작업 명령: 실패는 ::error, 경고는 ::warning
export function annotations(verdict: Verdict): string[] {
  return [
    ...verdict.failures.map((message) => `::error title=보관 지켜보기::${escapeCommand(message)}`),
    ...verdict.warnings.map((message) => `::warning title=보관 지켜보기::${escapeCommand(message)}`),
  ]
}
