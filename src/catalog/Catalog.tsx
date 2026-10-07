import { useState, type ReactNode } from 'react'
import { itemIcon } from '../domain/itemIcon'
import type { EntryType } from '../domain/types'
import { InstallGuide } from '../features/install/InstallGuide'
import { CarryoverField } from '../features/ledger/CarryoverField'
import { AmountDisplay } from '../ui/AmountDisplay'
import { AmountText } from '../ui/AmountText'
import { AnswersCard } from '../ui/AnswersCard'
import { BalanceCard } from '../ui/BalanceCard'
import { BottomActionBar } from '../ui/BottomActionBar'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { ListRow } from '../ui/ListRow'
import { MoneyInput } from '../ui/MoneyInput'
import { MonthPicker } from '../ui/MonthPicker'
import { MonthStepper } from '../ui/MonthStepper'
import { NoticeBar } from '../ui/NoticeBar'
import { OptionList, type Option } from '../ui/OptionList'
import { PickRow } from '../ui/PickRow'
import { SegmentedControl, type SegmentOptions } from '../ui/SegmentedControl'
import { TextField } from '../ui/TextField'
import { Toast } from '../ui/Toast'
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
  '--accent-ink',
  '--income-amount',
  '--expense-amount',
  '--danger',
  '--on-danger',
  '--warn-bg',
  '--scrim',
  '--knob',
  '--pressed',
  '--primary-pressed',
  '--primary-soft-pressed',
  '--danger-pressed',
]

// 자리 크기 (개편 2·3·4 에서 역할 토큰으로 옮긴 뒤 지운다)
const SIZE_TOKENS = ['--size-small', '--size-body', '--size-large', '--size-amount']

// 글자 역할 (docs/design.md 타이포 위계): 큰 숫자·화면 제목 > 질문·카드 제목 > 줄 이름·보조 이름·본문 > 보조 설명
const TEXT_ROLES: { role: string; sample: string; muted?: boolean }[] = [
  { role: 'display', sample: '1,166,193원' },
  { role: 'title', sample: '내역 적기' },
  { role: 'heading', sample: '몇 월인가요?' },
  { role: 'row', sample: '대관료' },
  { role: 'label', sample: '직접 적기', muted: true },
  { role: 'body', sample: '회비 140,000원' },
  { role: 'caption', sample: '모르면 0으로 두세요', muted: true },
]

// 항목 아이콘 (SPEC-001 AC-18): 이름 → itemIcon() → 아이콘
const ITEM_NAMES = ['회비', '대관료', '간식비', '행사지원금', '예금 이자', '꽃값', '행사비']

// 화면 동작 아이콘 (아이콘 옆에는 늘 글자)
const ACTION_ICONS: { icon: IconName; label: string }[] = [
  { icon: 'income', label: '수입' },
  { icon: 'expense', label: '지출' },
  { icon: 'calendar', label: '달' },
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
]

const ENTRY_TYPES: SegmentOptions<EntryType> = [
  { value: 'income', label: '수입', icon: 'income' },
  { value: 'expense', label: '지출', icon: 'expense' },
]

// 여백 역할: 묶음 안(좁게) < 묶음 사이(넓게) < 큰 구획
const SPACE_ROLES = ['--stack-tight', '--stack', '--group-gap', '--section-gap']

const noop = () => {}

// 개발 모드 전용 디자인 카탈로그: 모든 기본 컴포넌트를 모든 상태로 한 화면에서 본다
export function Catalog() {
  const [theme, setTheme] = useState<ThemeChoice>('system')
  const [amount, setAmount] = useState(28340)
  const [clubName, setClubName] = useState('한랑드림')
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
          <State label="누르는 줄 (눌러 보기) · 보조 줄 없음 · 긴 이름">
            <div className="catalog__card">
              <ListRow
                icon={itemIcon('행사비')}
                title="행사비"
                onClick={noop}
                end={<AmountText type="expense" amount={1200000} />}
              />
              <ListRow
                icon={itemIcon('꽃값')}
                title="스승의 날 선생님 꽃다발과 카드 값"
                description="5월 · 지출"
                onClick={noop}
                end={<AmountText type="expense" amount={58000} />}
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
        </Section>

        <Section title="SegmentedControl">
          <State label={`둘 중 하나 (눌러 보기) · ${entryType === 'income' ? '수입' : entryType === 'expense' ? '지출' : '안 고름'}`}>
            <SegmentedControl label="수입인가요, 지출인가요?" options={ENTRY_TYPES} value={entryType} onChange={setEntryType} />
          </State>
          <State label="아직 안 고름">
            <SegmentedControl label="수입인가요, 지출인가요?" options={ENTRY_TYPES} value={null} onChange={noop} />
          </State>
        </Section>

        <Section title="PickRow">
          <State label="정해진 값 + 바꾸기 (누르면 열두 달 선택 창)">
            <PickRow icon="calendar" value={`${pickedMonth}월`} onClick={() => setSheetOpen(true)} />
          </State>
          <State label="아이콘 없음 · 눌림">
            <div data-preview-pressed="">
              <PickRow value="2026년" onClick={noop} />
            </div>
          </State>
        </Section>

        <Section title="MonthPicker">
          <State label={`고른 달 칠함 · 이번 달(10월) 테두리 (눌러 보기) · ${pickedMonth}월`}>
            <div className="catalog__card catalog__card--pad">
              <MonthPicker value={pickedMonth} currentMonth={10} onChange={setPickedMonth} />
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
          <State label="선택 창 안: 회색 면 + 흰 원 · 고른 줄 옅은 청록 + 체크 (설정 장부 연도)">
            <div className="catalog__frame catalog__frame--sheet">
              <BottomSheet open title="어느 해 장부를 볼까요?" onClose={noop}>
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

        <Section title="BottomSheet">
          <State label="아래에서 올라오는 선택 창 + MonthPicker (바깥 누르기·Esc 로 닫힘)">
            <div className="catalog__frame catalog__frame--sheet">
              <BottomSheet open title="몇 월인가요?" onClose={noop}>
                <MonthPicker value={9} currentMonth={10} onChange={noop} />
              </BottomSheet>
            </div>
          </State>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            선택 창 실제로 열어 보기
          </Button>
        </Section>

        <Section title="AnswersCard (적은 내용 카드)">
          <State label="하나씩 채우기 · 금액 단계: 달 줄 + 항목 줄 (이름 · 수입/지출) — [달 바꾸기] 눌러 보기">
            <AnswersCard
              rows={[
                { label: '달', icon: 'calendar', value: `${answerMonth}월`, onChange: () => setAnswerMonth((month) => (month % 12) + 1) },
                { label: '항목', icon: itemIcon('대관료'), value: '대관료 · 지출', onChange: noop },
              ]}
            />
          </State>
          <State label="항목 단계: 달 줄만">
            <AnswersCard rows={[{ label: '달', icon: 'calendar', value: '10월', onChange: noop }]} />
          </State>
          <State label="새 이름의 수입/지출을 묻는 동안: 항목 줄은 이름만 · 긴 이름">
            <AnswersCard
              rows={[
                { label: '달', icon: 'calendar', value: '5월', onChange: noop },
                { label: '항목', icon: itemIcon('꽃값'), value: '스승의 날 선생님 꽃다발과 카드 값', onChange: noop },
              ]}
            />
          </State>
          <State label="[바꾸기] 눌림">
            <div data-preview-pressed="">
              <AnswersCard rows={[{ label: '달', icon: 'calendar', value: '10월', onChange: noop }]} />
            </div>
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
          <State label="면 없는 글자 버튼 (위쪽 [결산] [설정] + 점 표시)">
            <div className="catalog__top">
              <IconButton icon="chart" onClick={noop}>
                결산
              </IconButton>
              <IconButton icon="settings" dotLabel="백업 필요" onClick={noop}>
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
          <State label="회색 면 (카드 안 [10월 정리 보기]) · 기본 / 눌림">
            <IconButton icon="receipt" variant="fill" onClick={noop}>
              10월 정리 보기
            </IconButton>
            <div data-preview-pressed="">
              <IconButton icon="receipt" variant="fill" onClick={noop}>
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
              <Button variant="secondary">백업 파일 보내기</Button>
              <Button variant="secondary" disabled>
                백업 파일 보내기
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
          <State label="입력 (눌러 보기)">
            <MoneyInput label="얼마인가요?" value={amount} onChange={setAmount} />
          </State>
          <State label="빈칸">
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
            <TextField label="동아리 이름" value={clubName} placeholder="예: 한랑드림" onChange={setClubName} />
          </State>
          <State label="빈칸">
            <TextField label="동아리 이름" value="" placeholder="예: 한랑드림" onChange={noop} />
          </State>
          <State label="오류">
            <TextField label="동아리 이름" value="" onChange={noop} error="동아리 이름을 적어주세요" />
          </State>
          <State label="비활성">
            <TextField label="동아리 이름" value="한랑드림" onChange={noop} disabled />
          </State>
          <State label="보조 이름 (labelRole=label, 내역 적기 직접 적기)">
            <TextField label="직접 적기" labelRole="label" value="" placeholder="예: 꽃값" onChange={noop} />
          </State>
        </Section>

        <Section title="CarryoverField">
          <State label={`남았어요 / 적자였어요 (눌러 보기) · 이월금 ${carryover.toLocaleString('ko-KR')}`}>
            <CarryoverField value={carryover} onChange={setCarryover} />
          </State>
          <State label="적자 (음수 이월금)">
            <CarryoverField value={-50000} onChange={noop} />
          </State>
        </Section>

        <Section title="BalanceCard">
          <State label="잔액 + 보조 줄">
            <BalanceCard label="지금 잔액" amount={1166193} note="작년 이월금 370,482원 포함" />
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

        <Section title="BottomActionBar">
          <State label="기본 / 비활성">
            <div className="catalog__frame catalog__frame--short">
              <BottomActionBar icon="plus" label="내역 적기" onClick={noop} />
            </div>
            <div className="catalog__frame catalog__frame--short">
              <BottomActionBar label="사진으로 저장" onClick={noop} disabled />
            </div>
          </State>
          <State label="비활성 + 안내 (누를 수 없는 이유, 내역 적기 [저장])">
            <div className="catalog__frame catalog__frame--note">
              <BottomActionBar label="저장" onClick={noop} disabled note="수입인지 지출인지 골라 주세요" />
            </div>
          </State>
        </Section>

        <Section title="NoticeBar">
          <State label="저장 실패">
            <NoticeBar message="저장하지 못했어요. 백업 파일을 보내 두세요" />
          </State>
          <State label="긴 문장 (시작 안내)">
            <NoticeBar message="저장된 기록을 읽지 못해 새 장부로 시작해요. 예전 기록은 따로 보관해 두었어요" />
          </State>
          <State label="버튼 붙음 (저장 실패 → 백업 파일 보내기)">
            <NoticeBar message="저장하지 못했어요. 백업 파일을 보내 두세요" action={{ label: '백업 파일 보내기', onClick: noop }} />
          </State>
          <State label="30일 백업 안내 → 백업 파일 보내기 (#9)">
            <NoticeBar message="한 달 넘게 백업하지 않았어요" action={{ label: '백업 파일 보내기', icon: 'share', onClick: noop }} />
          </State>
          <State label="버튼 눌림">
            <div data-preview-pressed="">
              <NoticeBar
                message="저장된 기록을 읽지 못했어요. 지금 적는 내용은 저장되지 않아요"
                action={{ label: '백업 파일 불러오기', onClick: noop }}
              />
            </div>
          </State>
        </Section>

        <Section title="InstallGuide (홈 화면에 추가 방법 안내)">
          <State label="설정 [홈 화면에 추가] 줄 (설치 제안이 없으면 누를 때 아래 안내 창)">
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
          <State label="방법 안내 선택 창 · 삼성 인터넷">
            <div className="catalog__frame catalog__frame--sheet">
              <BottomSheet open title="홈 화면에 추가하는 방법" onClose={noop}>
                <InstallGuide browser="samsung" />
                <Button onClick={noop}>확인</Button>
              </BottomSheet>
            </div>
          </State>
          <State label="브라우저를 모를 때 (삼성 인터넷 + 크롬)">
            <InstallGuide browser="other" />
          </State>
        </Section>

        <Section title="눌림">
          <p className="catalog__state">손가락이 닿은 동안의 모양을 고정해서 보여준다 (실제로는 :active)</p>
          <div className="catalog__stack" data-preview-pressed="">
            <div className="catalog__pair">
              <Button>저장</Button>
              <Button variant="secondary">백업 파일 보내기</Button>
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
              <ConfirmDialog open title="예시 기록으로 되돌릴까요?" confirmLabel="되돌리기" onConfirm={noop} onCancel={noop} />
            </div>
          </State>
          <State label="위험">
            <div className="catalog__frame">
              <ConfirmDialog
                open
                danger
                title="이 기록을 정말 지울까요?"
                confirmLabel="지우기"
                onConfirm={noop}
                onCancel={noop}
              />
            </div>
          </State>
          <State label="설명 붙음 + 위험 (백업 불러오기)">
            <div className="catalog__frame">
              <ConfirmDialog
                open
                danger
                title="2026년 장부(기록 12건)를 불러올까요?"
                description="지금 기록은 불러온 기록으로 바뀌어요"
                confirmLabel="불러오기"
                onConfirm={noop}
                onCancel={noop}
              />
            </div>
          </State>
          <State label="버튼 하나 알림 (cancelLabel=null)">
            <div className="catalog__frame">
              <ConfirmDialog
                open
                title="이 파일은 열 수 없어요"
                description="동아리 회계에서 보낸 백업 파일인지 확인해 주세요"
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
        <InstallGuide browser="chrome" />
        <Button onClick={() => setInstallGuideOpen(false)}>확인</Button>
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
