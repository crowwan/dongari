/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vitest 는 CSS import 를 빈 글자로 바꾸므로 파일을 그대로 읽는다. 경로는 레포 루트 기준
const tokensCss = readFileSync('src/styles/tokens.css', 'utf8')

// 루트 글자 크기 16px 기준으로 rem 을 px 로 바꾼다
const ROOT_PX = 16

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return cssFiles(path)
    return path.endsWith('.css') ? [path] : []
  })
}

// 글자 크기 토큰: --text-*-size 와 --size-* 중 직접 값을 가진 것
function fontSizeTokens(): { name: string; value: string }[] {
  return [...tokensCss.matchAll(/(--text-[a-z]+-size|--size-[a-z]+):\s*([^;]+);/g)]
    .map((match) => ({ name: match[1], value: match[2].trim() }))
    .filter(({ value }) => !value.startsWith('var('))
}

describe('SPEC-001 큰 글씨 기준 — 글자 크기 토큰', () => {
  it('글자 크기는 모두 rem 이라 폰 글자 크기 설정(루트 글자 크기)을 키우면 같이 커진다', () => {
    const tokens = fontSizeTokens()

    expect(tokens.length).toBeGreaterThan(0)
    for (const { name, value } of tokens) {
      expect(value, name).toMatch(/^\d+(\.\d+)?rem$/)
    }
  })

  it('루트 16px 기준으로 모두 짝수 px 이고 14px 미만이 없다', () => {
    for (const { name, value } of fontSizeTokens()) {
      const px = parseFloat(value) * ROOT_PX
      expect(Number.isInteger(px) && px % 2 === 0, `${name} = ${px}px`).toBe(true)
      expect(px, name).toBeGreaterThanOrEqual(14)
    }
  })

  it('화면 CSS 는 글자 크기를 px 로 직접 쓰지 않는다 (토큰만)', () => {
    const offenders = cssFiles('src')
      .filter((path) => !path.endsWith('tokens.css'))
      .filter((path) => /font-size:\s*\d+px/.test(readFileSync(path, 'utf8')))

    expect(offenders).toEqual([])
  })
})
