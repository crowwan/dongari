// 엑셀 라이브러리(SheetJS) 조각 검사 (SPEC-010 AC-35, ADR 009). 빌드 뒤 scripts/check-excel-bundle.mjs 가 돌린다.
// - 첫 화면 파일(index.html 이 부르는 모듈·modulepreload)에 SheetJS 가 없어야 한다 — 엑셀은 누를 때 받는다
// - SheetJS 가 든 조각은 서비스 워커(sw.js)가 미리 받는 목록에 있어야 한다 — 오프라인에서도 엑셀이 열린다
// Node 24 가 타입만 지우고 바로 불러 쓴다: 타입 지우기로 없어지는 문법만 쓰고 다른 패키지를 불러오지 않는다 (keepWatch.ts 와 같음)

export interface BuiltApp {
  indexHtml: string
  serviceWorker: string
  // dist 안의 자바스크립트 파일들. file 은 dist 기준 경로 ("assets/index-abc.js")
  scripts: readonly { file: string; text: string }[]
}

export interface ExcelBundleCheck {
  firstScreen: string[]
  excelChunks: string[]
  problems: string[]
}

// SheetJS 코드에만 있는 글자 (압축해도 남는 문자열 상수, 예: "SheetJS Table Export")
const SHEETJS_MARK = 'SheetJS'

// 검사에 필요한 빌드 결과물 (dist 기준)
export const BUILT_FILES = ['index.html', 'sw.js', 'assets'] as const

// 없는 빌드 결과물. 빌드 전에 돌렸거나 서비스 워커가 안 만들어졌으면 ENOENT 대신 이 목록으로 알린다
export function missingBuiltFiles(exists: (path: string) => boolean): string[] {
  return BUILT_FILES.filter((path) => !exists(path))
}

// index.html 이 처음에 받는 자바스크립트: <script src> 와 <link rel="modulepreload" href> 의 assets/… 경로
export function firstScreenScripts(indexHtml: string): string[] {
  const tags = indexHtml.match(/<(?:script|link)\b[^>]*>/g) ?? []
  return tags.flatMap((tag) => {
    const isModule = /^<script\b/.test(tag) || /\brel="modulepreload"/.test(tag)
    const path = /\b(?:src|href)="[^"]*?(assets\/[^"]+\.js)"/.exec(tag)?.[1]
    return isModule && path ? [path] : []
  })
}

export function checkExcelBundle(app: BuiltApp): ExcelBundleCheck {
  const firstScreen = firstScreenScripts(app.indexHtml)
  const excelChunks = app.scripts.filter((script) => script.text.includes(SHEETJS_MARK)).map((script) => script.file)
  const problems: string[] = []
  if (firstScreen.length === 0) problems.push('index.html 에서 첫 화면 파일을 찾지 못했어요')
  for (const file of excelChunks) {
    if (firstScreen.includes(file)) {
      problems.push(`첫 화면 파일 ${file} 에 SheetJS 가 들어 있어요 — 엑셀 라이브러리는 동적 import 로만 불러야 해요 (ADR 009)`)
    } else if (!app.serviceWorker.includes(`"${file}"`)) {
      problems.push(`엑셀 조각 ${file} 을 서비스 워커가 미리 받지 않아요 — 오프라인에서 엑셀 기능이 열리지 않아요`)
    }
  }
  return { firstScreen, excelChunks, problems }
}
