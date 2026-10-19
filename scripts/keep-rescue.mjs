// 보관본 꺼내기 (#154) — 개발자용 읽기 전용 도구. 사용자 화면과는 상관없다
//
// 사용자에게 받은 복구 코드로 서버 보관본을 GET 해서 풀고(scripts/keepRescue.ts, 앱과 같은 방식),
// `우리장부-기록-YYYY-MM-DD.txt`(날짜 = 보관한 날, 한국 시간)를 레포 밖 ~/Downloads(없으면 홈, RESCUE_DIR 로 바꿀 수 있음)에
// 만든다. 파일에는 장부 전체와 복구 코드가 들어 있다 — 레포(공개)에 두지 말고, 다 보냈으면 지운다. 서버에는 쓰지 않는다.
// 의존성 없음. Node 24 가 keepRescue.ts 의 타입만 지우고 바로 불러온다(빌드 없음).
//
//   KEEP_URL=$(gh variable get KEEP_URL) node scripts/keep-rescue.mjs        # 코드를 물으면 붙여 넣기 (권장)
//   KEEP_URL=… node scripts/keep-rescue.mjs HK7M-29QF-MX4P-8R2D             # 인자도 되지만 셸 기록에 남는다
//   RESCUE_DIR=/tmp/rescue KEEP_URL=… node scripts/keep-rescue.mjs           # 다른 폴더에 쓰기
//
// 복구 코드는 출력하지 않는다. 같은 이름 파일이 있으면 덮어쓰지 않고 멈춘다.
import { existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { describeRescue, rescueDir, rescueFileName, rescueKeep } from './keepRescue.ts'

const TIMEOUT_MS = 15_000

function fail(message) {
  console.error(`꺼내지 못했어요: ${message}`)
  process.exit(1)
}

// 코드는 인자 또는 표준 입력. 터미널이면 묻고, 파이프면 첫 줄을 읽는다
async function readCode() {
  if (process.argv[2]) return process.argv[2]
  if (process.stdin.isTTY) console.error('복구 코드를 붙여 넣고 Enter (셸 기록에 남지 않게 인자 대신 여기로 넣어요)')
  const lines = createInterface({ input: process.stdin })
  for await (const line of lines) {
    lines.close()
    return line
  }
  return ''
}

const keepUrl = process.env.KEEP_URL ?? ''
if (!keepUrl) fail('환경변수 KEEP_URL 이 필요해요 (KEEP_URL=$(gh variable get KEEP_URL))')

const result = await rescueKeep(await readCode(), keepUrl, (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
)
if (!result.ok) fail(result.message)

const home = homedir()
const filePath = join(rescueDir(process.env, home, existsSync(join(home, 'Downloads'))), rescueFileName(result.savedAt))
try {
  // wx: 이미 있으면 실패 — 전에 꺼낸 다른 사람 파일을 덮지 않게
  writeFileSync(filePath, result.plain, { flag: 'wx' })
} catch (error) {
  if (error?.code === 'EEXIST') fail(`${filePath} 가 이미 있어요. 옮기거나 지운 뒤 다시 해 주세요`)
  fail(`${filePath} 를 쓰지 못했어요 (${error?.code ?? '알 수 없는 오류'})`)
}

for (const line of describeRescue(result, filePath)) console.log(line)
