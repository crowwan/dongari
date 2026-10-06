import { useState, type ReactNode } from 'react'
import { LedgerScreen } from './features/ledger/LedgerScreen'
import { StartLedgerScreen } from './features/ledger/StartLedgerScreen'
import { useLedger, type UseLedgerOptions } from './features/ledger/useLedger'
import { MonthSummaryScreen } from './features/report/MonthSummaryScreen'
import { YearSummaryScreen } from './features/report/YearSummaryScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { storageNotices } from './features/storage/storageNotices'
import { useScreenHistory } from './features/useScreenHistory'
import type { LedgerRepository, LoadResult } from './storage/LedgerRepository'
import { NoticeBar } from './ui/NoticeBar'
import { Toast } from './ui/Toast'
import { TopTextButton } from './ui/TopTextButton'
import './features/screens.css'

type AppProps = {
  repository: LedgerRepository
  // 진입점이 앱 시작 때 한 번 읽은 결과
  loaded: LoadResult
  options?: UseLedgerOptions
}

// 앱 뼈대 (SPEC-001 화면 구성, 탭 없음): 장부(첫 화면) / 설정 / 월 정리 / 올해 결산. 장부가 하나도 없으면 시작 화면만
export default function App({ repository, loaded, options }: AppProps) {
  const ledger = useLedger(repository, loaded, options)
  const navigation = useScreenHistory()
  // 장부 화면에서 넘겨 본 달. 다른 화면에 다녀와도 그대로이고, 연도를 바꾸면 비워서 그 해의 처음 달(올해면 이번 달, 지난 연도면 12월)로
  const [viewedMonth, setViewedMonth] = useState<number | undefined>()
  const [toast, setToast] = useState<string | null>(null)

  const month = viewedMonth ?? ledger.firstMonth

  // 저장 상태 안내는 어느 화면이든 맨 위에 (SPEC-002)
  const notices = storageNotices(ledger.startup, ledger.saveFailure).map((message) => (
    <NoticeBar key={message} message={message} />
  ))

  function screenContent(): ReactNode {
    if (ledger.isFirstRun) {
      return <StartLedgerScreen kind="first" year={ledger.year} defaults={ledger.newLedgerDefaults} onStart={ledger.startLedger} />
    }

    const { screen } = navigation
    switch (screen.name) {
      case 'settings':
        return (
          <SettingsScreen
            year={ledger.year}
            yearChoices={ledger.yearChoices}
            ledger={ledger.ledger}
            onChangeYear={(year) => {
              ledger.changeYear(year)
              setViewedMonth(undefined)
              navigation.backToLedger()
            }}
            onSaveClubInfo={(info) => {
              // 저장에 실패하면 위쪽 안내 띠만 보이고 "바꿨어요" 는 띄우지 않는다
              if (ledger.updateClubInfo(info)) setToast('바꿨어요')
            }}
            onBack={navigation.backToLedger}
          />
        )
      case 'month-summary':
        return <MonthSummaryScreen year={ledger.year} month={screen.month} onBack={navigation.backToLedger} />
      case 'year-summary':
        return <YearSummaryScreen year={ledger.year} onBack={navigation.backToLedger} />
      case 'ledger':
        return ledgerScreen()
    }
  }

  function ledgerScreen(): ReactNode {
    const { year, totals } = ledger
    if (!ledger.ledger || !totals) {
      // 고른 연도 장부가 아직 없다. 연도를 바꿀 때마다 그 해 기본값으로 입력칸을 새로 채우고, 위쪽 [설정] 으로 지난 장부를 고를 수 있다
      return (
        <>
          <div className="screen__top-end">
            <TopTextButton onClick={() => navigation.open({ name: 'settings' })}>설정</TopTextButton>
          </div>
          <StartLedgerScreen
            key={year}
            kind="new-year"
            year={year}
            defaults={ledger.newLedgerDefaults}
            onStart={ledger.startLedger}
          />
        </>
      )
    }
    return (
      // 입력 화면(#13)은 onAddEntry, 고치기 화면(#14)은 onEditEntry 로 여기에 연결한다
      <LedgerScreen
        year={year}
        ledger={ledger.ledger}
        totals={totals}
        month={month}
        onChangeMonth={setViewedMonth}
        onOpenMonthSummary={(summaryMonth) => navigation.open({ name: 'month-summary', month: summaryMonth })}
        onOpenYearSummary={() => navigation.open({ name: 'year-summary' })}
        onOpenSettings={() => navigation.open({ name: 'settings' })}
      />
    )
  }

  return (
    <div className="app">
      <main className="app__main">
        {notices}
        {screenContent()}
      </main>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
