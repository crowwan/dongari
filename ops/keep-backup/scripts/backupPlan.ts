// 주간 보관본 계획 (우리 장부 SPEC-011 2절) — 보관 서버 내보내기 답을 이 레포 파일로 바꾸는 규칙. 입출력 없는 순수 함수만 둔다.
//
// scripts/backup.mjs 가 이 파일을 그대로 불러 쓴다(Node 24 가 타입만 지우고 실행, 빌드·npm 없음).
// 그래서 타입 지우기로 없어지는 문법만 쓰고(enum 등 없음), 다른 파일·패키지를 불러오지 않는다.
// 원본·테스트는 dongari 레포의 ops/keep-backup/scripts/backupPlan.ts·scripts/keepBackupPlan.test.ts.
//
// 답: { exportedAt, items: [{ id, savedAt, envelope }] } (GET /v1/export, 본 자리 최신본 전부)
// 파일: keep/<id>.json = 겉봉투 JSON 그대로 한 줄 + 줄바꿈, index.json = [{ id, savedAt, bytes }] (id 순)

export const KEEP_DIR = 'keep'
export const INDEX_FILE = 'index.json'
// 한 번 실행에서 지울 수 있는 보관본 파일 수. 보관본이 사라지는 길은 앱 [지우기]뿐이고 가족 몇 명이 한 주에 둘 이상 지우는 일은 드물다.
// 넘으면 서버(KV)를 잃었거나 목록이 잘린 것일 수 있어 지우지 않고 멈춘다 (#194 리뷰)
export const MAX_REMOVALS_PER_RUN = 1

// 서버 이름(복구 코드에서 만든 SHA-256)과 같은 모양만 파일 이름으로 쓴다 (경로 조작 막기)
const KEEP_ID = /^[0-9a-f]{64}$/
const ID_FILE = /^([0-9a-f]{64})\.json$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export interface BackupFile {
  // keep/<id>.json
  path: string
  text: string
}

export type BackupPlan =
  | { ok: true; exportedAt: string; files: BackupFile[]; removePaths: string[]; indexText: string }
  | { ok: false; message: string }

interface ExportItem {
  id: string
  savedAt: string
  envelope: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
}

function isFilledText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}

// 꺼내기 스크립트(--file)가 푸는 겉봉투 모양 { v: 1, savedAt, iv, data }
function isEnvelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.v === 1 && isIsoDate(value.savedAt) && isFilledText(value.iv) && isFilledText(value.data)
}

function fail(message: string): BackupPlan {
  return { ok: false, message }
}

// 한 줄씩 검사한다. 하나라도 틀리면 아무것도 쓰지 않게 이유를 돌려준다 (값은 문구에 넣지 않는다)
function toItems(items: unknown[]): ExportItem[] | string {
  const checked: ExportItem[] = []
  const seen = new Set<string>()
  for (const [index, item] of items.entries()) {
    const place = `${index + 1}번째 보관본`
    if (!isRecord(item)) return `${place}이 객체가 아니에요`
    const { id, savedAt, envelope } = item
    if (typeof id !== 'string' || !KEEP_ID.test(id)) return `${place}의 id 가 64자 소문자 16진수가 아니에요`
    if (seen.has(id)) return `${place}의 id 가 앞에 또 있어요`
    if (!isIsoDate(savedAt)) return `${place}의 보관 시각이 ISO 시각이 아니에요`
    if (!isEnvelope(envelope)) return `${place}의 겉봉투 모양이 틀렸어요 ({ v: 1, savedAt, iv, data })`
    seen.add(id)
    checked.push({ id, savedAt, envelope })
  }
  return checked.sort((a, b) => a.id.localeCompare(b.id))
}

// 내보내기 답(body)과 지금 keep/ 폴더의 파일 이름들 → 쓸 파일·지울 파일·index.json.
// 답이 0개인데 레포에 보관본 파일이 있거나, 지울 파일이 MAX_REMOVALS_PER_RUN 을 넘으면 지우지 않고 실패한다:
// 서버(KV)를 잃은 뒤 폰 몇 대만 다시 보관했거나 잘못 답한 것일 수 있고(이 레포가 막으려는 바로 그 사고),
// 한꺼번에 지운 커밋이 생기면 되살리기가 이력 뒤지기가 된다. 정말 지울 일이면 손으로 지운다(README "지우지 않고 멈췄을 때")
export function planBackup(body: unknown, existingFileNames: readonly string[]): BackupPlan {
  if (!isRecord(body)) return fail('내보내기 답이 { exportedAt, items } 모양이 아니에요')
  const { exportedAt, items } = body
  if (!isIsoDate(exportedAt) || !Array.isArray(items)) return fail('내보내기 답이 { exportedAt, items } 모양이 아니에요')

  const checked = toItems(items)
  if (typeof checked === 'string') return fail(`내보내기 답이 틀렸어요: ${checked}`)

  // keep/ 안의 <id>.json 만 이 워크플로의 파일로 본다 (.gitkeep·README 등은 건드리지 않음)
  const existingIds = existingFileNames.flatMap((name) => {
    const match = ID_FILE.exec(name)
    return match ? [match[1]] : []
  })
  const manualHelp = '보관 서버를 먼저 확인하고, 정말 지울 일이면 README "지우지 않고 멈췄을 때" 대로 손으로 지우세요'
  if (checked.length === 0 && existingIds.length > 0) {
    return fail(`서버가 보관본 0개를 줬는데 레포에는 ${existingIds.length}개가 있어요. 한꺼번에 지우지 않고 멈춰요 — ${manualHelp}`)
  }
  const keptIds = new Set(checked.map(({ id }) => id))
  const removeIds = existingIds.filter((id) => !keptIds.has(id))
  if (removeIds.length > MAX_REMOVALS_PER_RUN) {
    // 지울 것은 이 레포의 파일 이름이라 앞 8자를 알려 준다 (손으로 지울 때 찾게)
    const names = removeIds.map((id) => id.slice(0, 8)).join(', ')
    return fail(
      `서버 목록에 없는 보관본이 ${removeIds.length}개(${names})라 지우지 않고 멈춰요 — 한 번에 ${MAX_REMOVALS_PER_RUN}개까지만 지워요. ${manualHelp}`,
    )
  }

  const written = checked.map(({ id, savedAt, envelope }) => ({ id, savedAt, text: `${JSON.stringify(envelope)}\n` }))
  const index = written.map(({ id, savedAt, text }) => ({ id, savedAt, bytes: new TextEncoder().encode(text).byteLength }))
  return {
    ok: true,
    exportedAt,
    files: written.map(({ id, text }) => ({ path: `${KEEP_DIR}/${id}.json`, text })),
    removePaths: removeIds.map((id) => `${KEEP_DIR}/${id}.json`),
    indexText: `${JSON.stringify(index, null, 2)}\n`,
  }
}
