import {
  ArrowBigDown,
  ArrowBigUp,
  Building,
  Calendar,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CirclePlay,
  CloudCheck,
  CircleMinus,
  CirclePlus,
  Coffee,
  Download,
  EllipsisVertical,
  Flower2,
  FolderDown,
  Gift,
  History,
  Hospital,
  House,
  Info,
  KeyRound,
  Landmark,
  Menu,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Settings,
  Share2,
  ShoppingCart,
  Smartphone,
  Star,
  TriangleAlert,
  Users,
  Wallet,
  X,
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
  | 'close'
  | 'play'
  | 'info'
  | 'circle'
  | 'refresh'
  | 'kebab'
  | 'menu'
  | 'star'
  | 'arrow-up'
  | 'arrow-down'
  | 'history'

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
  // 안내 말풍선 닫기 (SPEC-008): 글자 없는 유일한 버튼이라 화면 읽기 이름("안내 닫기")을 버튼에 단다
  close: X,
  // 연습 장부 (SPEC-008): [연습해 보기] 재생, 연습 띠 ⓘ, 끝 화면 "배운 것" 의 아직 안 한 줄(빈 동그라미)
  play: CirclePlay,
  info: Info,
  circle: Circle,
  // 설정 버전 줄 (SPEC-002 #135): [지금 바꾸기] 새로 열기
  refresh: RefreshCw,
  // 설치 안내 그림 속 브라우저 단추 (SPEC-009): 크롬 ⋮, 삼성 인터넷 ≡, 북마크 ☆. 누를 곳을 가리키는 굵은 화살표
  kebab: EllipsisVertical,
  menu: Menu,
  star: Star,
  'arrow-up': ArrowBigUp,
  'arrow-down': ArrowBigDown,
  // 항목 목록 "예전에 쓴 항목" 구분 글자 (SPEC-001 v2.7): 시계 되감기
  history: History,
}

// 꾸밈 아이콘: 화면 읽기에서 숨기고(뜻은 옆 글자가 전한다), 크기·색은 놓인 자리의 CSS 가 정한다
export function Icon({ name }: { name: IconName }) {
  const Svg = ICONS[name]
  return <Svg className="ui-icon" data-icon={name} aria-hidden="true" focusable="false" />
}
