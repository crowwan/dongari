// 앱 아이콘 만들기 (SPEC-002 홈 화면 추가, #10)
//
// 색은 src/styles/tokens.css 라이트 값에서 읽어 SVG 를 만들고, 그 SVG 를 Playwright 크로미움으로 찍어 PNG 를 만든다.
// 아이콘 모양·색을 바꿀 때만 돌린다. 결과(public/icons/*)는 레포에 넣는다.
//
//   npx playwright install chromium-headless-shell   # 처음 한 번 (브라우저가 없으면)
//   node scripts/make-icons.mjs                      # npx 로 Playwright 를 잠깐 받아 쓴다 (package.json 에 넣지 않음)
//
// 모양: 청록(--primary) 바탕 가운데 흰(--surface) 장부 한 장과 줄 네 개(--primary).
// 장부는 가운데 원(지름 80%) 안에 들어가게 그려서, 폰이 아이콘을 동그랗게 잘라도(maskable) 보인다.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const outDir = join(root, 'public/icons')
const tokensCss = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8')

// tokens.css 맨 앞 라이트 블록의 값 (src/pwa/pwaOptions.ts lightToken 과 같은 규칙)
function lightToken(name) {
  const lightBlock = tokensCss.slice(0, tokensCss.indexOf('}') + 1)
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(lightBlock)
  if (!match) throw new Error(`tokens.css 라이트 블록에 ${name} 가 없어요`)
  return match[1].trim()
}

const primary = lightToken('--primary')
const surface = lightToken('--surface')
const soft = lightToken('--primary-soft')

// 512 칸 기준. corner 는 바탕 모서리 둥글기.
// PNG 는 모서리를 비우지 않고 꽉 채운다(0): 스크린숏으로 찍어 투명 모서리를 못 만들고, 폰이 홈 화면 모양대로 잘라 준다.
// 장부(230×300) 는 가운데 원(반지름 204.8) 안에 들어간다: 대각선 반 = √(115² + 150²) ≈ 189
function iconSvg(corner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${corner}" fill="${primary}"/>
  <g transform="translate(256 256) scale(1.15) translate(-256 -256)">
  <rect x="156" y="126" width="200" height="260" rx="22" fill="${surface}"/>
  <rect x="156" y="126" width="200" height="56" rx="22" fill="${soft}"/>
  <rect x="156" y="160" width="200" height="22" fill="${soft}"/>
  <rect x="188" y="148" width="96" height="14" rx="7" fill="${primary}"/>
  <rect x="188" y="222" width="136" height="14" rx="7" fill="${primary}"/>
  <rect x="188" y="272" width="136" height="14" rx="7" fill="${primary}"/>
  <rect x="188" y="322" width="88" height="14" rx="7" fill="${primary}"/>
  </g>
</svg>
`
}

mkdirSync(outDir, { recursive: true })
const squareSvg = iconSvg(0)
// 탭 아이콘은 SVG 그대로 (어느 크기든 또렷하다). SVG 는 투명 모서리가 되니 둥글게
writeFileSync(join(outDir, 'favicon.svg'), iconSvg(112))

const workDir = mkdtempSync(join(tmpdir(), 'dongari-icons-'))
function renderPng(svg, size, fileName) {
  const htmlPath = join(workDir, `${fileName}.html`)
  writeFileSync(
    htmlPath,
    `<!doctype html><html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  )
  execFileSync(
    'npx',
    ['-y', 'playwright', 'screenshot', '--browser', 'chromium', '--viewport-size', `${size},${size}`, `file://${htmlPath}`, join(outDir, fileName)],
    { stdio: 'inherit' },
  )
}

renderPng(squareSvg, 192, 'icon-192.png')
renderPng(squareSvg, 512, 'icon-512.png')
renderPng(squareSvg, 512, 'icon-maskable-512.png')
console.log(`아이콘을 ${outDir} 에 만들었어요`)
