// 보관 지켜보기 판정 (SPEC-007 "판정", #106)
//
// 서버 요약(`GET /v1/report`) 응답을 받아 실패·경고 문구와 실행 요약 표를 만든다. 입출력 없는 순수 함수만 둔다.
// SPEC-011(#186): 요약에 실린 마지막 서버 밖 사본 내보내기(export)도 판정한다.
// SPEC-012(#201): 비공개 백업 레포(crowwan/dongari-keep-backup)에서 돈다. 레포 맨 위 devices.json(기기 이름표)으로
// 기기를 `엄마 폰 (aaa97843)` 처럼 보이고, 이름 없는 기기·요약에 없는 이름표 기기는 경고, 이름표 모양이 틀리면 실패.
// 원본은 dongari 레포 ops/keep-backup/ — 시험은 dongari scripts/keepWatch.test.ts.
// 워크플로는 scripts/keep-watch.mjs 가 이 파일을 그대로 불러 쓴다(Node 24 가 타입만 지우고 실행, 빌드 없음).
// 그래서 타입 지우기로 없어지는 문법만 쓴다(enum·namespace 없음, tsconfig erasableSyntaxOnly).

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// 앱 안 띠(7일)보다 먼저 알기 위한 값
export const PENDING_LIMIT_MS = 3 * DAY_MS
export const SILENT_LIMIT_MS = 30 * DAY_MS
// 백업 레포 워크플로는 주 1회. 한 번 건너뛰면 바로 알게 7일에 하루 여유
export const EXPORT_LIMIT_MS = 8 * DAY_MS
const KST_OFFSET_MS = 9 * HOUR_MS
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

// 기기 이름표 키: 서버 요약의 기기 id(64자 해시 앞 8자, 소문자 16진수). keep-rescue --which 가 찍는 그대로
const NAME_KEY = /^[0-9a-f]{8}$/
const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3
const HANGUL_FINALS = 28

export const SERVER_DOWN = '보관 서버가 응답하지 않아요'
export const TOKEN_REJECTED =
  '보관 서버가 요약 토큰을 받지 않아요 (401). 이 레포 Secrets `REPORT_TOKEN` 과 dongari 레포 Secrets `KEEP_REPORT_TOKEN` 이 같은 값인지 보고, ' +
  'dongari Actions "보관 서버" 를 다시 실행(Run workflow)해 Worker 비밀값 `REPORT_TOKEN` 에 넣으세요'
export const NO_SIGNAL = '아직 상태 신호가 없어요'
export const NO_EXPORT = '아직 서버 밖 사본이 없어요'
export const DEVICES_FILE = 'devices.json'
export const NAMES_BROKEN =
  '기기 이름 파일(`devices.json`) 모양이 틀려요. `{ "aaa97843": "엄마 폰" }` 처럼 기기 앞 8자(소문자 16진수)에 이름 글자를 적어요'

// devices.json 을 읽은 결과 (SPEC-012): 기기 앞 8자 → 이름, 또는 모양이 틀림
export type DeviceNames = { ok: true; names: ReadonlyMap<string, string> } | { ok: false }

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
  // 이름표(devices.json)에서 붙인 이름. 서버 답에는 없다
  name?: string
}

// 마지막 서버 밖 사본 내보내기 (SPEC-011 2절): 때와 내보낸 보관본 개수
export interface ExportReport {
  lastAt: string
  count: number
}

export interface Report {
  now: string
  devices: DeviceReport[]
  // 한 번도 내보내지 않았으면 null
  export: ExportReport | null
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

// export 칸: null 이나 칸 없음(이 칸을 모르는 예전 서버, #186 배포 전)은 내보낸 적 없음(null), 모양이 틀리면 undefined
function toExport(value: unknown): ExportReport | null | undefined {
  if (value === undefined || value === null) return null
  if (!isRecord(value) || !isIsoDate(value.lastAt)) return undefined
  const { count } = value
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return undefined
  return { lastAt: value.lastAt, count }
}

// 서버 요약 형식 `{ now, devices: [...], export? }` 이 맞으면 Report, 하나라도 틀리면 null
export function parseReport(body: unknown): Report | null {
  if (!isRecord(body) || !isIsoDate(body.now) || !Array.isArray(body.devices)) return null
  const lastExport = toExport(body.export)
  if (lastExport === undefined) return null
  const devices: DeviceReport[] = []
  for (const item of body.devices) {
    const device = toDevice(item)
    if (!device) return null
    devices.push(device)
  }
  return { now: body.now, devices, export: lastExport }
}

// devices.json 글자 → 이름표 (SPEC-012). 파일이 없으면(undefined) 빈 이름표라 모든 기기가 "이름 없는 기기" 경고다.
// 모양: `{ "앞 8자": "이름" }` — 키는 소문자 16진수 8자, 값은 빈칸 아닌 글자(앞뒤 빈칸은 지움). 하나라도 틀리면 모양이 틀림
export function parseDeviceNames(text: string | undefined): DeviceNames {
  if (text === undefined) return { ok: true, names: new Map() }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false }
  }
  if (!isRecord(raw)) return { ok: false }
  const names = new Map<string, string>()
  for (const [id, name] of Object.entries(raw)) {
    if (!NAME_KEY.test(id) || typeof name !== 'string' || name.trim() === '') return { ok: false }
    names.set(id, name.trim())
  }
  return { ok: true, names }
}

// 사람이 읽는 시각: 한국 시간 `2026-10-12 09:30`
export function formatKst(iso: string): string {
  const shifted = new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString()
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)}`
}

// 표의 기기 칸: 이름이 있으면 `엄마 폰 (aaa97843)`, 없으면 `aaa97843`
function deviceLabel(id: string, name: string | undefined): string {
  return name === undefined ? `\`${id}\`` : `\`${name} (${id})\``
}

// 문구 속 기기: 이름이 있으면 `엄마 폰 (aaa97843)`, 없으면 예전처럼 기기 `aaa97843`
function deviceText(id: string, name: string | undefined): string {
  return name === undefined ? `기기 ${deviceLabel(id, name)}` : deviceLabel(id, name)
}

// 문구 속 기기 + 주격 조사: 이름 끝 글자가 받침 있는 한글이면 '이'(엄마 폰 이), 아니면 '가'(이모 가).
// 이름이 없으면 예전 문구 그대로 '가'
function deviceSubject(id: string, name: string | undefined): string {
  const code = name === undefined ? 0 : name.charCodeAt(name.length - 1)
  const hasFinal = code >= HANGUL_FIRST && code <= HANGUL_LAST && (code - HANGUL_FIRST) % HANGUL_FINALS !== 0
  return `${deviceText(id, name)} ${hasFinal ? '이' : '가'}`
}

function judgeDevice(device: DeviceReport, now: number): { failures: string[]; warnings: string[] } {
  const who = deviceText(device.id, device.name)
  const subject = deviceSubject(device.id, device.name)
  const failures: string[] = []
  const warnings: string[] = []

  // 밀린 시간은 신호를 받은 때 기준이다. 앱을 안 열면 그 뒤 보관됐는지 알 수 없으니 (그때는 30일 경고로만 안다)
  if (device.pendingSince !== undefined && Date.parse(device.seenAt) - Date.parse(device.pendingSince) > PENDING_LIMIT_MS) {
    failures.push(`${subject} 3일 넘게 보관하지 못했어요 (밀린 때 ${formatKst(device.pendingSince)} KST)`)
  }
  if (device.tooLarge) failures.push(`${who} 의 기록이 1MB 를 넘어 보관하지 못했어요`)
  if (!device.enabled) warnings.push(`${subject} 자동 보관을 껐어요`)
  if (now - Date.parse(device.seenAt) > SILENT_LIMIT_MS) warnings.push(`${subject} 30일 넘게 앱을 열지 않았어요`)
  return { failures, warnings }
}

// 이름표 경고 (SPEC-012): 요약에 있는데 이름이 없는 기기, 이름표에 있는데 요약에 없는 기기
function judgeNames(devices: readonly DeviceReport[], names: ReadonlyMap<string, string>): string[] {
  const unnamed = devices
    .filter((device) => device.name === undefined)
    .map((device) => `이름 없는 기기 \`${device.id}\` 가 있어요. \`${DEVICES_FILE}\` 에 이름을 붙여 주세요`)
  const reported = new Set(devices.map((device) => device.id))
  const absent = [...names]
    .filter(([id]) => !reported.has(id))
    .map(([id, name]) => `이름표의 ${deviceSubject(id, name)} 요약에 없어요 (보관을 지웠거나 복구 코드가 바뀜)`)
  return [...unnamed, ...absent]
}

// 서버 밖 사본 (SPEC-011): 한 번도 없으면 경고(첫 주), 마지막 내보내기가 8일 넘었으면 실패
function judgeExport(lastExport: ExportReport | null, now: number): { failures: string[]; warnings: string[] } {
  if (lastExport === null) return { failures: [], warnings: [NO_EXPORT] }
  const elapsed = now - Date.parse(lastExport.lastAt)
  if (elapsed <= EXPORT_LIMIT_MS) return { failures: [], warnings: [] }
  const days = Math.floor(elapsed / DAY_MS)
  return {
    failures: [`서버 밖 사본이 ${days}일째 없어요 (마지막 내보내기 ${formatKst(lastExport.lastAt)} KST)`],
    warnings: [],
  }
}

// 서버 답을 판정한다 (SPEC-007·011). 기기에는 이름표의 이름을 붙여 둔다
function judgeResponse(response: ReportResponse, names: ReadonlyMap<string, string>): Verdict {
  if (response.kind === 'unreachable') return { failures: [`${SERVER_DOWN} (연결 실패)`], warnings: [] }
  if (response.status === 401) return { failures: [TOKEN_REJECTED], warnings: [] }
  if (response.status !== 200) return { failures: [`${SERVER_DOWN} (HTTP ${response.status})`], warnings: [] }

  const parsed = parseReport(response.body)
  if (!parsed) return { failures: [`${SERVER_DOWN} (요약 형식이 틀림)`], warnings: [] }
  const report = { ...parsed, devices: parsed.devices.map((device) => ({ ...device, name: names.get(device.id) })) }

  const now = Date.parse(report.now)
  const judged = [...report.devices.map((device) => judgeDevice(device, now)), judgeExport(report.export, now)]
  const noSignal = report.devices.length === 0 ? [NO_SIGNAL] : []
  return {
    report,
    failures: judged.flatMap((result) => result.failures),
    warnings: [...noSignal, ...judged.flatMap((result) => result.warnings)],
  }
}

// 응답 하나를 이름표(devices.json, SPEC-012)와 함께 판정한다. 시각 비교는 서버 요약의 now 로 한다 (실행기 시계와 무관).
// 이름표 모양이 틀리면 서버 판정은 그대로 하고(기기는 앞 8자로) 실패를 하나 더한다. 이름 경고는 요약을 받았을 때만
export function judgeReport(response: ReportResponse, deviceNames: DeviceNames): Verdict {
  if (!deviceNames.ok) {
    const verdict = judgeResponse(response, new Map())
    return { ...verdict, failures: [...verdict.failures, NAMES_BROKEN] }
  }
  const verdict = judgeResponse(response, deviceNames.names)
  if (verdict.report === undefined) return verdict
  return { ...verdict, warnings: [...verdict.warnings, ...judgeNames(verdict.report.devices, deviceNames.names)] }
}

function deviceRow(device: DeviceReport): string {
  const cells = [
    deviceLabel(device.id, device.name),
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
    lines.push('### 서버 밖 사본', '', `마지막 내보내기: ${exportText(report.export)}`, '')
  }
  return lines.join('\n')
}

function exportText(lastExport: ExportReport | null): string {
  if (lastExport === null) return NO_EXPORT
  return `${formatKst(lastExport.lastAt)} KST · 보관본 ${lastExport.count}개`
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
