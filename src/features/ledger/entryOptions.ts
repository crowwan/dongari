// 내역 적기(하나씩 채우기)와 내역 고치기(펼친 모양)가 같이 쓰는 선택지
import { itemIcon } from '../../domain/itemIcon'
import type { FrequentChoice } from '../../domain/ledger'
import type { EntryType } from '../../domain/types'
import type { Option } from '../../ui/OptionList'
import type { SegmentOptions } from '../../ui/SegmentedControl'

export const TYPE_LABELS: Readonly<Record<EntryType, string>> = { income: '수입', expense: '지출' }

// [⊕ 수입] [⊖ 지출] 스위치 (기본값 없음)
export const TYPE_SEGMENTS: SegmentOptions<EntryType> = [
  { value: 'income', label: TYPE_LABELS.income, icon: 'income' },
  { value: 'expense', label: TYPE_LABELS.expense, icon: 'expense' },
]

// 자주 쓴 항목 → 목록 한 줄: 원형 아이콘(이름으로) + 이름 + 오른쪽 "수입/지출", 수입은 청록 원
export function itemOptions(choices: readonly FrequentChoice[]): Option<string>[] {
  return choices.map((choice) => ({
    value: choice.name,
    label: choice.name,
    icon: itemIcon(choice.name),
    note: TYPE_LABELS[choice.type],
    tone: choice.type === 'income' ? 'income' : undefined,
  }))
}

// 기록의 달 선택 창 이름 (방문 기록 한 칸, useScreenHistory)
export const ENTRY_MONTH_SHEET = 'entry-month'
