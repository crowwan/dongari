// 항목 이름으로 고르는 아이콘 (SPEC-001 AC-18). 자주 쓰는 말 → 누구나 아는 모양, 모르는 이름은 영수증.
// 화면 부품과 떨어진 이름(아이콘 종류)만 돌려주고, 그림은 ui/Icon 이 그린다

export type ItemIconName = 'users' | 'building' | 'cup' | 'gift' | 'bank' | 'flower' | 'receipt'

// 위에서부터 처음 맞는 말로 정한다 ("행사지원금" → 지원금 → 선물)
const NAME_RULES: { words: string[]; icon: ItemIconName }[] = [
  { words: ['회비', '회원'], icon: 'users' },
  { words: ['대관', '장소', '임대'], icon: 'building' },
  { words: ['간식', '커피', '음료', '다과'], icon: 'cup' },
  { words: ['지원금', '후원', '선물'], icon: 'gift' },
  { words: ['이자', '예금', '은행'], icon: 'bank' },
  { words: ['꽃'], icon: 'flower' },
]

export function itemIcon(name: string): ItemIconName {
  const rule = NAME_RULES.find(({ words }) => words.some((word) => name.includes(word)))
  return rule?.icon ?? 'receipt'
}
