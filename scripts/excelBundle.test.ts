import { describe, expect, it } from 'vitest'
import { checkExcelBundle, firstScreenScripts, type BuiltApp } from './excelBundle'

// vite 빌드 결과 모양을 흉내 낸 지어낸 산출물
const indexHtml = `<!doctype html>
<html lang="ko">
  <head>
    <script id="vite-plugin-pwa:register-sw" src="/dongari/registerSW.js"></script>
    <script type="module" crossorigin src="/dongari/assets/index-AbC123.js"></script>
    <link rel="modulepreload" crossorigin href="/dongari/assets/vendor-XyZ789.js">
    <link rel="stylesheet" crossorigin href="/dongari/assets/index-Css1.css">
  </head>
</html>`

const serviceWorker =
  'define(["./workbox-1"],(function(e){"use strict";e.precacheAndRoute([{url:"assets/index-AbC123.js",revision:null},{url:"assets/vendor-XyZ789.js",revision:null},{url:"assets/xlsx-Q1w2E3.js",revision:null},{url:"index.html",revision:"abc"}],{})}));'

function app(overrides: Partial<BuiltApp> = {}): BuiltApp {
  return {
    indexHtml,
    serviceWorker,
    scripts: [
      { file: 'assets/index-AbC123.js', text: 'const app=1;import("./xlsx-Q1w2E3.js")' },
      { file: 'assets/vendor-XyZ789.js', text: 'export const react=1' },
      { file: 'assets/xlsx-Q1w2E3.js', text: 'var e="SheetJS";export{e as read}' },
      { file: 'assets/html2canvas.esm-a1.js', text: 'export const h=1' },
    ],
    ...overrides,
  }
}

describe('SPEC-010 AC-35 엑셀 라이브러리는 첫 화면 번들에 없고 서비스 워커가 미리 받는다 (빌드 산출물 검사)', () => {
  it('첫 화면 파일은 index.html 이 부르는 모듈과 미리 불러오기(modulepreload) 파일이다 (경로 / 빌드도)', () => {
    expect(firstScreenScripts(indexHtml)).toEqual(['assets/index-AbC123.js', 'assets/vendor-XyZ789.js'])
    expect(firstScreenScripts(indexHtml.replaceAll('/dongari/', '/'))).toEqual(['assets/index-AbC123.js', 'assets/vendor-XyZ789.js'])
  })

  it('SheetJS 가 따로 된 조각에만 있고 서비스 워커가 그 조각을 미리 받으면 문제가 없다', () => {
    expect(checkExcelBundle(app())).toEqual({
      firstScreen: ['assets/index-AbC123.js', 'assets/vendor-XyZ789.js'],
      excelChunks: ['assets/xlsx-Q1w2E3.js'],
      problems: [],
    })
  })

  it('첫 화면 파일에 SheetJS 가 들어 있으면 문제로 알린다 (정적 import 로 섞인 경우)', () => {
    const scripts = app().scripts.map((script) =>
      script.file === 'assets/vendor-XyZ789.js' ? { ...script, text: 'var e="SheetJS";export const react=1' } : script,
    )

    expect(checkExcelBundle(app({ scripts })).problems).toEqual([
      '첫 화면 파일 assets/vendor-XyZ789.js 에 SheetJS 가 들어 있어요 — 엑셀 라이브러리는 동적 import 로만 불러야 해요 (ADR 009)',
    ])
  })

  it('SheetJS 조각을 서비스 워커가 미리 받지 않으면 문제로 알린다 (오프라인에서 엑셀이 안 열림)', () => {
    const withoutChunk = serviceWorker.replace('{url:"assets/xlsx-Q1w2E3.js",revision:null},', '')

    expect(checkExcelBundle(app({ serviceWorker: withoutChunk })).problems).toEqual([
      '엑셀 조각 assets/xlsx-Q1w2E3.js 을 서비스 워커가 미리 받지 않아요 — 오프라인에서 엑셀 기능이 열리지 않아요',
    ])
  })

  it('index.html 에서 첫 화면 파일을 찾지 못하면 검사가 헛돌지 않게 문제로 알린다', () => {
    expect(checkExcelBundle(app({ indexHtml: '<html></html>' })).problems).toEqual(['index.html 에서 첫 화면 파일을 찾지 못했어요'])
  })

  it('아직 화면이 엑셀 기능을 부르지 않아 SheetJS 조각이 없으면 문제는 아니고 조각 목록만 빈다', () => {
    const scripts = app().scripts.filter((script) => script.file !== 'assets/xlsx-Q1w2E3.js')

    expect(checkExcelBundle(app({ scripts }))).toMatchObject({ excelChunks: [], problems: [] })
  })
})
