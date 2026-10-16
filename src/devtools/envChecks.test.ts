import { describe, expect, it } from 'vitest'
import {
  chromeIntentUrl,
  ENV_LOG_KEY,
  errorName,
  hasKakaoTalk,
  openExternalUrl,
  platformOf,
  reportText,
  sessionCheckLog,
} from './envChecks'

const KAKAO_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410550'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

// sessionStorage 대신 메모리
function memoryStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

describe('SPEC-009 개발 확인 화면 값 (AC-36)', () => {
  it('user agent 에 KAKAOTALK 이 있으면 카톡 안으로 본다', () => {
    expect(hasKakaoTalk(KAKAO_UA)).toBe(true)
    expect(hasKakaoTalk(IPHONE_UA)).toBe(false)
  })

  it('안드로이드·아이폰을 구분한다', () => {
    expect(platformOf(KAKAO_UA)).toBe('android')
    expect(platformOf(IPHONE_UA)).toBe('ios')
    expect(platformOf('Mozilla/5.0 (Macintosh)')).toBe('other')
  })

  it('openExternal 주소는 지금 주소에 ?from=kakao 를 붙여 통째로 넘긴다 (해시 포함)', () => {
    expect(openExternalUrl('https://uri-jangbu-preview.pages.dev/#/dev/env')).toBe(
      `kakaotalk://web/openExternal?url=${encodeURIComponent('https://uri-jangbu-preview.pages.dev/?from=kakao#/dev/env')}`,
    )
  })

  it('크롬 intent 주소는 # 뒤를 intent 가 쓰므로 해시 대신 ?dev=env 로 확인 화면을 연다', () => {
    expect(chromeIntentUrl('https://uri-jangbu-preview.pages.dev/?from=kakao#/dev/env')).toBe(
      'intent://uri-jangbu-preview.pages.dev/?from=intent&dev=env#Intent;scheme=https;package=com.android.chrome;end',
    )
  })

  it('오류는 이름과 내용으로 적는다', () => {
    expect(errorName(new DOMException('Document is not focused.', 'NotAllowedError'))).toBe(
      'NotAllowedError: Document is not focused.',
    )
    expect(errorName('이상한 값')).toBe('이상한 값')
  })

  it('시험 결과 기록은 sessionStorage 에 쌓여 다시 읽힌다', () => {
    const storage = memoryStorage()
    sessionCheckLog(storage).append({ name: '복사 시험', outcome: '성공', detail: '성공', at: '10:00:01' })
    sessionCheckLog(storage).append({ name: '붙여넣기 시험', outcome: '실패', detail: 'NotAllowedError', at: '10:00:02' })

    expect(sessionCheckLog(storage).load()).toEqual([
      { name: '복사 시험', outcome: '성공', detail: '성공', at: '10:00:01' },
      { name: '붙여넣기 시험', outcome: '실패', detail: 'NotAllowedError', at: '10:00:02' },
    ])
  })

  it('기록이 깨졌으면 빈 목록으로 본다', () => {
    const storage = memoryStorage()
    storage.setItem(ENV_LOG_KEY, '{깨짐')
    expect(sessionCheckLog(storage).load()).toEqual([])
    storage.setItem(ENV_LOG_KEY, JSON.stringify([{ name: 1 }]))
    expect(sessionCheckLog(storage).load()).toEqual([])
  })

  it('[결과 복사] 글은 화면 값과 기록을 한 줄씩 묶는다', () => {
    const text = reportText(
      [
        { label: 'user agent', value: KAKAO_UA },
        { label: '카톡 안', value: '예' },
      ],
      [{ name: '복사 시험', outcome: '실패', detail: 'NotAllowedError: x', at: '10:00:01' }],
    )
    expect(text).toBe(
      [`user agent: ${KAKAO_UA}`, '카톡 안: 예', '', '결과 기록', '10:00:01 복사 시험 실패 — NotAllowedError: x'].join('\n'),
    )
  })
})
