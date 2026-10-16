import {
  Building,
  Calendar,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudCheck,
  CircleMinus,
  CirclePlus,
  Coffee,
  Download,
  Flower2,
  FolderDown,
  Gift,
  Hospital,
  House,
  KeyRound,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Settings,
  Share2,
  ShoppingCart,
  Smartphone,
  TriangleAlert,
  Users,
  Wallet,
  Zap,
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
  | 'phone'
  | 'plus'
  | 'check'
  | 'left'
  | 'right'
  | 'down'
  | 'home'
  | 'cloud'
  | 'key'
  | 'alert'

const ICONS: Record<IconName, LucideIcon> = {
  // 항목 (domain/itemIcon 이 이름으로 고른다)
  users: Users,
  building: Building,
  cup: Coffee,
  gift: Gift,
  bank: Landmark,
  flower: Flower2,
  cart: ShoppingCart,
  bolt: Zap,
  hospital: Hospital,
  wallet: Wallet,
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
  // 홈 화면에 추가 (폰 홈 화면에 앱 아이콘)
  phone: Smartphone,
  plus: Plus,
  check: Check,
  left: ChevronLeft,
  right: ChevronRight,
  down: ChevronDown,
  // 장부 종류 (SPEC-005): 동아리·모임은 사람들(users), 개인 가계부는 집
  home: House,
  // 기록 지키기 (SPEC-006): 자동 보관은 구름 + 체크, 복구 코드로 불러오기는 열쇠
  cloud: CloudCheck,
  key: KeyRound,
  // 저장 안 됨 알약 (SPEC-002 v2.6): 경고 세모
  alert: TriangleAlert,
}

// 꾸밈 아이콘: 화면 읽기에서 숨기고(뜻은 옆 글자가 전한다), 크기·색은 놓인 자리의 CSS 가 정한다
export function Icon({ name }: { name: IconName }) {
  const Svg = ICONS[name]
  return <Svg className="ui-icon" data-icon={name} aria-hidden="true" focusable="false" />
}
