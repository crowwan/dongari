import { useEffect, useState, type ReactNode } from 'react'
import { InstallBanner } from './features/install/InstallBanner'
import { EntryForm } from './features/ledger/EntryForm'
import { emptyDraft } from './features/ledger/entryDraft'
import { LedgerScreen } from './features/ledger/LedgerScreen'
import { StartLedgerScreen } from './features/ledger/StartLedgerScreen'
import { useLedger, type UseLedgerOptions } from './features/ledger/useLedger'
import { MonthSummaryScreen } from './features/report/MonthSummaryScreen'
import { YearSummaryScreen } from './features/report/YearSummaryScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { storageNotices } from './features/storage/storageNotices'
import { useScreenHistory } from './features/useScreenHistory'
import type { LedgerRepository, LoadResult } from './storage/LedgerRepository'
import { ConfirmDialog } from './ui/ConfirmDialog'
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

// 앱 뼈대 (SPEC-001 화면 구성, 탭 없음): 장부(첫 화면) / 내역 적기·고치기 / 설정 / 월 정리 / 올해 결산. 장부가 하나도 없으면 시작 화면만
export default function App({ repository, loaded, options }: AppProps) {
  const ledger = useLedger(repository, loaded, options)
  const navigation = useScreenHistory()
  // 장부 화면에서 넘겨 본 달. 다른 화면에 다녀와도 그대로이고, 연도를 바꾸면 비워서 그 해의 처음 달(올해면 이번 달, 지난 연도면 12월)로
  const [viewedMonth, setViewedMonth] = useState<number | undefined>()
  const [toast, setToast] = useState<string | null>(null)

  const month = viewedMonth ?? ledger.firstMonth
  const { screen } = navigation
  // 고치는 기록. 다른 경로로 지워졌으면 undefined
  const editingEntry = screen.name === 'edit-entry' ? ledger.ledger?.entries.find((entry) => entry.id === screen.id) : undefined
  const editingEntryMissing = screen.name === 'edit-entry' && editingEntry === undefined

  // 고칠 기록이 없어졌으면(지운 직후 등) 장부로 돌아간다. 이미 돌아가는 중이면 backToLedger 가 한 번만 되돌린다
  useEffect(() => {
    if (editingEntryMissing) navigation.backToLedger()
  }, [editingEntryMissing, navigation])

  // 저장·지우기 뒤 장부로: 그 기록의 달을 보여 주고, 기기에 저장했을 때만 알림을 띄운다 (실패면 위쪽 안내 띠만)
  function returnToLedger(saved: boolean, message: string, entryMonth: number) {
    if (saved) setToast(message)
    setViewedMonth(entryMonth)
    navigation.backToLedger()
  }

  // 저장 상태 안내는 어느 화면이든 맨 위에 (SPEC-002)
  const notices = storageNotices(ledger.startup, ledger.saveFailure).map((message) => (
    <NoticeBar key={message} message={message} />
  ))

  function screenContent(): ReactNode {
    if (ledger.isFirstRun) {
      return <StartLedgerScreen kind="first" year={ledger.year} defaults={ledger.newLedgerDefaults} onStart={ledger.startLedger} />
    }

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
      case 'add-entry':
        return (
          <EntryForm
            title="내역 적기"
            initial={emptyDraft(screen.month)}
            frequentChoices={ledger.frequentChoices}
            onSave={(input) => returnToLedger(ledger.addEntry(input), '저장했어요', input.month)}
            onBack={navigation.requestBack}
            onDirtyChange={navigation.confirmBeforeLeave}
          />
        )
      case 'edit-entry': {
        if (!editingEntry) return null
        const { id, month: entryMonth, type, name, amount } = editingEntry
        return (
          <EntryForm
            // 다른 기록을 고치러 오면 처음 값부터 다시
            key={id}
            title="내역 고치기"
            initial={{ month: entryMonth, type, name, amount }}
            frequentChoices={ledger.frequentChoices}
            onSave={(input) => returnToLedger(ledger.updateEntry(id, input), '고쳤어요', input.month)}
            onBack={navigation.requestBack}
            onDirtyChange={navigation.confirmBeforeLeave}
            onDelete={() => returnToLedger(ledger.deleteEntry(id), '지웠어요', entryMonth)}
          />
        )
      }
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
    // 홈 화면에 추가하지 않고 열었으면 장부 위에 설치 안내 띠 (SPEC-002)
    return (
      <>
        <InstallBanner />
        <LedgerScreen
          year={year}
          ledger={ledger.ledger}
          totals={totals}
          month={month}
          onChangeMonth={setViewedMonth}
          onOpenMonthSummary={(summaryMonth) => navigation.open({ name: 'month-summary', month: summaryMonth })}
          onOpenYearSummary={() => navigation.open({ name: 'year-summary' })}
          onOpenSettings={() => navigation.open({ name: 'settings' })}
          onAddEntry={(entryMonth) => navigation.open({ name: 'add-entry', month: entryMonth })}
          onEditEntry={(id) => navigation.open({ name: 'edit-entry', id })}
        />
      </>
    )
  }

  return (
    <div className="app">
      <main className="app__main">
        {notices}
        {screenContent()}
      </main>
      {/* 내역 적기·고치기에서 적던 내용이 있을 때 [← 장부로]·뒤로 버튼을 누르면 묻는다 */}
      <ConfirmDialog
        open={navigation.confirmingLeave}
        title="적던 내용을 버릴까요?"
        confirmLabel="버리기"
        danger
        onConfirm={navigation.confirmLeave}
        onCancel={navigation.cancelLeave}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
