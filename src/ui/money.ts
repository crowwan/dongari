// 금액 상한 (SPEC-001 예외와 경계 상황)
export const MONEY_MAX = 999_999_999

// 입력 글자에서 숫자만 읽어 금액으로 바꾼다. 상한을 넘으면 상한으로 자른다.
export function parseMoney(text: string): number {
  const digits = text.replace(/[^0-9]/g, '')
  if (digits === '') return 0
  return Math.min(Number(digits), MONEY_MAX)
}

// 금액을 천 단위 콤마 글자로 바꾼다. 0 은 빈칸(입력 전 상태)으로 보여준다.
export function formatMoney(value: number): string {
  return value === 0 ? '' : value.toLocaleString('ko-KR')
}
