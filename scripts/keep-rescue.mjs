// 보관본 꺼내기 (#154, SPEC-011 #185·#186) — 개발자용 읽기 전용 도구. 사용자 화면과는 상관없다
//
// 사용자에게 받은 복구 코드로 서버 보관본을 GET 해서 풀고(scripts/keepRescue.ts, 앱과 같은 방식),
// `우리장부-기록-YYYY-MM-DD-최신.txt`(날짜 = 보관한 날, 한국 시간)를 레포 밖 ~/Downloads(없으면 홈, RESCUE_DIR 로 바꿀 수 있음)에
// 만든다. 파일에는 장부 전체와 복구 코드가 들어 있다 — 레포(공개)에 두지 말고, 다 보냈으면 지운다. 서버에는 쓰지 않는다.
// 서버의 날짜별(31일)·달별(400일) 사본은 --list 로 보고 --day·--month 로 골라 꺼낸다(파일 이름에 그 날·달).
// 서버 대신 비공개 백업 레포(crowwan/dongari-keep-backup)의 주간 사본 파일 keep/<id>.json 은 --file 로 푼다(KEEP_URL 필요 없음).
// --which 는 그 폰이 보관 지켜보기 기기 이름표(백업 레포 devices.json)에서 어느 기기인지, 서버 이름 앞 8자 한 줄만 찍는다
// (SPEC-012, 서버를 부르지 않고 파일도 만들지 않음, KEEP_URL 필요 없음).
// 의존성 없음. Node 24 가 keepRescue.ts 의 타입만 지우고 바로 불러온다(빌드 없음).
//
//   KEEP_URL=$(gh variable get KEEP_URL) node scripts/keep-rescue.mjs        # 최신본. 코드를 물으면 붙여 넣기 (권장)
//   KEEP_URL=… node scripts/keep-rescue.mjs --list                          # 있는 사본 목록(장부 이름·기록 건수)
//   KEEP_URL=… node scripts/keep-rescue.mjs --day 2026-11-21                # 그 날 사본 → 우리장부-기록-2026-11-21.txt
//   KEEP_URL=… node scripts/keep-rescue.mjs --month 2026-10                 # 그 달 사본 → 우리장부-기록-2026-10.txt
//   node scripts/keep-rescue.mjs --file ../dongari-keep-backup/keep/<id>.json  # 백업 레포 파일 → 우리장부-기록-YYYY-MM-DD-주간사본.txt
//   node scripts/keep-rescue.mjs --which                                     # 이 코드의 기기 앞 8자 (devices.json 의 키)
//   KEEP_URL=… node scripts/keep-rescue.mjs HK7M-29QF-MX4P-8R2D             # 코드를 인자로도 되지만 셸 기록에 남는다
//   RESCUE_DIR=/tmp/rescue KEEP_URL=… node scripts/keep-rescue.mjs           # 다른 폴더에 쓰기
//
// 복구 코드는 출력하지 않는다. 같은 이름 파일이 있으면 덮어쓰지 않고 멈춘다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import {
  describeList,
  describeRescue,
  listKeep,
  parseRescueArgs,
  rescueDir,
  rescueFile,
  rescueFileName,
  rescueKeep,
  whichKeep,
} from './keepRescue.ts'

const TIMEOUT_MS = 15_000

function fail(message) {
  console.error(`꺼내지 못했어요: ${message}`)
  process.exit(1)
}

// 코드는 인자 또는 표준 입력. 터미널이면 묻고, 파이프면 첫 줄을 읽는다
async function readCode(given) {
  if (given) return given
  if (process.stdin.isTTY) console.error('복구 코드를 붙여 넣고 Enter (셸 기록에 남지 않게 인자 대신 여기로 넣어요)')
  const lines = createInterface({ input: process.stdin })
  for await (const line of lines) {
    lines.close()
    return line
  }
  return ''
}

// --file 의 백업 레포 파일 글자. 코드를 묻기 전에 읽어, 경로가 틀렸으면 바로 멈춘다
function readBackupFile(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    fail(`${path} 를 읽지 못했어요 (${error?.code ?? '알 수 없는 오류'})`)
  }
}

const parsed = parseRescueArgs(process.argv.slice(2))
if (!parsed.ok) fail(parsed.message)
const { command } = parsed

// 서버를 부르는 일(최신본·사본 꺼내기, --list)에만 KEEP_URL 이 필요하다 (--file·--which 는 서버를 부르지 않는다)
const keepUrl = process.env.KEEP_URL ?? ''
const callsServer = command.action === 'rescue' || command.action === 'list'
if (callsServer && !keepUrl) fail('환경변수 KEEP_URL 이 필요해요 (KEEP_URL=$(gh variable get KEEP_URL))')
const fileText = command.action === 'file' ? readBackupFile(command.path) : ''

const code = await readCode(command.code)

// --which: 앞 8자 한 줄만 표준 출력에 (복붙해 devices.json 키로 쓰게)
if (command.action === 'which') {
  const which = await whichKeep(code)
  if (!which.ok) fail(which.message)
  console.log(which.prefix)
  process.exit(0)
}

const fetchFn = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })

if (command.action === 'list') {
  const listed = await listKeep(code, keepUrl, fetchFn)
  if (!listed.ok) fail(listed.message)
  for (const line of describeList(listed.rows)) console.log(line)
  process.exit(0)
}

const source = command.action === 'file' ? { kind: 'file' } : command.target
const result =
  command.action === 'file'
    ? await rescueFile(code, basename(command.path), fileText)
    : await rescueKeep(code, keepUrl, fetchFn, command.target)
if (!result.ok) fail(result.message)

const home = homedir()
const filePath = join(rescueDir(process.env, home, existsSync(join(home, 'Downloads'))), rescueFileName(result.savedAt, source))
try {
  // wx: 이미 있으면 실패 — 전에 꺼낸 다른 사람 파일을 덮지 않게
  writeFileSync(filePath, result.plain, { flag: 'wx' })
} catch (error) {
  if (error?.code === 'EEXIST') fail(`${filePath} 가 이미 있어요. 옮기거나 지운 뒤 다시 해 주세요`)
  fail(`${filePath} 를 쓰지 못했어요 (${error?.code ?? '알 수 없는 오류'})`)
}

for (const line of describeRescue(result, filePath, source)) console.log(line)
