import { useState, type ReactNode } from 'react'
import { BigActionButton } from '../ui/BigActionButton'
import { Button } from '../ui/Button'
import { ChoiceChip } from '../ui/ChoiceChip'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { MoneyInput } from '../ui/MoneyInput'
import { TabBar, type TabId } from '../ui/TabBar'
import { Toast } from '../ui/Toast'
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
  '--ink',
  '--muted',
  '--line',
  '--primary',
  '--on-accent',
  '--income',
  '--expense',
  '--warn-bg',
  '--scrim',
  '--pressed',
  '--primary-pressed',
  '--income-pressed',
  '--expense-pressed',
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
  const [tab, setTab] = useState<TabId>('ledger')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

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
                {token} 들어온 돈 140,000원
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

        <Section title="BigActionButton">
          <State label="돈 들어옴 / 돈 나감">
            <div className="catalog__pair">
              <BigActionButton kind="income" description="회비, 지원금" />
              <BigActionButton kind="expense" description="대관료, 간식비" />
            </div>
          </State>
          <State label="비활성">
            <div className="catalog__pair">
              <BigActionButton kind="income" description="회비, 지원금" disabled />
              <BigActionButton kind="expense" description="대관료, 간식비" disabled />
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
            <MoneyInput label="작년에서 넘어온 돈 (이월금)" value={0} onChange={noop} />
          </State>
          <State label="오류">
            <MoneyInput label="얼마인가요?" value={0} onChange={noop} error="얼마인지 적어주세요" />
          </State>
          <State label="비활성">
            <MoneyInput label="얼마인가요?" value={140000} onChange={noop} disabled />
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
            <div className="catalog__pair">
              <BigActionButton kind="income" description="회비, 지원금" />
              <BigActionButton kind="expense" description="대관료, 간식비" />
            </div>
            <div className="catalog__row">
              <ChoiceChip selected>간식비</ChoiceChip>
              <ChoiceChip selected={false}>대관료</ChoiceChip>
            </div>
            <div className="catalog__frame catalog__frame--short">
              <TabBar current="ledger" onChange={noop} />
            </div>
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

        <Section title="TabBar">
          <State label="지금 탭 · 눌러 보기">
            <div className="catalog__frame catalog__frame--short">
              <TabBar current={tab} onChange={setTab} />
            </div>
          </State>
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
