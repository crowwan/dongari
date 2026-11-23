import { useRef, useState, type ReactNode } from 'react'
import { carryoverWords } from '../domain/book'
import { itemIcon } from '../domain/itemIcon'
import { yearReport } from '../domain/report'
import type { EntryType } from '../domain/types'
import type { DuesCell, DuesCellState } from '../domain/duesTable'
import { BookPicker } from '../features/books/BookPicker'
import { DuesCalendar } from '../features/dues/DuesCalendar'
import { DuesStrip } from '../features/dues/DuesStrip'
import { ImportFacts } from '../features/excel/ExcelImportScreen'
import { ExcelExportSheet } from '../features/excel/ExcelExportSheet'
import { ExcelNote } from '../features/excel/ExcelParts'
import { ExcelProblem, ExcelReading } from '../features/excel/ExcelStatus'
import type { ExcelImportSummary } from '../features/excel/readExcelBook'
import { BrowserBar, BrowserMenu, BrowserPage, BrowserPicture } from '../features/install/BrowserPicture'
import { HomeScreenPreview } from '../features/install/HomeScreenPreview'
import { InAppBrowserScreen, InAppImportCard } from '../features/install/InAppBrowserScreen'
import { InstallGuide } from '../features/install/InstallGuide'
import { InstallGuidePicture } from '../features/install/InstallGuidePicture'
import type { GuidePicture } from '../features/install/installGuideSteps'
import { KeepRestoreScreen, KeptSummary } from '../features/keep/KeepRestoreScreen'
import type { KeepServer } from '../features/keep/keepServer'
import type { SheetHistory } from '../features/useScreenHistory'
import { KEEP_REMINDER_MESSAGE } from '../features/keep/keepStatus'
import { STORAGE_NOTICE } from '../features/storage/storageNotices'
import { CarryoverField } from '../features/ledger/CarryoverField'
import { tidyDayText } from '../features/ledger/entryDraft'
import type { BookChoice } from '../features/ledger/useLedger'
import { ItemTotalsCards } from '../features/report/ItemTotalsCards'
import { SavePictureBar } from '../features/report/SavePictureBar'
import { YearShareSummary } from '../features/report/YearShareSummary'
import { KeepCard } from '../features/settings/SettingsScreen'
import { ItemTotalsTable } from '../features/report/sheet/ItemTotalsTable'
import { sheetPaper } from '../features/report/sheet/sheetStyles'
import { AmountDisplay } from '../ui/AmountDisplay'
import { AmountText } from '../ui/AmountText'
import { BalanceCard } from '../ui/BalanceCard'
import { BottomActionBar } from '../ui/BottomActionBar'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { CoachMark } from '../ui/CoachMark'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { DayInput } from '../ui/DayInput'
import { EntryCard } from '../ui/EntryCard'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { ListRow } from '../ui/ListRow'
import { MoneyInput } from '../ui/MoneyInput'
import { MonthButton } from '../ui/MonthButton'
import { MonthPicker } from '../ui/MonthPicker'
import { MonthStepper } from '../ui/MonthStepper'
import { NoticeBar } from '../ui/NoticeBar'
import { OptionList, type Option } from '../ui/OptionList'
import { PickerField } from '../ui/PickerField'
import { SavedEntries, type SavedEntry } from '../ui/SavedEntries'
import { SegmentedControl, type SegmentOptions } from '../ui/SegmentedControl'
import { SlideGuide } from '../ui/SlideGuide'
import { TextField } from '../ui/TextField'
import { Toast } from '../ui/Toast'
import { YearMonthPicker } from '../ui/YearMonthPicker'
import { YearStepper } from '../ui/YearStepper'
import './catalog.css'

type ThemeChoice = 'system' | 'light' | 'dark'

const THEME_CHOICES: Option<ThemeChoice>[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
]

const COLOR_TOKENS = [
  '--bg',
  '--surface',
  '--fill',
  '--line',
  '--line-strong',
  '--strong',
  '--ink',
  '--muted',
  '--faint',
  '--primary',
  '--on-accent',
  '--primary-soft',
  '--primary-wash',
  '--accent-ink',
  '--income-amount',
  '--expense-amount',
  '--income-bar',
  '--expense-bar',
  '--danger',
  '--on-danger',
  '--warn-bg',
  '--scrim',
  '--knob',
  '--pressed',
  '--primary-pressed',
  '--primary-soft-pressed',
  '--danger-pressed',
  '--browser-page',
  '--browser-bar',
  '--browser-field',
  '--browser-menu',
  '--browser-ink',
  '--browser-dim',
]

// 자리 크기 (개편 2·3·4 에서 역할 토큰으로 옮긴 뒤 지운다)
const SIZE_TOKENS = ['--size-small', '--size-body', '--size-large', '--size-amount']

// 글자 역할 (docs/design.md 타이포 위계): 큰 숫자·화면 제목 > 질문·카드 제목 > 줄 이름·보조 이름·본문 > 보조 설명
const TEXT_ROLES: { role: string; sample: string; muted?: boolean }[] = [
  { role: 'display', sample: '1,166,193원' },
  { role: 'title', sample: '내역 적기' },
  { role: 'heading', sample: '며칠인가요?' },
  { role: 'row', sample: '대관료' },
  { role: 'label', sample: '직접 적기', muted: true },
  { role: 'body', sample: '회비 140,000원' },
  { role: 'caption', sample: '모르면 0으로 두세요', muted: true },
]

// 항목 아이콘 (SPEC-001 AC-18, 가계부 기본 항목 SPEC-005): 이름 → itemIcon() → 아이콘
const ITEM_NAMES = ['회비', '대관료', '간식비', '행사지원금', '예금 이자', '꽃값', '장보기', '관리비', '병원비', '연금', '행사비']

// 화면 동작 아이콘 (아이콘 옆에는 늘 글자)
const ACTION_ICONS: { icon: IconName; label: string }[] = [
  { icon: 'income', label: '수입' },
  { icon: 'expense', label: '지출' },
  { icon: 'calendar', label: '날짜' },
  { icon: 'pen', label: '직접 적기' },
  { icon: 'download', label: '사진 저장' },
  { icon: 'share', label: '보내기' },
  { icon: 'folder', label: '불러오기' },
  { icon: 'chart', label: '결산' },
  { icon: 'settings', label: '설정' },
  { icon: 'phone', label: '홈 화면에 추가' },
  { icon: 'plus', label: '적기' },
  { icon: 'check', label: '저장' },
  { icon: 'left', label: '장부로' },
  { icon: 'users', label: '동아리·모임 장부' },
  { icon: 'home', label: '개인 가계부 장부' },
  { icon: 'cloud', label: '자동으로 지키기' },
  { icon: 'key', label: '복구 코드로 불러오기' },
  { icon: 'alert', label: '저장 안 됨' },
  { icon: 'coin', label: '월 회비' },
  { icon: 'excel', label: '엑셀 파일로 새 장부' },
  { icon: 'file-in', label: '엑셀 파일 불러오기' },
  { icon: 'ok', label: '잔액이 맞아요' },
]

// 엑셀 읽은 내용 확인 화면 사실 카드 견본 (SPEC-010 8절 #166, 지어낸 숫자)
const CATALOG_EXCEL_YEARS = Array.from({ length: 14 }, (_, index) => 2013 + index)
const CATALOG_EXCEL_SUMMARY: ExcelImportSummary = {
  sheetCount: 37,
  readSheets: [],
  unreadSheets: [],
  years: CATALOG_EXCEL_YEARS,
  incomeCount: 1_014,
  expenseCount: 80,
  memberCount: 31,
  lastYearMemberCount: 19,
  monthlyFees: CATALOG_EXCEL_YEARS.map((year) => ({ year, fee: year < 2017 ? 10_000 : 20_000 })),
  startMonth: '2026-01',
  balanceChecks: [],
  balanceMismatches: [],
  unassignedDuesCount: 118,
  changedDates: [],
  unreadLines: [],
}

// 복구 코드로 불러오기 미리보기용 서버: 어떤 코드든 보관본이 없다고 답한다
const NO_KEEP_SERVER: KeepServer = {
  put: async () => 'ok',
  get: async () => ({ status: 'not-found' }),
  remove: async () => true,
  sendStatus: async () => {},
}

// 복구 코드로 불러오기 미리보기용 확인 창 자리: 보관본이 없으니 확인 창은 뜨지 않는다
const NO_DIALOGS: Pick<SheetHistory, 'dialog' | 'openDialog' | 'closeDialog'> = {
  dialog: null,
  openDialog: () => {},
  closeDialog: () => {},
}

// 장부 고르기 창 (SPEC-005): 만든 순, 이름이 긴 장부는 두 줄까지
const BOOK_CHOICES: BookChoice[] = [
  { id: 'club', name: '한랑드림', kind: 'club', balance: 537_142 },
  { id: 'home', name: '우리집 가계부', kind: 'household', balance: 2_340_500 },
  { id: 'long', name: '동네 어르신 노래교실 친목회 회비 장부 (2026년부터)', kind: 'club', balance: -12_000 },
]

const ENTRY_TYPES: SegmentOptions<EntryType> = [
  { value: 'income', label: '수입', icon: 'income' },
  { value: 'expense', label: '지출', icon: 'expense' },
]

// 여백 역할: 묶음 안(좁게) < 묶음 사이(넓게) < 큰 구획
const SPACE_ROLES = ['--stack-tight', '--stack', '--group-gap', '--section-gap']

// 연달아 적기에서 저장한 순서 (마지막이 방금 저장한 줄)
const SAVED_ENTRIES: SavedEntry[] = [
  { name: '대관료', type: 'expense', amount: 40_000 },
  { name: '회비', type: 'income', amount: 140_000 },
  { name: '스승의 날 선생님 꽃다발과 카드 값', type: 'expense', amount: 58_000 },
  { name: '간식비', type: 'expense', amount: 28_340 },
  { name: '행사지원금', type: 'income', amount: 300_000 },
]

// 올해 결산 항목별 합계 (#84): [월, 종류, 이름, 금액] 기록에서 yearReport 로 계산
type ItemSpec = readonly [number, EntryType, string, number]

function itemReport(specs: readonly ItemSpec[]) {
  const entries = specs.map(([month, type, name, amount], index) => ({
    id: `c${index}`,
    month,
    type,
    name,
    amount,
    createdAt: `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
  }))
  return yearReport({ year: 2026, carryover: 370_482, entries })
}

const ITEM_REPORT = itemReport([
  [1, 'income', '회비(14인)', 1_490_000],
  [2, 'income', '회비(14인)', 140_000],
  [5, 'income', '행사지원금', 145_050],
  [6, 'income', '예금이자', 2_153],
  [1, 'expense', '대관료', 360_000],
  [12, 'expense', '대관료', 40_000],
  [3, 'expense', '간식비', 60_240],
  [10, 'expense', '야유회', 627_230],
  [11, 'expense', '행사비', 400_000],
  [12, 'expense', '송년회', 410_600],
  [9, 'expense', '스승의 날 선생님 꽃다발과 카드 값', 58_000],
])

const EXPENSE_ONLY_REPORT = itemReport([
  [1, 'expense', '대관료', 40_000],
  [2, 'expense', '간식비', 28_340],
])

const noop = () => {}

// 카톡 안 ② 미리보기 복구 코드
const CATALOG_CODE = 'HK7M-29QF-MX4P-8R2D'

// 설치 안내 그림 장 (홈 화면 모습 그림 장은 위 HomeScreenPreview 로 본다)
const GUIDE_PICTURES: GuidePicture[] = [
  'chrome-menu-button',
  'chrome-menu',
  'chrome-confirm',
  'samsung-menu-button',
  'samsung-add-page',
  'samsung-confirm',
]

// 회비 표 칸 견본 (SPEC-010 #163): 1~9월 채움(1/19 입금), 10월 반, 11월 안 냄, 12월 쉬는 달
function duesCell(month: number, state: DuesCellState, paid = 0): DuesCell {
  const fills: DuesCell['fills'] =
    paid > 0 ? [{ kind: 'payment', entryId: 'e1', year: 2026, month: month === 10 ? 10 : 1, day: 19, amount: paid }] : []
  return { month, state, fee: state === 'off' ? undefined : 20000, paid, fills }
}

const DUES_CELLS: DuesCell[] = [
  ...Array.from({ length: 9 }, (_, index) => duesCell(index + 1, 'full', 20000)),
  duesCell(10, 'partial', 10000),
  duesCell(11, 'empty'),
  duesCell(12, 'off'),
]

// 칸 모양 전부: 회원 아님·시작 달 전·월 회비 모름도
const DUES_CELLS_ALL: DuesCell[] = [
  duesCell(1, 'notMember'),
  duesCell(2, 'beforeStart'),
  duesCell(3, 'noFee'),
  duesCell(4, 'full', 20000),
  duesCell(5, 'full', 20000),
  duesCell(6, 'empty'),
  duesCell(7, 'off'),
  duesCell(8, 'off'),
  duesCell(9, 'empty'),
  duesCell(10, 'partial', 10000),
  duesCell(11, 'empty'),
  duesCell(12, 'empty'),
]

// 개발 모드 전용 디자인 카탈로그: 모든 기본 컴포넌트를 모든 상태로 한 화면에서 본다
export function Catalog() {
  const [theme, setTheme] = useState<ThemeChoice>('system')
  const [amount, setAmount] = useState(28340)
  const [bookName, setBookName] = useState('한랑드림')
  const [pickedBook, setPickedBook] = useState('club')
  const [carryover, setCarryover] = useState(370482)
  const [viewMonth, setViewMonth] = useState(9)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [installGuideOpen, setInstallGuideOpen] = useState(false)
  const [answerMonth, setAnswerMonth] = useState(10)
  const [entryType, setEntryType] = useState<EntryType | null>('expense')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pickedMonth, setPickedMonth] = useState(10)
  const [quickAmount, setQuickAmount] = useState(40000)
  const [pickedYear, setPickedYear] = useState('2026')
  const [pickedItem, setPickedItem] = useState('대관료')
  const [dayText, setDayText] = useState('')
  const [pickedYearMonth, setPickedYearMonth] = useState({ year: 2026, month: 7 })
  const [duesYear, setDuesYear] = useState(2026)

  return (
    <div className="catalog" data-theme={theme === 'system' ? undefined : theme} data-testid="design-catalog">
      <main className="catalog__inner">
        <header className="catalog__section">
          <h1 className="catalog__title">디자인 카탈로그</h1>
          <p className="catalog__state">개발 모드 전용. 값은 src/styles/tokens.css, 의도는 docs/design.md.</p>
          <OptionList label="테마" options={THEME_CHOICES} value={theme} onChange={setTheme} />
        </header>

        <Section title="색">
          <div className="catalog__swatches">
            {COLOR_TOKENS.map((token) => (
              <div key={token} className="catalog__swatch">
                <span className="catalog__chip-color" style={{ background: `var(${token})` }} />
                {token}
              </div>
            ))}
          </div>
        </Section>

        <Section title="자리 크기 (옛 토큰)">
          <div className="catalog__sizes">
            {SIZE_TOKENS.map((token) => (
              <span key={token} style={{ fontSize: `var(${token})`, lineHeight: 'var(--line-tight)' }}>
                {token} 수입 140,000원
              </span>
            ))}
          </div>
        </Section>

        <Section title="글자 역할">
          <div className="catalog__sizes">
            {TEXT_ROLES.map(({ role, sample, muted }) => (
              <span
                key={role}
                style={{
                  fontSize: `var(--text-${role}-size)`,
                  fontWeight: `var(--text-${role}-weight)`,
                  lineHeight: 'var(--line-tight)',
                  color: muted ? 'var(--muted)' : undefined,
                }}
              >
                --text-{role} {sample}
              </span>
            ))}
          </div>
        </Section>

        <Section title="여백 역할">
          <div className="catalog__sizes">
            {SPACE_ROLES.map((token) => (
              <div key={token} className="catalog__swatch">
                <span className="catalog__space-bar" style={{ width: `var(${token})` }} />
                {token}
              </div>
            ))}
          </div>
        </Section>

        <Section title="아이콘">
          <State label="항목 아이콘: 이름으로 자동 (itemIcon) — 모르는 이름은 영수증">
            <div className="catalog__icons">
              {ITEM_NAMES.map((name) => (
                <div key={name} className="catalog__icon">
                  <span className="catalog__icon-circle">
                    <Icon name={itemIcon(name)} />
                  </span>
                  {name}
                </div>
              ))}
            </div>
          </State>
          <State label="화면 동작 아이콘 (Lucide)">
            <div className="catalog__icons">
              {ACTION_ICONS.map(({ icon, label }) => (
                <div key={icon} className="catalog__icon">
                  <span className="catalog__icon-circle">
                    <Icon name={icon} />
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </State>
        </Section>

        <Section title="ListRow">
          <State label="장부 내역: 수입(청록 원) / 지출(회색 원) + 금액">
            <div className="catalog__card">
              <ListRow
                icon={itemIcon('회비')}
                tone="income"
                title="회비"
                description="10월 · 수입"
                end={<AmountText type="income" amount={140000} />}
              />
              <ListRow
                icon={itemIcon('대관료')}
                title="대관료"
                description="10월 · 지출"
                end={<AmountText type="expense" amount={40000} />}
              />
              <ListRow icon={itemIcon('간식비')} title="간식비" description="지출" end={<AmountText type="expense" amount={58280} />} />
            </div>
          </State>
          <State label="누르는 줄 (눌러 보기, 줄 끝 ›) · 보조 줄 없음 · 긴 이름 (금액이 모자라면 이름 아래 줄)">
            <div className="catalog__card">
              <ListRow
                icon={itemIcon('행사비')}
                title="행사비"
                onClick={noop}
                end={<AmountText type="expense" amount={1200000} />}
                chevron
              />
              <ListRow
                icon={itemIcon('꽃값')}
                title="스승의 날 선생님 꽃다발과 카드 값"
                description="5월 · 지출"
                onClick={noop}
                end={<AmountText type="expense" amount={58000} />}
                chevron
              />
            </div>
          </State>
          <State label="눌림">
            <div className="catalog__card" data-preview-pressed="">
              <ListRow
                icon={itemIcon('대관료')}
                title="대관료"
                description="10월 · 지출"
                onClick={noop}
                end={<AmountText type="expense" amount={40000} />}
              />
            </div>
          </State>
          <State label="아이콘 없는 줄 (회원 명단, SPEC-010): 이름 + 보조 줄 + 줄 끝 ›">
            <div className="catalog__card">
              <ListRow title="강민지" description="10월부터 쉬어요" onClick={noop} chevron />
              <ListRow title="김도윤" onClick={noop} chevron />
              <ListRow title="정하늘" description="7월에 들어왔어요" onClick={noop} chevron />
            </div>
          </State>
          <State label="저장 안 됨 (SPEC-002 v2.6, 저장에 실패한 뒤 적은 줄)">
            <div className="catalog__card">
              <ListRow
                icon={itemIcon('대관료')}
                title="대관료"
                description="16일 · 지출"
                onClick={noop}
                end={<AmountText type="expense" amount={40000} />}
                chevron
                badge="저장 안 됨"
              />
            </div>
          </State>
        </Section>

        <Section title="SegmentedControl">
          <State label={`둘 중 하나 (눌러 보기) · ${entryType === 'income' ? '수입' : entryType === 'expense' ? '지출' : '안 고름'}`}>
            <SegmentedControl label="수입인가요, 지출인가요?" options={ENTRY_TYPES} value={entryType} onChange={setEntryType} />
          </State>
          <State label="아직 안 고름">
            <SegmentedControl label="수입인가요, 지출인가요?" options={ENTRY_TYPES} value={null} onChange={noop} />
          </State>
        </Section>

        <Section title="MonthPicker">
          <State label={`고른 달 칠함 · 이번 달(10월) 테두리 (눌러 보기) · ${pickedMonth}월`}>
            <div className="catalog__card catalog__card--pad">
              <MonthPicker value={pickedMonth} currentMonth={10} onChange={setPickedMonth} />
            </div>
          </State>
        </Section>

        <Section title="DayInput (날 숫자 칸, v2.2 #80)">
          <State label={`카드 질문 칸 위: 빈칸 + [오늘 7일] 칩 (쳐 보기, 숫자만 두 자리) · ${dayText === '' ? '빈칸' : dayText}`}>
            <div className="catalog__wash">
              <DayInput
                label="며칠인가요?"
                value={dayText}
                onChange={(text) => setDayText(tidyDayText(text))}
                chips={[{ tag: '오늘', day: 7 }]}
                onPick={(day) => setDayText(String(day))}
              />
            </div>
          </State>
          <State label="연달아 적기: [오늘 7일] [방금 5일] / 방금 저장한 날이 오늘이면 [방금 7일] 하나">
            <div className="catalog__wash">
              <DayInput
                label="며칠인가요?"
                value=""
                onChange={noop}
                chips={[
                  { tag: '오늘', day: 7 },
                  { tag: '방금', day: 5 },
                ]}
              />
            </div>
            <div className="catalog__wash">
              <DayInput label="며칠인가요?" value="" onChange={noop} chips={[{ tag: '방금', day: 7 }]} />
            </div>
          </State>
          <State label="지난 연도 장부·다른 달: 칩 줄 없음 / 날짜 바꾸기로 돌아왔을 때 지금 날(7)">
            <div className="catalog__wash">
              <DayInput label="며칠인가요?" value="" onChange={noop} />
            </div>
            <div className="catalog__wash">
              <DayInput label="며칠인가요?" value="7" onChange={noop} />
            </div>
          </State>
          <State label="고치기 화면 (화면 바탕 위, 칩 없음)">
            <DayInput label="며칠인가요?" value="31" onChange={noop} />
          </State>
          <State label="칩 눌림">
            <div className="catalog__wash" data-preview-pressed="">
              <DayInput label="눌림" value="" onChange={noop} chips={[{ tag: '오늘', day: 7 }]} />
            </div>
          </State>
        </Section>

        <Section title="MonthButton (질문 제목 옆 달 버튼)">
          <State label='"며칠인가요?" 옆 [10월 ▾] → 열두 달 선택 창 (눌러 보기) · 눌림'>
            <div className="catalog__wash catalog__row">
              <MonthButton month={pickedMonth} onClick={() => setSheetOpen(true)} />
              <div data-preview-pressed="">
                <MonthButton month={2} onClick={noop} />
              </div>
            </div>
          </State>
        </Section>

        <Section title="OptionList">
          <State label="화면 바탕 위: 흰 면 + 회색 원 · 오른쪽 수입/지출, 수입 청록 원, 맨 아래 [직접 적기] (눌러 보기, 내역 적기 항목 목록)">
            <OptionList
              label="자주 쓴 항목"
              options={[
                { value: '대관료', label: '대관료', icon: itemIcon('대관료'), note: '지출' },
                { value: '간식비', label: '간식비', icon: itemIcon('간식비'), note: '지출' },
                { value: '회비', label: '회비', icon: itemIcon('회비'), note: '수입', tone: 'income' },
              ]}
              value={pickedItem}
              onChange={setPickedItem}
              action={{ label: '직접 적기', icon: 'pen', onClick: noop }}
            />
          </State>
          <State label="안 고른 줄·직접 적기 눌림">
            <div data-preview-pressed="">
              <OptionList
                label="항목"
                options={[{ value: '회비', label: '회비', icon: itemIcon('회비'), note: '수입', tone: 'income' }]}
                value={null}
                onChange={noop}
                action={{ label: '직접 적기', icon: 'pen', onClick: noop }}
              />
            </div>
          </State>
          <State label="[⌄ 예전에 쓴 항목 N개 더 보기]: 처음 줄들 뒤 청록 글자 + 위 옅은 선, 누르면 그 자리에 구분 글자 + 나머지 줄 (눌러 보기, SPEC-001 v2.7)">
            <OptionList
              label="자주 쓴 항목"
              options={[
                { value: '대관료', label: '대관료', icon: itemIcon('대관료'), note: '지출' },
                { value: '회비', label: '회비', icon: itemIcon('회비'), note: '수입', tone: 'income' },
              ]}
              more={{
                label: '예전에 쓴 항목 2개 더 보기',
                heading: '예전에 쓴 항목',
                options: [
                  { value: '꽃값', label: '꽃값', icon: itemIcon('꽃값'), note: '지출' },
                  { value: '찬조금', label: '찬조금', icon: itemIcon('찬조금'), note: '수입', tone: 'income' },
                ],
              }}
              value={pickedItem}
              onChange={setPickedItem}
              action={{ label: '직접 적기', icon: 'pen', onClick: noop }}
            />
          </State>
          <State label="[직접 적기] 펼침: 줄 아래 같은 면에 이름 칸 + 수입·지출 스위치, 체크 지움 (내역 고치기, SPEC-001 v2.6)">
            <OptionList
              label="자주 쓴 항목"
              options={[
                { value: '꽃값', label: '꽃값', icon: itemIcon('꽃값'), note: '지출' },
                { value: '회비', label: '회비', icon: itemIcon('회비'), note: '수입', tone: 'income' },
              ]}
              value={null}
              onChange={noop}
              action={{
                label: '직접 적기',
                icon: 'pen',
                onClick: noop,
                expanded: true,
                panel: (
                  <>
                    <TextField label="무엇인지 적어 주세요" labelRole="label" value="꽃바구니" placeholder="예: 꽃값" onChange={noop} />
                    <SegmentedControl label="수입인가요, 지출인가요?" options={ENTRY_TYPES} value="expense" onChange={noop} />
                  </>
                ),
              }}
            />
          </State>
          <State label="선택 창 안: 회색 면 + 흰 원 · 고른 줄 옅은 청록 + 체크 (설정 장부 연도)">
            <div className="catalog__frame catalog__frame--sheet">
              <BottomSheet inline open title="어느 해 장부를 볼까요?" onClose={noop}>
                <OptionList
                  label="장부 연도"
                  options={[
                    { value: '2026', label: '2026년' },
                    { value: '2025', label: '2025년' },
                    { value: '2024', label: '2024년' },
                  ]}
                  value={pickedYear}
                  onChange={setPickedYear}
                />
              </BottomSheet>
            </div>
          </State>
        </Section>

        <Section title="BookPicker (장부 고르기 창, SPEC-005)">
          <State label="지금 장부 청록 둘레 + ✓, 맨 아래 점선 [+ 새 장부 만들기], 그 아래 같은 모양 [엑셀 파일로 새 장부](SPEC-010) (눌러 보기)">
            <div className="catalog__frame catalog__frame--sheet">
              <BottomSheet inline open title="어느 장부를 볼까요?" onClose={noop}>
                <BookPicker books={BOOK_CHOICES} currentId={pickedBook} onPick={setPickedBook} onNew={noop} onImportExcel={noop} />
              </BottomSheet>
            </div>
          </State>
        </Section>

        <Section title="엑셀 불러오기 (SPEC-010 8절 #166)">
          <State label="읽는 중 (엑셀 기능을 처음 받는 시간 포함, [‹ 장부로] 로 떠나면 버림)">
            <div className="catalog__frame catalog__frame--short-screen">
              <div className="app__main">
                <ExcelReading fileName="지어낸모임.xlsx" onBack={noop} />
              </div>
            </div>
          </State>
          <State label="읽지 못함: 제목 + 다음에 할 일 + 아래 고정 [파일 다시 고르기] (기록 파일을 고른 경우, 서버 주소 없는 빌드)">
            <div className="catalog__frame catalog__frame--short-screen">
              <div className="app__main">
                <ExcelProblem problem="backup-file" route="settings" onBack={noop} onPickAgain={noop} onReload={noop} />
              </div>
            </div>
          </State>
          <State label="엑셀 기능을 받지 못함: 주 버튼이 [앱 다시 열기] (실패한 동적 import 는 다시 불러도 남을 수 있어 새로 연다)">
            <div className="catalog__frame catalog__frame--short-screen">
              <div className="app__main">
                <ExcelProblem problem="load-failed" route="settings" onBack={noop} onPickAgain={noop} onReload={noop} />
              </div>
            </div>
          </State>
          <State label="사실 카드: 해 · 기록 · 회원 · 월 회비(이어진 해 묶음) · 회비 표 (흰 카드, 줄 사이 선 없음)">
            <ImportFacts summary={CATALOG_EXCEL_SUMMARY} />
          </State>
          <State label="알림 줄 ok: 흰 면 + 동그라미 체크 (검산이 맞음)">
            <ExcelNote tone="ok" title="해마다 잔액이 맞아요">
              엑셀 잔액과 앱 계산을 해마다 맞춰 봤어요. 이월금은 엑셀에 적힌 값을 그대로 써요.
            </ExcelNote>
          </State>
          <State label="알림 줄 info: --info-bg (낸 분을 다 못 나눈 회비)">
            <ExcelNote tone="info" title="낸 분을 다 못 나눈 회비 118건">
              회원 이름이 섞인 입금은 회비로 넣고, 낸 분은 나중에 회비 표에서 붙여요.
            </ExcelNote>
          </State>
          <State label="알림 줄 warn: --warn-bg + 목록 (검산이 다름)">
            <ExcelNote tone="warn" title="잔액을 맞춰 보니 2곳이 달라요">
              <ul className="excel-note__items">
                <li>2019년 마지막 잔액 4원 차이</li>
                <li>2020년 이월금 4원 차이</li>
              </ul>
              이월금은 엑셀에 적힌 값을 그대로 써요.
            </ExcelNote>
          </State>
          <State label="알림 줄 warn 버튼: 줄 전체를 누르면 목록 (끝에 흰 면 [보기 ›], 눌러 보기)">
            <ExcelNote tone="warn" title="날짜를 바꾼 줄 3건" onOpen={noop}>
              그 달에 없는 날은 그 달 마지막 날로, 날을 읽을 수 없는 줄은 날짜 없이 넣었어요.
            </ExcelNote>
          </State>
        </Section>

        <Section title="엑셀 내보내기 (SPEC-010 9절 #167)">
          <State label="만드는 중 (엑셀 기능을 처음 받는 시간 포함, 보내기 창이 떠 있는 동안도 이 모습)">
            <div className="catalog__frame catalog__frame--sheet">
              <ExcelExportSheet inline flow={{ state: { step: 'making' }, open: true, close: noop }} onReload={noop} />
            </div>
          </State>
          <State label="저장했어요 (파일 공유가 안 되는 폰: 다운로드 폴더): 회색 면 사실 카드 + 카톡으로 보내는 길(info) + [닫기]">
            <div className="catalog__frame catalog__frame--sheet">
              <ExcelExportSheet
                inline
                flow={{
                  state: { step: 'saved', fileName: '다솜회 장부 2026-11-24.xlsx', years: '2013~2026년', sheets: '해마다 입출금내역 · 회비내역' },
                  open: true,
                  close: noop,
                }}
                onReload={noop}
              />
            </div>
          </State>
          <State label="엑셀 기능을 받지 못함: 불러오기와 같은 문구 + [앱 다시 열기] + [닫기]">
            <div className="catalog__frame catalog__frame--sheet">
              <ExcelExportSheet inline flow={{ state: { step: 'load-failed' }, open: true, close: noop }} onReload={noop} />
            </div>
          </State>
        </Section>

        <Section title="BottomSheet">
          <State label="아래에서 올라오는 선택 창 + MonthPicker (바깥 누르기·Esc 로 닫힘)">
            <div className="catalog__frame catalog__frame--sheet">
              <BottomSheet inline open title="몇 월인가요?" onClose={noop}>
                <MonthPicker value={9} currentMonth={10} onChange={noop} />
              </BottomSheet>
            </div>
          </State>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            선택 창 실제로 열어 보기
          </Button>
        </Section>

        <Section title="YearMonthPicker (해·달 고르기, SPEC-010)">
          <State
            label={`해 넘기기(창 안이라 회색 화살표) + 열두 달, 이번 달(2026년 11월) 테두리 (눌러 보기) · ${pickedYearMonth.year}년 ${pickedYearMonth.month}월`}
          >
            <div className="catalog__frame catalog__frame--sheet">
              <BottomSheet inline open title="언제 들어왔나요?" onClose={noop}>
                <YearMonthPicker
                  value={pickedYearMonth}
                  current={{ year: 2026, month: 11 }}
                  firstYear={2000}
                  lastYear={2027}
                  onChange={(year, month) => setPickedYearMonth({ year, month })}
                />
              </BottomSheet>
            </div>
          </State>
          <State label="고를 수 있는 첫 달 min(그 전 달은 점선 비활성) · 언제까지 쉬나요? (SPEC-010 5절 #163)">
            <div className="catalog__frame catalog__frame--sheet">
              <BottomSheet inline open title="언제까지 쉬나요?" onClose={noop}>
                <p className="screen__note">고른 달까지 쉬는 달이 돼요</p>
                <YearMonthPicker
                  value={null}
                  min={{ year: 2026, month: 10 }}
                  current={{ year: 2026, month: 11 }}
                  firstYear={2026}
                  lastYear={2027}
                  onChange={noop}
                />
                <Button variant="secondary" onClick={noop}>
                  아직 몰라요
                </Button>
              </BottomSheet>
            </div>
          </State>
          <State label="마지막 해(다음 해 화살표 비활성) · 안내 Caption (회비 표 시작 달)">
            <div className="catalog__frame catalog__frame--sheet">
              <BottomSheet inline open title="회비 표를 언제부터 계산할까요?" onClose={noop}>
                <p className="screen__note">바꾸면 그 전 기록은 회비 표에 들어가지 않아요</p>
                <YearMonthPicker value={{ year: 2027, month: 1 }} firstYear={2000} lastYear={2027} onChange={noop} />
              </BottomSheet>
            </div>
          </State>
        </Section>

        <Section title="EntryCard (지금 적는 내역 카드)">
          <State label="며칠인가요? 단계 (v2.2 #80): 날짜 줄은 달만, [바꾸기] 없음 → 제목 + [10월 ▾] + 날 숫자 칸 + 칩">
            <EntryCard rows={[{ label: '날짜', icon: 'calendar', value: '10월' }]}>
              <div className="catalog__stack">
                <div className="catalog__question-row">
                  <h2 className="catalog__question">며칠인가요?</h2>
                  <MonthButton month={10} onClick={() => setSheetOpen(true)} />
                </div>
                <DayInput
                  label="며칠인가요?"
                  value=""
                  onChange={noop}
                  chips={[
                    { tag: '오늘', day: 7 },
                    { tag: '방금', day: 5 },
                  ]}
                />
              </div>
            </EntryCard>
          </State>
          <State label="금액 단계: 날짜 줄 + 항목 줄 (이름 · 수입/지출) → 옅은 면에 지금 질문 — [날짜 바꾸기] 눌러 보기">
            <EntryCard
              rows={[
                {
                  label: '날짜',
                  icon: 'calendar',
                  value: `${answerMonth}월 7일`,
                  onChange: () => setAnswerMonth((month) => (month % 12) + 1),
                },
                { label: '항목', icon: itemIcon('대관료'), value: '대관료 · 지출', onChange: noop },
              ]}
            >
              <div className="catalog__stack">
                <h2 className="catalog__question">얼마인가요?</h2>
                <AmountDisplay label="얼마인가요?" value={40000} onChange={noop} />
              </div>
            </EntryCard>
          </State>
          <State label="항목 단계: 날짜 줄만 → 항목 목록 + 안내">
            <EntryCard rows={[{ label: '날짜', icon: 'calendar', value: '10월 7일', onChange: noop }]}>
              <div className="catalog__stack">
                <h2 className="catalog__question">무엇인가요?</h2>
                <OptionList
                  label="자주 쓴 항목"
                  options={[
                    { value: '대관료', label: '대관료', icon: itemIcon('대관료'), note: '지출' },
                    { value: '회비', label: '회비', icon: itemIcon('회비'), note: '수입', tone: 'income' },
                  ]}
                  value={null}
                  onChange={noop}
                  action={{ label: '직접 적기', icon: 'pen', onClick: noop }}
                />
                <p className="catalog__state">누르면 바로 다음으로 넘어가요</p>
              </div>
            </EntryCard>
          </State>
          <State label="새 이름의 수입/지출을 묻는 동안: 항목 줄은 이름만 · 긴 이름 → 스위치">
            <EntryCard
              rows={[
                { label: '날짜', icon: 'calendar', value: '5월 15일', onChange: noop },
                { label: '항목', icon: itemIcon('꽃값'), value: '스승의 날 선생님 꽃다발과 카드 값', onChange: noop },
              ]}
            >
              <div className="catalog__stack">
                <h2 className="catalog__question">수입인가요, 지출인가요?</h2>
                <SegmentedControl label="수입인가요, 지출인가요?" options={ENTRY_TYPES} value={null} onChange={noop} />
              </div>
            </EntryCard>
          </State>
          <State label="[바꾸기] 눌림">
            <div data-preview-pressed="">
              <EntryCard rows={[{ label: '날짜', icon: 'calendar', value: '10월 7일', onChange: noop }]}>
                <h2 className="catalog__question">무엇인가요?</h2>
              </EntryCard>
            </div>
          </State>
        </Section>

        <Section title="SavedEntries (장부에 넣었어요 목록, 연달아 적기)">
          <State label='한 건: 방금 저장한 줄 이름 옆 "방금"'>
            <SavedEntries entries={SAVED_ENTRIES.slice(0, 1)} />
          </State>
          <State label="수입·지출 섞임: 금액도 회색, 부호로 구분 · 긴 이름">
            <SavedEntries entries={SAVED_ENTRIES.slice(0, 3)} />
          </State>
          <State label="최근 2줄만 (머리는 전체 5건)">
            <SavedEntries entries={SAVED_ENTRIES} />
          </State>
        </Section>

        <Section title="AmountDisplay">
          <State label={`큰 금액 + 빠른 더하기 (눌러 보기) · ${quickAmount.toLocaleString('ko-KR')}`}>
            <AmountDisplay label="얼마인가요?" value={quickAmount} onChange={setQuickAmount} />
          </State>
          <State label="빈칸 (자리표시 0)">
            <AmountDisplay label="얼마인가요?" value={0} onChange={noop} />
          </State>
          <State label="가장 큰 금액 (999,999,999)">
            <AmountDisplay label="얼마인가요?" value={999_999_999} onChange={noop} />
          </State>
        </Section>

        <Section title="IconButton">
          <State label="위쪽 [결산] 흰 면 · [설정] 면 없는 글자 버튼 + 점 표시">
            <div className="catalog__top">
              <IconButton icon="chart" variant="surface" onClick={noop}>
                결산
              </IconButton>
              <IconButton icon="settings" dotLabel="기록 파일 보내기 필요" onClick={noop}>
                설정
              </IconButton>
            </div>
          </State>
          <State label="돌아가기">
            <div>
              <IconButton icon="left" onClick={noop}>
                장부로
              </IconButton>
            </div>
          </State>
          <State label="흰 면 + 보조 글 note (장부 [회비 표], SPEC-010 #163) · 좁으면 보조 글이 아래 줄로">
            <div className="catalog__stack">
              <IconButton icon="users" variant="surface" note="지난달까지 덜 낸 분 2명" onClick={noop}>
                회비 표
              </IconButton>
              <IconButton icon="users" variant="surface" onClick={noop}>
                회비 표
              </IconButton>
            </div>
          </State>
          <State label="흰 면 (달 넘기기 아래 [10월 정리 보기]) · 기본 / 눌림">
            <IconButton icon="receipt" variant="surface" onClick={noop}>
              10월 정리 보기
            </IconButton>
            <div data-preview-pressed="">
              <IconButton icon="receipt" variant="surface" onClick={noop}>
                10월 정리 보기
              </IconButton>
            </div>
          </State>
        </Section>

        <Section title="Button">
          <State label="주 · 기본 / 비활성">
            <div className="catalog__pair">
              <Button>저장</Button>
              <Button disabled>저장</Button>
            </div>
          </State>
          <State label="주 · 아이콘 + 글자">
            <Button icon="plus">내역 적기</Button>
          </State>
          <State label="보조 · 기본 / 비활성">
            <div className="catalog__pair">
              <Button variant="secondary">기록 파일 보내기</Button>
              <Button variant="secondary" disabled>
                기록 파일 보내기
              </Button>
            </div>
          </State>
          <State label="위험 · 기본 / 비활성">
            <div className="catalog__pair">
              <Button variant="danger">지우기</Button>
              <Button variant="danger" disabled>
                지우기
              </Button>
            </div>
          </State>
          <State label="위험 글자형 · 기본 / 비활성">
            <div className="catalog__pair">
              <Button variant="danger-text">이 기록 지우기</Button>
              <Button variant="danger-text" disabled>
                이 기록 지우기
              </Button>
            </div>
          </State>
        </Section>

        <Section title="MoneyInput">
          <State label="입력 (눌러 보기 — 다 지우면 빈칸, 0 을 치면 0)">
            <MoneyInput label="얼마인가요?" value={amount} onChange={setAmount} />
          </State>
          <State label="0원 (처음 값 0 도 0 으로 보인다, #59)">
            <MoneyInput label="작년 이월금" value={0} onChange={noop} />
          </State>
          <State label="오류">
            <MoneyInput label="얼마인가요?" value={0} onChange={noop} error="얼마인지 적어주세요" />
          </State>
          <State label="비활성">
            <MoneyInput label="얼마인가요?" value={140000} onChange={noop} disabled />
          </State>
          <State label="보조 이름 (labelRole=label, 설정 카드 안)">
            <MoneyInput label="작년 이월금" labelRole="label" value={352000} onChange={noop} />
          </State>
        </Section>

        <Section title="TextField">
          <State label="입력 (눌러 보기)">
            <TextField label="장부 이름" value={bookName} placeholder="예: 한랑드림" onChange={setBookName} />
          </State>
          <State label="빈칸">
            <TextField label="장부 이름" value="" placeholder="예: 한랑드림" onChange={noop} />
          </State>
          <State label="오류">
            <TextField label="장부 이름" value="" onChange={noop} error="장부 이름을 적어 주세요" />
          </State>
          <State label="비활성">
            <TextField label="장부 이름" value="한랑드림" onChange={noop} disabled />
          </State>
          <State label="보조 이름 (labelRole=label, 내역 적기 직접 적기)">
            <TextField label="직접 적기" labelRole="label" value="" placeholder="예: 꽃값" onChange={noop} />
          </State>
          <State label="막지 않는 안내 note (회원 넣기 같은 이름, SPEC-010) — 오류 색 아님">
            <TextField
              label="이름"
              labelRole="label"
              value="김도윤"
              onChange={noop}
              note="같은 이름이 있어요. 구분할 수 있게 적어 주세요"
            />
          </State>
        </Section>

        <Section title="PickerField (고르는 칸, SPEC-010)">
          <State label="이름 + 입력칸 모양 버튼(값 + ▾), 누르면 해·달 선택 창 (회원 넣기·회원 정보)">
            <PickerField label="들어온 달" value="2026년 7월" onClick={() => setSheetOpen(true)} />
          </State>
          <State label="그만둔 달 · 눌림">
            <div data-preview-pressed="">
              <PickerField label="그만둔 달" value="2025년 12월까지" onClick={noop} />
            </div>
          </State>
        </Section>

        <Section title="CarryoverField">
          <State label={`남았어요 / 적자였어요 (눌러 보기) · 이월금 ${carryover.toLocaleString('ko-KR')}`}>
            <CarryoverField value={carryover} onChange={setCarryover} />
          </State>
          <State label="적자 (음수 이월금)">
            <CarryoverField value={-50000} onChange={noop} />
          </State>
          <State label={'0원 (시작 화면 "모르면 0으로 두고…")'}>
            <CarryoverField value={0} onChange={noop} />
          </State>
          <State label="가계부 첫 해 칸 이름 (label, SPEC-005)">
            <CarryoverField label={carryoverWords('household', true).label} value={0} onChange={noop} />
          </State>
        </Section>

        <Section title="BalanceCard">
          <State label="잔액 + 보조 줄">
            <BalanceCard label="지금 잔액" amount={1166193} note="작년 이월 370,482원 포함" />
          </State>
          <State label="가계부 첫 해 보조 줄 (SPEC-005)">
            <BalanceCard label="지금 잔액" amount={2340500} note="처음 남은 돈 500,000원 포함" />
          </State>
          <State label="적자 (보조 줄 없음)">
            <BalanceCard label="지금 잔액" amount={-50000} />
          </State>
        </Section>

        <Section title="AmountText">
          <State label="수입(+ 초록) / 지출(− 본문색) · 목록 금액 크기">
            <div className="catalog__amounts">
              <span>회비</span>
              <AmountText type="income" amount={140000} />
              <span>대관료</span>
              <AmountText type="expense" amount={40000} />
              <span>간식비</span>
              <AmountText type="expense" amount={58280} />
            </div>
          </State>
        </Section>

        <Section title="MonthStepper">
          <State label={`${viewMonth}월 (눌러 보기) · 1월·12월 끝에서 비활성`}>
            <MonthStepper
              month={viewMonth}
              onPrevious={() => setViewMonth((value) => value - 1)}
              onNext={() => setViewMonth((value) => value + 1)}
              previousDisabled={viewMonth === 1}
              nextDisabled={viewMonth === 12}
            />
          </State>
          <State label="1월 (이전 달 비활성)">
            <MonthStepper month={1} onPrevious={noop} onNext={noop} previousDisabled />
          </State>
          <State label="가운데 달 ▾ 누르기 → 열두 달 선택 창 (눌러 보기)">
            <MonthStepper
              month={pickedMonth}
              onPrevious={() => setPickedMonth((value) => value - 1)}
              onNext={() => setPickedMonth((value) => value + 1)}
              previousDisabled={pickedMonth === 1}
              nextDisabled={pickedMonth === 12}
              onPickMonth={() => setSheetOpen(true)}
            />
          </State>
        </Section>

        <Section title="YearStepper (한 해씩 넘기기, SPEC-010 #163)">
          <State label={`회비 표 제목(h1, 흰 화살표) · ${duesYear}년 (눌러 보기, 2025~2026)`}>
            <YearStepper
              heading
              label={`${duesYear}년 회비`}
              onPrevious={() => setDuesYear((value) => value - 1)}
              onNext={() => setDuesYear((value) => value + 1)}
              previousDisabled={duesYear <= 2025}
              nextDisabled={duesYear >= 2026}
            />
          </State>
        </Section>

        <Section title="DuesStrip (회비 표 사람별 줄 12칸 띠, SPEC-010 4절 #163)">
          <State label="1~9월 채움 · 10월 반 · 11월 안 냄 · 12월 쉬는 달, 기준 달 10월 테두리">
            <div className="catalog__card">
              <DuesStrip cells={DUES_CELLS} referenceMonth={10} />
            </div>
          </State>
          <State label="회원 아님(1월) · 시작 달 전(2월) · 월 회비 모름(3월, 빗금) · 채움 · 안 냄 · 쉬는 달 · 반">
            <div className="catalog__card">
              <DuesStrip cells={DUES_CELLS_ALL} referenceMonth={11} />
            </div>
          </State>
        </Section>

        <Section title="DuesCalendar (한 분 보기 12칸 달력, SPEC-010 5절 #163)">
          <State label="채움 1/19 · 반 · 아직 · 쉼, 기준 달 10월 테두리">
            <DuesCalendar cells={DUES_CELLS} year={2026} referenceMonth={10} onPick={noop} />
          </State>
          <State label="회원 아님·시작 달 전(누를 수 없음 -) · 월 회비 모름(빗금) · 눌림">
            <DuesCalendar cells={DUES_CELLS_ALL} year={2026} referenceMonth={11} onPick={noop} />
            <div data-preview-pressed="">
              <DuesCalendar cells={DUES_CELLS.slice(8, 12)} year={2026} onPick={noop} />
            </div>
          </State>
        </Section>

        <Section title="BottomActionBar">
          <State label="기본 / 비활성">
            <div className="catalog__frame catalog__frame--short">
              <BottomActionBar icon="plus" label="내역 적기" onClick={noop} />
            </div>
            <div className="catalog__frame catalog__frame--short">
              <BottomActionBar label="사진으로 저장" onClick={noop} disabled />
            </div>
          </State>
          <State label="보조 (연달아 적기 항목 고르기 단계 [다 적었어요])">
            <div className="catalog__frame catalog__frame--short">
              <BottomActionBar variant="secondary" label="다 적었어요" onClick={noop} />
            </div>
          </State>
          <State label="비활성 + 안내 (누를 수 없는 이유, 내역 적기 [저장])">
            <div className="catalog__frame catalog__frame--note">
              <BottomActionBar label="저장" onClick={noop} disabled note="수입인지 지출인지 골라 주세요" />
            </div>
          </State>
        </Section>

        <Section title="SavePictureBar (월 정리·올해 결산 아래, #58·#130)">
          <State label="공유 창 있음: 보조 [사진으로 저장] + 주 [사진 보내기]">
            <div className="catalog__frame catalog__frame--note">
              <SavePictureBar canSend onSave={noop} onSend={noop} />
            </div>
          </State>
          <State label="보내기 거부 → 한 번 더 눌러 보내기">
            <div className="catalog__frame catalog__frame--note">
              <SavePictureBar canSend sendReady onSave={noop} onSend={noop} />
            </div>
          </State>
          <State label="보내기 만드는 중 (두 버튼 모두 누를 수 없음)">
            <div className="catalog__frame catalog__frame--note">
              <SavePictureBar canSend busy="send" onSave={noop} onSend={noop} />
            </div>
          </State>
          <State label="공유 창 없음(PC 등): [사진으로 저장] 하나">
            <div className="catalog__frame catalog__frame--note">
              <SavePictureBar onSave={noop} />
            </div>
          </State>
          <State label="아이폰: 공유 시트에서 고를 것 안내">
            <div className="catalog__frame catalog__frame--note">
              <SavePictureBar canSend sharesToPhotos onSave={noop} onSend={noop} />
            </div>
          </State>
          <State label="아이폰: 사진 준비됨 → 사진 앱에 저장">
            <div className="catalog__frame catalog__frame--note">
              <SavePictureBar canSend saveReady sharesToPhotos onSave={noop} onSend={noop} />
            </div>
          </State>
        </Section>

        <Section title="ItemTotalsCards (올해 결산 단톡방용 요약의 항목별 카드, #84·#130)">
          <State label="단톡방용 요약 카드 셋 (YearShareSummary, 이 영역이 사진 한 장)">
            <YearShareSummary report={ITEM_REPORT} bookName="한랑드림" carryoverWords={carryoverWords('club', true)} targetRef={null} />
          </State>
          <State label="수입·지출 카드 (금액 큰 순, 긴 이름 줄바꿈, 아주 작은 비율도 최소 막대)">
            <ItemTotalsCards report={ITEM_REPORT} />
          </State>
          <State label="수입 없음 → 올해 적은 수입이 없어요">
            <ItemTotalsCards report={EXPENSE_ONLY_REPORT} />
          </State>
          <State label="결산표 항목별 합계 표 (인라인 hex 양식, 360px)">
            <div style={sheetPaper}>
              <ItemTotalsTable
                incomeItems={ITEM_REPORT.incomeItems}
                expenseItems={ITEM_REPORT.expenseItems}
                income={ITEM_REPORT.totals.income}
                expense={ITEM_REPORT.totals.expense}
              />
            </div>
          </State>
        </Section>

        <Section title="NoticeBar">
          <State label="저장 실패">
            <NoticeBar message={STORAGE_NOTICE.saveFailed} />
          </State>
          <State label="긴 문장 (시작 안내)">
            <NoticeBar message="저장된 기록을 읽지 못해 새 장부로 시작해요. 예전 기록은 따로 보관해 두었어요" />
          </State>
          <State label="버튼 붙음 (저장 실패 → 기록 파일 보내기)">
            <NoticeBar message={STORAGE_NOTICE.saveFailed} action={{ label: '기록 파일 보내기', icon: 'share', onClick: noop }} />
          </State>
          <State label="30일 안내 → 기록 파일 보내기 (#9)">
            <NoticeBar message="한 달 넘게 기록 파일을 보내지 않았어요" action={{ label: '기록 파일 보내기', icon: 'share', onClick: noop }} />
          </State>
          <State label="7일 보관 안내 (SPEC-006, 버튼 없음)">
            <NoticeBar message={KEEP_REMINDER_MESSAGE} />
          </State>
          <State label="버튼 눌림">
            <div data-preview-pressed="">
              <NoticeBar
                message="저장된 기록을 읽지 못했어요. 지금 적는 내용은 저장되지 않아요"
                action={{ label: '기록 파일 불러오기', onClick: noop }}
              />
            </div>
          </State>
        </Section>

        <Section title="기록 지키기 (SPEC-006)">
          <State label="설정 맨 위 카드 (v2.6: 제목 · 복구 코드 · 안내 · 주 버튼 [복구 코드 보내기] · 상태 줄)">
            <KeepCard code="HK7M-29QF-MX4P-8R2D" statusText="자동으로 지키기 켜짐 · 3분 전에 보관했어요" tooLarge={false} onShare={noop} />
          </State>
          <State label="맨 위 카드: 보관본이 너무 큼 (상태 줄 다음 줄)">
            <KeepCard code="HK7M-29QF-MX4P-8R2D" statusText="자동으로 지키기 켜짐" tooLarge onShare={noop} />
          </State>
          <State label="복구 코드로 불러오기 화면 (16자를 넣고 [불러오기] — 이 미리보기는 늘 '없음')">
            <div className="catalog__frame catalog__frame--screen">
              <div className="app__main">
                <KeepRestoreScreen
                  server={NO_KEEP_SERVER}
                  hasRecords
                  onRestore={() => ({ ok: true })}
                  backLabel="설정"
                  onBack={noop}
                  dialogs={NO_DIALOGS}
                />
              </div>
            </div>
          </State>
        </Section>

        <Section title="홈 화면 모습 그림 (SPEC-009 HomeScreenPreview)">
          <State label="묻는 화면·그림 안내 마지막 장·설치 확인 화면이 같이 쓴다. 화면 읽기: &quot;홈 화면에 '우리 장부' 아이콘이 생겨요&quot;">
            <HomeScreenPreview />
          </State>
        </Section>

        <Section title="InstallGuide (홈 화면에 추가 방법 안내, SPEC-009 그림 넘기기)">
          <State label="설정 [홈 화면에 추가] 줄 (설치 제안이 없으면 누를 때 크롬 그림 안내 창)">
            <div className="catalog__card">
              <ListRow
                icon="phone"
                title="홈 화면에 추가"
                description="기록이 더 안전해요"
                onClick={() => setInstallGuideOpen(true)}
                end={<Icon name="right" />}
              />
            </div>
          </State>
          <State label="방법 안내 선택 창 · 크롬 (1 / 4, [이전]·[다음] 으로 넘겨 보기)">
            <div className="catalog__frame catalog__frame--guide">
              <BottomSheet inline open title="홈 화면에 추가하는 방법" onClose={noop}>
                <InstallGuide browser="chrome" onFinish={noop} />
              </BottomSheet>
            </div>
          </State>
          <State label="방법 안내 선택 창 · 삼성 인터넷">
            <div className="catalog__frame catalog__frame--guide">
              <BottomSheet inline open title="홈 화면에 추가하는 방법" onClose={noop}>
                <InstallGuide browser="samsung" onFinish={noop} />
              </BottomSheet>
            </div>
          </State>
          <State label="브라우저를 모를 때 (먼저 앱 고르기, 고르면 그 브라우저 1장)">
            <InstallGuide browser="other" onFinish={noop} />
          </State>
          <State label="그림 장 모아 보기 (크롬 1·2·3, 삼성 인터넷 1·2·3 — 누를 곳 깜빡임, 동작 줄이기면 멈춤)">
            <div className="catalog__pictures">
              {GUIDE_PICTURES.map((picture) => (
                <InstallGuidePicture key={picture} picture={picture} />
              ))}
            </div>
          </State>
        </Section>

        <Section title="BrowserPicture · TapMark (브라우저 화면 모형 부품)">
          <State label="부품 조합 예: 아래 도구 줄 ⋮ 를 누르고 아래 메뉴의 한 줄을 고르는 그림 (위 줄 단추면 화살표가 아래에서 위로)">
            <div className="catalog__pictures">
              <BrowserPicture name="example-bottom-button">
                <BrowserPage title="우리 장부" />
                <BrowserBar place="bottom" items={[{ icon: 'left' }, { icon: 'right' }, { icon: 'refresh' }, { icon: 'kebab', hot: true }]} />
              </BrowserPicture>
              <BrowserPicture name="example-bottom-menu">
                <BrowserPage title="우리 장부" />
                <BrowserMenu place="bottom" items={[{ label: '새로고침' }, { label: '링크 복사' }, { label: '메뉴 한 줄', hot: true }]} />
                <BrowserBar place="bottom" items={[{ icon: 'left' }, { icon: 'right' }, { icon: 'refresh' }, { icon: 'kebab' }]} />
              </BrowserPicture>
            </div>
          </State>
        </Section>

        <Section title="카톡 안에서 열렸을 때 (SPEC-009 C InAppBrowserScreen)">
          <State label="① 장부 없음 (안드로이드): [인터넷 앱으로 열기] 링크 + 안 열릴 때 메뉴 그림 + 작은 글자 버튼 [그냥 여기서 쓸게요]">
            <div className="catalog__frame catalog__frame--auto">
              <div className="app__main">
                <InAppBrowserScreen kind="kakao-android" onStay={noop} />
              </div>
            </div>
          </State>
          <State label="② 장부 있음 · 복구 코드: 지켜 두는 중 (주 버튼 누를 수 없음)">
            <div className="catalog__frame catalog__frame--auto">
              <div className="app__main">
                <InAppBrowserScreen kind="kakao-android" move={{ by: 'code', code: CATALOG_CODE, keepNow: () => new Promise(() => {}) }} onStay={noop} />
              </div>
            </div>
          </State>
          <State label="② 장부 있음 · 복구 코드: 지켜 두었음 → [코드 복사하고 인터넷 앱으로 열기] (설정에서 열면 [‹ 설정])">
            <div className="catalog__frame catalog__frame--auto">
              <div className="app__main">
                <InAppBrowserScreen
                  kind="kakao-android"
                  move={{ by: 'code', code: CATALOG_CODE, keepNow: async () => true }}
                  onStay={noop}
                  back={{ label: '설정', onBack: noop }}
                />
              </div>
            </div>
          </State>
          <State label="② 장부 있음 · 복구 코드: 올리지 못함 (인터넷에 연결되면 다시)">
            <div className="catalog__frame catalog__frame--auto">
              <div className="app__main">
                <InAppBrowserScreen kind="kakao-android" move={{ by: 'code', code: CATALOG_CODE, keepNow: async () => false }} onStay={noop} />
              </div>
            </div>
          </State>
          <State label="② 장부 있음 · 자동으로 지키기를 쓸 수 없음: [기록 파일 보내기] → [인터넷 앱으로 열기]">
            <div className="catalog__frame catalog__frame--auto">
              <div className="app__main">
                <InAppBrowserScreen kind="kakao-android" move={{ by: 'file', sendFile: async () => true }} onStay={noop} />
              </div>
            </div>
          </State>
          <State label="아이폰 카톡 ① (주 버튼 없이 메뉴 그림만)">
            <div className="catalog__frame catalog__frame--auto">
              <div className="app__main">
                <InAppBrowserScreen kind="kakao-ios" onStay={noop} />
              </div>
            </div>
          </State>
          <State label="③ 인터넷 앱에서 열린 첫 화면(?from=kakao, 장부 없음) — 첫 실행 물음 위 카드">
            <InAppImportCard onImport={noop} />
          </State>
        </Section>

        <Section title="SlideGuide (넘겨 보는 안내 틀)">
          <State label="그림 한 장 + &quot;1 / 3&quot; 글 줄 + [이전]·[다음], 마지막 장은 끝 버튼 이름. 손으로만 넘긴다">
            <SlideGuide
              slides={[
                { picture: <HomeScreenPreview decorative />, text: '첫째 장 글 한 줄' },
                { picture: <div className="catalog__frame" />, text: '둘째 장 글 한 줄' },
                { picture: <div className="catalog__frame" />, text: '셋째 장은 끝 버튼이 [다 했어요]' },
              ]}
              finishLabel="다 했어요"
              onFinish={noop}
            />
          </State>
        </Section>

        <Section title="눌림">
          <p className="catalog__state">손가락이 닿은 동안의 모양을 고정해서 보여준다 (실제로는 :active)</p>
          <div className="catalog__stack" data-preview-pressed="">
            <div className="catalog__pair">
              <Button>저장</Button>
              <Button variant="secondary">기록 파일 보내기</Button>
            </div>
            <div className="catalog__pair">
              <Button variant="danger">지우기</Button>
              <Button variant="danger-text">이 기록 지우기</Button>
            </div>
            <div className="catalog__row">
              <IconButton icon="settings" onClick={noop}>
                설정
              </IconButton>
            </div>
            <MonthStepper month={9} onPrevious={noop} onNext={noop} />
          </div>
        </Section>

        <Section title="ConfirmDialog">
          <State label="기본">
            <div className="catalog__frame">
              <ConfirmDialog inline open title="예시 기록으로 되돌릴까요?" confirmLabel="되돌리기" onConfirm={noop} onCancel={noop} />
            </div>
          </State>
          <State label="위험">
            <div className="catalog__frame">
              <ConfirmDialog
                inline
                open
                danger
                title="이 기록을 정말 지울까요?"
                confirmLabel="지우기"
                onConfirm={noop}
                onCancel={noop}
              />
            </div>
          </State>
          <State label="버릴까요 + 설명 줄 (연달아 적기로 넣은 뒤 나갈 때, SPEC-001 v2.6)">
            <div className="catalog__frame">
              <ConfirmDialog
                inline
                open
                danger
                title="적던 내용을 버릴까요?"
                description="장부에 넣은 2건은 그대로 있어요"
                confirmLabel="버리기"
                onConfirm={noop}
                onCancel={noop}
              />
            </div>
          </State>
          <State label="장부 지우기 (설정 맨 아래, SPEC-005)">
            <div className="catalog__frame">
              <ConfirmDialog
                inline
                open
                danger
                title="‘우리집 가계부’ 장부와 기록을 모두 지울까요?"
                description="되돌릴 수 없어요"
                confirmLabel="지우기"
                onConfirm={noop}
                onCancel={noop}
              />
            </div>
          </State>
          <State label="설명 붙음 + 위험 (기록 파일 불러오기)">
            <div className="catalog__frame">
              <ConfirmDialog
                inline
                open
                danger
                title="장부 2개, 기록 128건으로 바꿀까요?"
                description="지금 기록은 불러온 기록으로 바뀌어요"
                confirmLabel="불러오기"
                onConfirm={noop}
                onCancel={noop}
              />
            </div>
          </State>
          <State label="자세한 내용 붙음 (복구 코드로 불러오기 확인, SPEC-006)">
            <div className="catalog__frame">
              <ConfirmDialog
                inline
                open
                danger
                title="보관본으로 바꿀까요?"
                description="이 폰에 있던 기록은 지워져요"
                confirmLabel="바꾸기"
                onConfirm={noop}
                onCancel={noop}
              >
                <KeptSummary
                  savedAt={new Date(2026, 9, 12, 15, 20).toISOString()}
                  bookCount={2}
                  bookNames={['한랑드림', '우리집 가계부']}
                  entryCount={128}
                />
              </ConfirmDialog>
            </div>
          </State>
          <State label="버튼 하나 알림 (cancelLabel=null)">
            <div className="catalog__frame">
              <ConfirmDialog
                inline
                open
                title="이 파일은 열 수 없어요"
                description="우리 장부에서 보낸 기록 파일인지 확인해 주세요"
                cancelLabel={null}
                onConfirm={noop}
                onCancel={noop}
              />
            </div>
          </State>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            확인 창 실제로 열어 보기
          </Button>
        </Section>

        <Section title="CoachMark (안내 말풍선, SPEC-008)">
          <State label="연습 말풍선이 아래 버튼을 가리킬 때 ([+ 내역 적기]: 말풍선 위, 꼬리 아래, [✕]·[알겠어요] 없이 연습 1 / 4)">
            <CoachMarkSample place="bottom" />
          </State>
          <State label="복구 코드 안내가 위쪽 버튼을 가리킬 때 (4번 [설정]: 말풍선 아래, 꼬리 위)">
            <CoachMarkSample place="top" />
          </State>
        </Section>

        <Section title="Toast">
          <State label="보이는 중">
            <div className="catalog__frame">
              <Toast message="저장했어요" onDone={noop} />
            </div>
          </State>
          <Button variant="secondary" onClick={() => setToast('저장했어요')}>
            알림 띄워 보기 (2초)
          </Button>
        </Section>

      </main>

      <ConfirmDialog
        open={dialogOpen}
        danger
        title="적던 내용을 버릴까요?"
        confirmLabel="버리기"
        onConfirm={() => {
          setDialogOpen(false)
          setToast('버렸어요')
        }}
        onCancel={() => setDialogOpen(false)}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
      <BottomSheet open={installGuideOpen} title="홈 화면에 추가하는 방법" onClose={() => setInstallGuideOpen(false)}>
        <InstallGuide browser="chrome" onFinish={() => setInstallGuideOpen(false)} />
      </BottomSheet>
      <BottomSheet open={sheetOpen} title="몇 월인가요?" onClose={() => setSheetOpen(false)}>
        <MonthPicker
          value={pickedMonth}
          currentMonth={10}
          onChange={(value) => {
            setPickedMonth(value)
            setSheetOpen(false)
          }}
        />
      </BottomSheet>
    </div>
  )
}

// 말풍선 견본: 틀 안에 가리키는 버튼 하나와 말풍선(inline). 뒤 화면 잠금·포커스 옮기기는 하지 않는다
function CoachMarkSample({ place }: { place: 'top' | 'bottom' }) {
  const targetRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="catalog__frame catalog__frame--coach">
      {place === 'top' ? (
        <div className="catalog__row catalog__coach-top">
          <IconButton ref={targetRef} icon="settings" onClick={noop}>
            설정
          </IconButton>
        </div>
      ) : (
        <BottomActionBar buttonRef={targetRef} icon="plus" label="내역 적기" onClick={noop} />
      )}
      {place === 'top' ? (
        <CoachMark inline open name="4" target={targetRef} message="폰을 바꿔도 기록이 돌아오게 복구 코드를 보내 두세요" onDismiss={noop} />
      ) : (
        <CoachMark inline open name="open-add" target={targetRef} message="회비 10,000원을 적어 볼게요. 여기를 눌러요" progress="연습 1 / 4" />
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="catalog__section">
      <h2 className="catalog__heading">{title}</h2>
      {children}
    </section>
  )
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="catalog__stack">
      <p className="catalog__state">{label}</p>
      {children}
    </div>
  )
}
