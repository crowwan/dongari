import type { ReactNode } from 'react'
import './ui.css'

export type TabId = 'ledger' | 'report' | 'settings'

// 아이콘은 꾸밈이고 이름은 항상 글자로 보여준다
const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  {
    id: 'ledger',
    label: '장부',
    icon: (
      <>
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
        <path d="M9 9h6M9 13h6" />
      </>
    ),
  },
  {
    id: 'report',
    label: '보고서',
    icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
  {
    id: 'settings',
    label: '설정',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </>
    ),
  },
]

type TabBarProps = {
  current: TabId
  onChange: (tab: TabId) => void
}

// 화면 아래 고정 탭: 장부 / 보고서 / 설정
export function TabBar({ current, onChange }: TabBarProps) {
  return (
    <nav className="ui-tabbar" aria-label="화면 바꾸기" data-testid="tab-bar">
      <div className="ui-tabbar__list" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="ui-tab"
            aria-selected={tab.id === current}
            data-testid={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
          >
            <svg
              className="ui-tab__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {tab.icon}
            </svg>
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
