// 엑셀 라이브러리 조각 검사 (SPEC-010 AC-35, ADR 009) — `npm run build` 끝에 돈다
//
// dist/index.html 이 처음 받는 파일에 SheetJS 가 없고, SheetJS 조각을 서비스 워커(dist/sw.js)가 미리 받는지 본다.
// 문제가 있으면 exit 1 로 빌드를 멈춘다(CI·배포도 같이 멈춘다). 판정은 scripts/excelBundle.ts (테스트 excelBundle.test.ts).
// 의존성 없음. Node 24 가 excelBundle.ts 의 타입만 지우고 바로 불러온다.
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { checkExcelBundle } from './excelBundle.ts'

const dist = new URL('../dist/', import.meta.url)
const read = (path) => readFileSync(new URL(path, dist), 'utf8')

const scripts = readdirSync(new URL('assets/', dist))
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ file: `assets/${name}`, text: read(`assets/${name}`) }))

const result = checkExcelBundle({ indexHtml: read('index.html'), serviceWorker: read('sw.js'), scripts })

// vite 빌드 출력과 같은 kB(1,000 바이트)
const kb = (bytes) => `${(bytes / 1000).toFixed(2)} kB`
for (const file of result.excelChunks) {
  const bytes = readFileSync(new URL(file, dist))
  console.log(`SheetJS 가 든 파일 ${file}: ${kb(bytes.length)} (gzip ${kb(gzipSync(bytes).length)})`)
}

if (result.problems.length > 0) {
  for (const problem of result.problems) console.error(`엑셀 조각 검사 실패: ${problem}`)
  process.exit(1)
}
console.log(
  result.excelChunks.length === 0
    ? '엑셀 조각 검사 통과: 첫 화면에 SheetJS 없음 (아직 화면이 엑셀 기능을 부르지 않아 엑셀 조각도 없음)'
    : '엑셀 조각 검사 통과: 첫 화면에 SheetJS 없음, 엑셀 조각은 서비스 워커가 미리 받음',
)
