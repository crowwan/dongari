// 보관본 들여다보기 (SPEC-013, #205) — 개발자용 읽기 전용 도구. 사용자 화면과는 상관없다
//
// 내 맥(127.0.0.1)에만 페이지를 열고, 기기별 보관본 사본(서버 최신본·날짜별·달별, 백업 레포 주간 사본)의
// 겉 정보를 보인다. 복구 코드는 페이지 입력칸에 넣고 페이지 안에서 푼다 — 코드는 이 서버로 오지 않는다.
// 출처: 보관 서버(KEEP_URL, 본 주소 출처로 GET 만), 백업 레포 클론(KEEP_BACKUP_DIR, 기본 ../dongari-keep-backup, git 읽기만, pull 하지 않음).
// 의존성 없음. Node 24 가 keepView.ts 의 타입만 지우고 바로 불러온다(빌드 없음).
// 페이지에는 keepView.ts·keepRescue.ts 를 node:module stripTypeScriptTypes 로 타입만 지워 text/javascript 로 보낸다.
// stripTypeScriptTypes 는 Node 24 에서 실험 기능이라 켤 때 ExperimentalWarning 이 한 번 찍힌다(SPEC-013 열린 질문 결정: 그대로 둔다).
//
//   KEEP_URL=$(gh variable get KEEP_URL) node scripts/keep-view.mjs        # http://127.0.0.1:7788/
//   node scripts/keep-view.mjs --port 7799                                  # 다른 포트
//   KEEP_BACKUP_DIR=~/keep-backup node scripts/keep-view.mjs                # 클론이 다른 곳
//
// 풀린 내용과 복구 코드는 파일·로그 어디에도 남기지 않는다. 요청을 찍지 않는다.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, resolve } from 'node:path'
import { handleRequest, parseViewArgs } from './keepView.ts'

const TIMEOUT_MS = 15_000
const GIT_MAX_BUFFER = 64 * 1024 * 1024

const parsed = parseViewArgs(process.argv.slice(2))
if (!parsed.ok) {
  console.error(parsed.message)
  process.exit(1)
}

function scriptText(name) {
  return readFileSync(new URL(name, import.meta.url), 'utf8')
}

// 켤 때 한 번 읽고 타입을 지워 둔다 (요청마다 지우지 않음. 고쳤으면 다시 켠다)
const JS = 'text/javascript; charset=utf-8'
const files = new Map([
  ['/', { type: 'text/html; charset=utf-8', body: scriptText('keep-view/index.html') }],
  ['/keepView.ts', { type: JS, body: stripTypeScriptTypes(scriptText('keepView.ts')) }],
  ['/keepRescue.ts', { type: JS, body: stripTypeScriptTypes(scriptText('keepRescue.ts')) }],
])

const keepUrl = process.env.KEEP_URL ?? ''
const backupDir = resolve(process.env.KEEP_BACKUP_DIR || '../dongari-keep-backup')

// 백업 레포 클론에서 git 하나. 실패하면 undefined. 인자는 keepView.ts 가 형식을 본 값만 넣는다.
// GIT_CEILING_DIRECTORIES: 클론 자리가 git 레포가 아니면 위 폴더의 다른 레포(dongari 등)를 읽지 않게
function git(args, input) {
  return new Promise((done) => {
    const child = execFile(
      'git',
      ['-C', backupDir, ...args],
      {
        encoding: 'utf8',
        maxBuffer: GIT_MAX_BUFFER,
        timeout: TIMEOUT_MS,
        env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(backupDir) },
      },
      (error, stdout) => done(error ? undefined : stdout),
    )
    // git 이 표준 입력을 읽기 전에 끝나면(클론 없음 등) 쓰기가 EPIPE 로 실패한다. 결과는 위 콜백의 오류로 이미 알므로
    // 여기서는 삼킨다 — 처리하지 않으면 도구가 통째로 죽는다. 입력이 없으면 쓰지 않고 닫기만 한다
    child.stdin?.on('error', () => {})
    child.stdin?.end(input)
  })
}

// 보관 서버에는 keepRescue getJson 이 본 주소 출처를 붙인 GET 만 보낸다
const fetchFn = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })

const sources = { keepUrl, backupDir, fetchFn, git }
let port = parsed.port

const server = createServer((request, response) => {
  handleRequest({ method: request.method ?? '', url: request.url ?? '/', host: request.headers.host }, { port, files, sources }, Date.now())
    .catch(() => ({ status: 500, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }, body: '도구 안에서 오류가 났어요' }))
    .then(({ status, headers, body }) => response.writeHead(status, headers).end(body))
})

server.on('error', (error) => {
  const reason = error.code === 'EADDRINUSE' ? `${parsed.port} 포트를 이미 쓰고 있어요. --port 로 다른 포트를 주세요` : error.message
  console.error(`켜지 못했어요: ${reason}`)
  process.exit(1)
})

// 127.0.0.1 에만 연다 (같은 와이파이의 다른 기기는 들어올 수 없다)
server.listen(parsed.port, '127.0.0.1', () => {
  port = server.address().port
  console.log(`보관본 들여다보기: http://127.0.0.1:${port}/  (끄려면 Ctrl+C)`)
  console.log(`- 보관 서버: ${keepUrl ? 'KEEP_URL 있음' : 'KEEP_URL 없음 — 백업 레포만 봐요'}`)
  console.log(`- 백업 레포 클론: ${backupDir}`)
})
