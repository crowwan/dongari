import type { BookKind } from '../../domain/types'
import type { IconName } from '../../ui/Icon'

// 장부 종류 아이콘 (SPEC-005): 동아리·모임 = 사람들, 개인 가계부 = 집
const KIND_ICONS: Readonly<Record<BookKind, IconName>> = { club: 'users', household: 'home' }

export function bookKindIcon(kind: BookKind): IconName {
  return KIND_ICONS[kind]
}
