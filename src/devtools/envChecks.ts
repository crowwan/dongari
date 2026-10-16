// 개발 확인 화면이 보여 주는 값과 시험 결과 기록 (SPEC-009 기술 확인 T-1~T-8)
import { KAKAO_UA_MARK, openExternalUrl as kakaoOpenExternalUrl } from '../features/install/inAppBrowser'
import { isRecord } from '../storage/schema'
import { DEV_ENV_PARAM, DEV_ENV_PARAM_VALUE } from './route'

// 카톡 안 브라우저 판단 (T-4 에서 실제 user agent 로 확인한다). 앱이 쓰는 글자와 같은 곳(features/install/inAppBrowser)에서
export function hasKakaoTalk(userAgent: string): boolean {
  return userAgent.includes(KAKAO_UA_MARK)
}

export type Platform = 'android' | 'ios' | 'other'

export function platformOf(userAgent: string): Platform {
  if (/Android/.test(userAgent)) return 'android'
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios'
  return 'other'
}

// 카톡 안에서 폰 기본 인터넷 앱으로 열기 (T-3). 열린 쪽이 알 수 있게 ?from=kakao 를 붙인다. 해시도 그대로 넘어가는지 본다
// 앱의 [코드 복사하고 인터넷 앱으로 열기] 와 같은 주소
export function openExternalUrl(href: string): string {
  return kakaoOpenExternalUrl(href, { fromKakao: true })
}

// 크롬으로 열기 (T-3 이 안 될 때의 대안). # 뒤는 intent 설정 자리라 해시 대신 ?dev=env 로 확인 화면을 연다
export function chromeIntentUrl(href: string): string {
  const url = new URL(href)
  url.searchParams.set('from', 'intent')
  url.searchParams.set(DEV_ENV_PARAM, DEV_ENV_PARAM_VALUE)
  const scheme = url.protocol.replace(':', '')
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;end`
}

export function errorName(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name
  return String(error)
}

// 시험 하나의 결과. 받음은 브라우저가 보낸 이벤트(beforeinstallprompt·appinstalled), 누름은 다른 앱으로 넘기는 링크.
// at 은 화면에 보이는 시각(시:분:초)
const OUTCOMES = ['성공', '실패', '받음', '누름'] as const
export type CheckOutcome = (typeof OUTCOMES)[number]
export type CheckResult = { name: string; outcome: CheckOutcome; detail: string; at: string }

export const ENV_LOG_KEY = 'dongari-dev:env-log'

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface CheckLog {
  load: () => CheckResult[]
  // 하나 더 적고 쌓인 전체를 돌려준다
  append: (result: CheckResult) => CheckResult[]
}

function isCheckResult(value: unknown): value is CheckResult {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    OUTCOMES.some((outcome) => outcome === value.outcome) &&
    typeof value.detail === 'string' &&
    typeof value.at === 'string'
  )
}

// 새로고침해도 남게 sessionStorage 에 둔다 (장부의 localStorage 와 상관없다, 탭을 닫으면 사라진다)
export function sessionCheckLog(storage: KeyValueStorage): CheckLog {
  const load = (): CheckResult[] => {
    try {
      const value: unknown = JSON.parse(storage.getItem(ENV_LOG_KEY) ?? '[]')
      return Array.isArray(value) && value.every(isCheckResult) ? value : []
    } catch {
      return []
    }
  }
  return {
    load,
    append: (result) => {
      const next = [...load(), result]
      try {
        storage.setItem(ENV_LOG_KEY, JSON.stringify(next))
      } catch {
        // 남기지 못해도 화면에는 보인다
      }
      return next
    },
  }
}

export function checkLine({ name, outcome, detail, at }: CheckResult): string {
  return detail ? `${at} ${name} ${outcome} — ${detail}` : `${at} ${name} ${outcome}`
}

export type Fact = { label: string; value: string }

// [결과 복사]·[결과 보내기] 글: 화면 값 한 줄씩, 빈 줄, 결과 기록 한 줄씩
export function reportText(facts: Fact[], logs: CheckResult[]): string {
  return [...facts.map(({ label, value }) => `${label}: ${value}`), '', '결과 기록', ...logs.map(checkLine)].join('\n')
}

// 시:분:초 (기기 시각)
export function clockText(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}
