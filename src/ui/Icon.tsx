import {
  Building,
  Calendar,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleMinus,
  CirclePlus,
  Coffee,
  Download,
  Flower2,
  FolderDown,
  Gift,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Settings,
  Share2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ItemIconName } from '../domain/itemIcon'
import './ui.css'

// 앱이 쓰는 아이콘 전부. 폰 앱에서 흔한 Lucide 선 아이콘만 쓰고(SPEC-001), 아이콘 옆에는 늘 글자를 둔다
export type IconName =
  | ItemIconName
  | 'income'
  | 'expense'
  | 'calendar'
  | 'pen'
  | 'download'
  | 'share'
  | 'folder'
  | 'chart'
  | 'settings'
  | 'plus'
  | 'check'
  | 'left'
  | 'right'
  | 'down'

const ICONS: Record<IconName, LucideIcon> = {
  // 항목 (domain/itemIcon 이 이름으로 고른다)
  users: Users,
  building: Building,
  cup: Coffee,
  gift: Gift,
  bank: Landmark,
  flower: Flower2,
  receipt: Receipt,
  // 수입 ⊕ / 지출 ⊖
  income: CirclePlus,
  expense: CircleMinus,
  // 화면 동작
  calendar: Calendar,
  pen: Pencil,
  download: Download,
  share: Share2,
  folder: FolderDown,
  chart: ChartColumn,
  settings: Settings,
  plus: Plus,
  check: Check,
  left: ChevronLeft,
  right: ChevronRight,
  down: ChevronDown,
}

// 꾸밈 아이콘: 화면 읽기에서 숨기고(뜻은 옆 글자가 전한다), 크기·색은 놓인 자리의 CSS 가 정한다
export function Icon({ name }: { name: IconName }) {
  const Svg = ICONS[name]
  return <Svg className="ui-icon" data-icon={name} aria-hidden="true" focusable="false" />
}
