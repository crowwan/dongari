import type { CarryoverWords } from '../domain/book'
import { formatAmount } from '../ui/money'

// 잔액 보조 줄: 작년 이월금이 잔액에 들어 있다는 것. 적자면 빼기표 대신 "적자", 0원이면 숨긴다.
// 이름은 장부 종류를 따른다 (동아리 "작년 이월 N원 포함", 가계부 첫 해 "처음 남은 돈 N원 포함", SPEC-005).
// 장부 잔액 카드와 올해 결산 단톡방용 요약(SPEC-003 v2.6)이 같은 말을 쓴다
export function carryoverNote(carryover: number, words: CarryoverWords): string | undefined {
  if (carryover > 0) return `${words.surplus} ${formatAmount(carryover)}원 포함`
  if (carryover < 0) return `${words.deficit} ${formatAmount(-carryover)}원 포함`
  return undefined
}
