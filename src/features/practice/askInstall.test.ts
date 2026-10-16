import { describe, expect, it } from 'vitest'
import { asksInstallAfterPractice } from './askInstall'

// 첫 실행 연습을 브라우저(홈 화면 앱·카톡 안 아님, 설치 전)에서 끝낸 기본 경우
const ASKS = { firstRun: true, standalone: false, installed: false, inApp: false }

describe('SPEC-009 B 연습 끝에 홈 화면에 추가를 묻는 조건', () => {
  it('AC-12 첫 실행 연습을 브라우저에서 끝냈고 아직 설치하지 않았으면 묻는다', () => {
    expect(asksInstallAfterPractice(ASKS)).toBe(true)
  })

  it('AC-13 설정에서 연 연습·홈 화면 앱·이미 설치함·카톡 안이면 묻지 않는다', () => {
    expect(asksInstallAfterPractice({ ...ASKS, firstRun: false })).toBe(false)
    expect(asksInstallAfterPractice({ ...ASKS, standalone: true })).toBe(false)
    expect(asksInstallAfterPractice({ ...ASKS, installed: true })).toBe(false)
    expect(asksInstallAfterPractice({ ...ASKS, inApp: true })).toBe(false)
  })
})
