// 회비 (SPEC-010) 순수 함수
import type { Entry } from './types'

// 회비 기록 (SPEC-010 "말"): 수입이면서 항목 이름이 "회비"로 시작하는 기록("회비", "회비(14인)").
// 지출 "회비"(상급 단체에 내는 돈)는 아니다. 내역 적기 "누가 냈어요?"·회비 표·엑셀이 모두 이 판정 하나를 쓴다
export function isDuesEntry(entry: Pick<Entry, 'type' | 'name'>): boolean {
  return entry.type === 'income' && entry.name.trim().startsWith('회비')
}
