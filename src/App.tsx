import { useState } from 'react'
import { LedgerScreen } from './features/ledger/LedgerScreen'
import { StartLedgerScreen } from './features/ledger/StartLedgerScreen'
import { useLedger, type UseLedgerOptions } from './features/ledger/useLedger'
import { ReportScreen } from './features/report/ReportScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { storageNotices } from './features/storage/storageNotices'
import type { LedgerRepository, LoadResult } from './storage/LedgerRepository'
import { NoticeBar } from './ui/NoticeBar'
import { Toast } from './ui/Toast'
import './features/screens.css'

// 임시 화면 이동 (#26 에서 탭 없는 한 달 보기로 교체 — ADR 003)
type TabId = 'ledger' | 'report' | 'settings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'ledger', label: '장부' },
  { id: 'report', label: '보고서' },
  { id: 'settings', label: '설정' },
]

type AppProps = {
  repository: LedgerRepository
  // 진입점이 앱 시작 때 한 번 읽은 결과
  loaded: LoadResult
  options?: UseLedgerOptions
}

// 앱 뼈대 (SPEC-001 화면 구성): 아래 탭 3개(장부·보고서·설정). 장부가 하나도 없으면 탭 없이 시작 화면만
export default function App({ repository, loaded, options }: AppProps) {
  const ledger = useLedger(repository, loaded, options)
  const [tab, setTab] = useState<TabId>('ledger')
  const [toast, setToast] = useState<string | null>(null)

  // 저장 상태 안내는 어느 화면이든 맨 위에 (SPEC-002)
  const notices = storageNotices(ledger.startup, ledger.saveFailure).map((message) => (
    <NoticeBar key={message} message={message} />
  ))

  if (ledger.isFirstRun) {
    return (
      <div className="app">
        <main className="app__main" data-tabs="none">
          {notices}
          <StartLedgerScreen kind="first" year={ledger.year} defaults={ledger.newLedgerDefaults} onStart={ledger.startLedger} />
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <main className="app__main">
        {notices}
        {tab === 'ledger' &&
          (ledger.ledger && ledger.totals ? (
            // 입력 화면(#13)은 onAddEntry, 수정 화면(#14)은 onEditEntry 로 여기에 연결한다
            <LedgerScreen year={ledger.year} ledger={ledger.ledger} totals={ledger.totals} />
          ) : (
            // 연도를 바꿀 때마다 그 해 기본값으로 입력칸을 새로 채운다
            <StartLedgerScreen
              key={ledger.year}
              kind="new-year"
              year={ledger.year}
              defaults={ledger.newLedgerDefaults}
              onStart={ledger.startLedger}
            />
          ))}
        {tab === 'report' && <ReportScreen />}
        {tab === 'settings' && (
          <SettingsScreen
            year={ledger.year}
            yearChoices={ledger.yearChoices}
            ledger={ledger.ledger}
            onChangeYear={ledger.changeYear}
            onSaveClubInfo={(info) => {
              ledger.updateClubInfo(info)
              setToast('바꿨어요')
            }}
          />
        )}
      </main>
      <TemporaryNav current={tab} onChange={setTab} />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}

// TabBar(ADR 003 으로 제거)를 대신하는 임시 글자 버튼 줄. 화면 배치는 #26 에서 바꾼다
function TemporaryNav({ current, onChange }: { current: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="app__nav" aria-label="화면 바꾸기" data-testid="tab-bar">
      <div className="app__nav-list">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="app__nav-button"
            aria-current={item.id === current ? 'page' : undefined}
            data-testid={`tab-${item.id}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
