import { ENTRY_AMOUNT_MAX } from '../domain/types'

// 입력 글자에서 숫자만 읽어 금액으로 바꾼다. 상한(SPEC-001 예외와 경계 상황)을 넘으면 상한으로 자른다.
export function parseMoney(text: string): number {
  const digits = text.replace(/[^0-9]/g, '')
  if (digits === '') return 0
  return Math.min(Number(digits), ENTRY_AMOUNT_MAX)
}

// 금액을 천 단위 콤마 글자로 바꾼다. 0 은 빈칸(입력 전 상태)으로 보여준다.
// 내역 금액 칸용: 0원 내역은 없어서 0 과 "아직 안 적음" 을 가를 필요가 없다
export function formatMoney(value: number): string {
  return value === 0 ? '' : value.toLocaleString('ko-KR')
}

// 친 글자를 칸에 보일 글자로 정리한다: 숫자만, 앞자리 0 정리(00 → 0, 05 → 5), 상한, 천 단위 콤마.
// 빈칸은 빈칸으로 남겨 직접 친 0 과 가른다 (이월금 칸, #59)
export function tidyMoneyText(text: string): string {
  const digits = text.replace(/[^0-9]/g, '')
  return digits === '' ? '' : parseMoney(digits).toLocaleString('ko-KR')
}

// 빠른 더하기 [+1만] [+5만] [+10만]: 지금 금액에 더하되 상한을 넘지 않는다 (SPEC-001 AC-17)
export function addAmount(current: number, step: number): number {
  return Math.min(current + step, ENTRY_AMOUNT_MAX)
}

// 보여주기용 금액 글자 (잔액·합계·목록). 0 도 보여주고, 음수는 하이픈 대신 글자 빼기표(−)를 쓴다
export function formatAmount(value: number): string {
  const digits = Math.abs(value).toLocaleString('ko-KR')
  return value < 0 ? `−${digits}` : digits
}
