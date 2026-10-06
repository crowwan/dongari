import { useState, type ReactNode } from 'react'
import { InstallBannerView } from '../features/install/InstallBanner'
import { CarryoverField } from '../features/ledger/CarryoverField'
import { AmountText } from '../ui/AmountText'
import { BalanceCard } from '../ui/BalanceCard'
import { BottomActionBar } from '../ui/BottomActionBar'
import { Button } from '../ui/Button'
import { ChoiceChip } from '../ui/ChoiceChip'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { MoneyInput } from '../ui/MoneyInput'
import { MonthStepper } from '../ui/MonthStepper'
import { NoticeBar } from '../ui/NoticeBar'
import { TextField } from '../ui/TextField'
import { Toast } from '../ui/Toast'
import { TopTextButton } from '../ui/TopTextButton'
import './catalog.css'

type ThemeChoice = 'system' | 'light' | 'dark'

const THEME_CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: '시스템' },
  { id: 'light', label: '라이트' },
  { id: 'dark', label: '다크' },
]

const COLOR_TOKENS = [
  '--bg',
  '--surface',
  '--fill',
  '--line',
  '--ink',
  '--muted',
  '--faint',
  '--primary',
  '--primary-soft',
  '--on-accent',
  '--income-amount',
  '--expense-amount',
  '--danger',
  '--on-danger',
  '--warn-bg',
  '--scrim',
  '--pressed',
  '--primary-pressed',
  '--primary-soft-pressed',
  '--danger-pressed',
]

const SIZE_TOKENS = ['--size-small', '--size-body', '--size-large', '--size-title', '--size-amount', '--size-balance']

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

const noop = () => {}

// 개발 모드 전용 디자인 카탈로그: 모든 기본 컴포넌트를 모든 상태로 한 화면에서 본다
export function Catalog() {
  const [theme, setTheme] = useState<ThemeChoice>('system')
  const [month, setMonth] = useState(3)
  const [item, setItem] = useState('간식비')
  const [amount, setAmount] = useState(28340)
  const [clubName, setClubName] = useState('한랑드림')
  const [carryover, setCarryover] = useState(370482)
  const [viewMonth, setViewMonth] = useState(9)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [installGuideOpen, setInstallGuideOpen] = useState(false)

  return (
    <div className="catalog" data-theme={theme === 'system' ? undefined : theme} data-testid="design-catalog">
      <main className="catalog__inner">
        <header className="catalog__section">
          <h1 className="catalog__title">디자인 카탈로그</h1>
          <p className="catalog__state">개발 모드 전용. 값은 src/styles/tokens.css, 의도는 docs/design.md.</p>
          <div className="catalog__row" role="group" aria-label="테마">
            {THEME_CHOICES.map((choice) => (
              <ChoiceChip key={choice.id} selected={theme === choice.id} onClick={() => setTheme(choice.id)}>
                {choice.label}
              </ChoiceChip>
            ))}
          </div>
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

        <Section title="글자 크기">
          <div className="catalog__sizes">
            {SIZE_TOKENS.map((token) => (
              <span key={token} style={{ fontSize: `var(${token})`, lineHeight: 'var(--line-tight)' }}>
                {token} 수입 140,000원
              </span>
            ))}
          </div>
        </Section>

        <Section title="Button">
          <State label="주 · 기본 / 비활성">
            <div className="catalog__pair">
              <Button>저장</Button>
              <Button disabled>저장</Button>
            </div>
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

        <Section title="ChoiceChip">
          <State label="월 선택 · 선택됨 / 안됨 (눌러 보기)">
            <div className="catalog__months">
              {MONTHS.map((value) => (
                <ChoiceChip key={value} selected={month === value} onClick={() => setMonth(value)}>
                  {value}월
                </ChoiceChip>
              ))}
            </div>
          </State>
          <State label="항목 선택 · 마지막은 비활성">
            <div className="catalog__row">
              {['대관료', '간식비', '꽃다발'].map((name) => (
                <ChoiceChip key={name} selected={item === name} onClick={() => setItem(name)}>
                  {name}
                </ChoiceChip>
              ))}
              <ChoiceChip selected={false} disabled>
                행사비
              </ChoiceChip>
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
        </Section>

        <Section title="TopTextButton">
          <State label="위쪽 글자 버튼 두 개">
            <div className="catalog__top">
              <TopTextButton onClick={noop}>올해 결산</TopTextButton>
              <TopTextButton onClick={noop}>설정</TopTextButton>
            </div>
          </State>
        </Section>

        <Section title="BottomActionBar">
          <State label="기본 / 비활성">
            <div className="catalog__frame catalog__frame--short">
              <BottomActionBar label="+ 내역 적기" onClick={noop} />
            </div>
            <div className="catalog__frame catalog__frame--short">
              <BottomActionBar label="사진으로 보내기" onClick={noop} disabled />
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
          <State label="버튼 눌림">
            <div data-preview-pressed="">
              <NoticeBar
                message="저장된 기록을 읽지 못했어요. 지금 적는 내용은 저장되지 않아요"
                action={{ label: '백업 파일 불러오기', onClick: noop }}
              />
            </div>
          </State>
        </Section>

        <Section title="InstallBanner (설치 안내 띠)">
          <State label="기본 · [방법 보기] (눌러 보기)">
            <InstallBannerView
              canInstall={false}
              guideOpen={installGuideOpen}
              browser="samsung"
              onToggleGuide={() => setInstallGuideOpen((open) => !open)}
              onInstall={noop}
              onDismiss={noop}
            />
          </State>
          <State label="방법 펼침 · 브라우저를 모를 때 (삼성 인터넷 + 크롬)">
            <InstallBannerView canInstall={false} guideOpen browser="other" onToggleGuide={noop} onInstall={noop} onDismiss={noop} />
          </State>
          <State label="브라우저가 설치를 제안할 때 · [홈 화면에 추가]">
            <InstallBannerView canInstall guideOpen={false} browser="chrome" onToggleGuide={noop} onInstall={noop} onDismiss={noop} />
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
              <ChoiceChip selected>간식비</ChoiceChip>
              <ChoiceChip selected={false}>대관료</ChoiceChip>
              <TopTextButton onClick={noop}>설정</TopTextButton>
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
