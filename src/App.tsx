import { useEffect, useState, type ReactNode } from 'react'
import { BackupDialogs } from './features/backup/BackupDialogs'
import { BACKUP_DOT_LABEL, BACKUP_REMINDER_MESSAGE, backupReminderFor } from './features/backup/backupReminder'
import { useBackup } from './features/backup/useBackup'
import { AddEntryForm } from './features/ledger/AddEntryForm'
import { EditEntryForm } from './features/ledger/EditEntryForm'
import { LedgerScreen } from './features/ledger/LedgerScreen'
import { StartLedgerScreen } from './features/ledger/StartLedgerScreen'
import { useLedger, type UseLedgerOptions } from './features/ledger/useLedger'
import { MonthSummaryScreen } from './features/report/MonthSummaryScreen'
import { YearSummaryScreen } from './features/report/YearSummaryScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { storageNotices, type StorageNoticeAction } from './features/storage/storageNotices'
import { useScreenHistory } from './features/useScreenHistory'
import type { EntryInput } from './domain/ledger'
import type { LedgerRepository, LoadResult } from './storage/LedgerRepository'
import { ConfirmDialog } from './ui/ConfirmDialog'
import type { IconName } from './ui/Icon'
import { IconButton } from './ui/IconButton'
import { NoticeBar } from './ui/NoticeBar'
import { Toast } from './ui/Toast'
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
  // 연달아 적기 (SPEC-001 v2.1): 이번에 내역 적기 화면에 들어와 저장한 내역. 장부로 돌아오면 비운다
  const [chainSaved, setChainSaved] = useState<EntryInput[]>([])
  // 백업 파일 보내기·불러오기 (SPEC-002). 불러오면 올해 장부의 처음 달로 돌아가 알린다
  const now = options?.now ?? (() => new Date())
  const backup = useBackup(ledger, {
    now,
    onRestored: () => {
      setViewedMonth(undefined)
      navigation.backToLedger()
      setToast('불러왔어요')
    },
    onSent: setToast,
  })

  const month = viewedMonth ?? ledger.firstMonth
  const today = now()
  // 이번 달·오늘 (달 선택 창 테두리·[오늘 7일] 칩). 지난 연도 장부에는 없다
  const isThisYear = ledger.year === today.getFullYear()
  const currentMonth = isThisYear ? today.getMonth() + 1 : undefined
  const currentDay = isThisYear ? today.getDate() : undefined
  const { screen } = navigation
  const lastChainSaved = chainSaved.at(-1)

  // 연달아 적은 뒤 장부로 돌아왔으면 마지막에 저장한 달을 보여 주고 "N건을 저장했어요" 를 알린다 (AC-21).
  // [다 적었어요]·[← 장부로]·뒤로 버튼(버릴까요 [버리기] 포함)이 모두 방문 기록을 되돌리는 같은 길이라, 화면이 바뀐 그리기에서 바로 맞춘다
  if (screen.name !== 'add-entry' && lastChainSaved !== undefined) {
    setChainSaved([])
    setViewedMonth(lastChainSaved.month)
    setToast(`${chainSaved.length}건을 저장했어요`)
  }
  // 고치는 기록. 다른 경로로 지워졌으면 undefined
  const editingEntry = screen.name === 'edit-entry' ? ledger.ledger?.entries.find((entry) => entry.id === screen.id) : undefined
  const editingEntryMissing = screen.name === 'edit-entry' && editingEntry === undefined

  // 고칠 기록이 없어졌으면(지운 직후 등) 장부로 돌아간다. 이미 돌아가는 중이면 backToLedger 가 한 번만 되돌린다
  useEffect(() => {
    if (editingEntryMissing) navigation.backToLedger()
  }, [editingEntryMissing, navigation])

  // 고치기·지우기 뒤 장부로: 그 기록의 달을 보여 주고, 기기에 저장했을 때만 알림을 띄운다 (실패면 위쪽 안내 띠만)
  function returnToLedger(saved: boolean, message: string, entryMonth: number) {
    if (saved) setToast(message)
    setViewedMonth(entryMonth)
    navigation.backToLedger()
  }

  // 저장 상태 안내는 어느 화면이든 맨 위에 (SPEC-002). 할 일이 있으면 백업 버튼을 붙인다
  const noticeActions: Record<StorageNoticeAction, { label: string; icon: IconName; onClick: () => void }> = {
    'import-backup': { label: '백업 파일 불러오기', icon: 'folder', onClick: backup.startImport },
    'send-backup': { label: '백업 파일 보내기', icon: 'share', onClick: backup.send },
  }
  const storageNoticeList = storageNotices(ledger.startup, ledger.saveFailure)
  const notices = storageNoticeList.map(({ message, action }) => (
    <NoticeBar key={message} message={message} action={action && noticeActions[action]} />
  ))
  const noticeOffersImport = storageNoticeList.some((notice) => notice.action === 'import-backup')
  // 30일 백업 안내 (SPEC-002): [설정] 점 표시는 늘, 장부·설정 위 띠는 저장 안내가 없을 때만 (띠는 하나만: 저장 > 백업)
  const needsBackup = backupReminderFor(ledger.data, now())
  const showBackupReminder = needsBackup && storageNoticeList.length === 0

  function screenContent(): ReactNode {
    if (ledger.isFirstRun) {
      // 새 폰으로 옮길 때는 장부를 시작하지 않고 백업 파일부터 불러온다 (안내 띠에 같은 버튼이 있으면 하나만)
      return (
        <>
          {!noticeOffersImport && (
            <div className="screen__top-end">
              <IconButton icon="folder" onClick={backup.startImport}>
                백업 불러오기
              </IconButton>
            </div>
          )}
          <StartLedgerScreen kind="first" year={ledger.year} defaults={ledger.newLedgerDefaults} onStart={ledger.startLedger} />
        </>
      )
    }

    switch (screen.name) {
      case 'settings':
        return (
          <SettingsScreen
            year={ledger.year}
            yearChoices={ledger.yearChoices}
            ledger={ledger.ledger}
            sheets={navigation}
            needsBackup={showBackupReminder}
            onChangeYear={(year) => {
              ledger.changeYear(year)
              setViewedMonth(undefined)
              navigation.backToLedger()
            }}
            lastBackupAt={ledger.data.settings.lastBackupAt}
            onSaveClubInfo={(info) => {
              // 저장에 실패하면 위쪽 안내 띠만 보이고 "바꿨어요" 는 띄우지 않는다
              if (ledger.updateClubInfo(info)) setToast('바꿨어요')
            }}
            onSendBackup={backup.send}
            onImportBackup={backup.startImport}
            onBack={navigation.backToLedger}
          />
        )
      case 'month-summary':
        // 월 정리는 장부가 있을 때 장부 화면에서만 열린다
        if (!ledger.ledger) return null
        return (
          <MonthSummaryScreen
            ledger={ledger.ledger}
            month={screen.month}
            onBack={navigation.backToLedger}
            onNotify={setToast}
          />
        )
      case 'year-summary':
        return (
          <YearSummaryScreen
            year={ledger.year}
            ledger={ledger.ledger}
            onBack={navigation.backToLedger}
            onNotify={setToast}
          />
        )
      case 'add-entry':
        return (
          <AddEntryForm
            // 저장할 때마다 처음 상태("며칠인가요?")로 다시 그린다. 달은 마지막에 저장한 달을 이어 쓰고 날·항목·금액은 비운다 (AC-19, AC-24)
            key={chainSaved.length}
            year={ledger.year}
            month={lastChainSaved?.month ?? screen.month}
            saved={chainSaved}
            currentMonth={currentMonth}
            currentDay={currentDay}
            frequentChoices={ledger.frequentChoices}
            lastUsedType={ledger.lastUsedType}
            sheets={navigation}
            onSave={(input) => {
              if (ledger.addEntry(input)) {
                setChainSaved([...chainSaved, input])
                return
              }
              // 기기에 저장하지 못했으면 지금처럼 장부로 돌아가 위쪽 실패 안내만 (그 전에 저장한 내역은 장부에 그대로)
              setChainSaved([])
              setViewedMonth(input.month)
              navigation.backToLedger()
            }}
            onBack={navigation.requestBack}
            onDirtyChange={navigation.confirmBeforeLeave}
          />
        )
      case 'edit-entry': {
        if (!editingEntry) return null
        const { id, month: entryMonth, day, type, name, amount } = editingEntry
        return (
          <EditEntryForm
            // 다른 기록을 고치러 오면 처음 값부터 다시
            key={id}
            year={ledger.year}
            initial={{ month: entryMonth, day, type, name, amount }}
            currentMonth={currentMonth}
            frequentChoices={ledger.frequentChoices}
            sheets={navigation}
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
            <IconButton
              icon="settings"
              onClick={() => navigation.open({ name: 'settings' })}
              dotLabel={needsBackup ? BACKUP_DOT_LABEL : undefined}
            >
              설정
            </IconButton>
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
    // 장부 위 띠: 저장 안내가 없을 때 30일 백업 안내 (SPEC-002). 홈 화면에 추가는 설정 맨 아래 줄로 권한다 (#56)
    return (
      <>
        {showBackupReminder && <NoticeBar message={BACKUP_REMINDER_MESSAGE} action={noticeActions['send-backup']} />}
        <LedgerScreen
          year={year}
          ledger={ledger.ledger}
          totals={totals}
          month={month}
          currentMonth={currentMonth}
          onChangeMonth={setViewedMonth}
          sheets={navigation}
          onOpenMonthSummary={(summaryMonth) => navigation.open({ name: 'month-summary', month: summaryMonth })}
          onOpenYearSummary={() => navigation.open({ name: 'year-summary' })}
          onOpenSettings={() => navigation.open({ name: 'settings' })}
          settingsNeedsBackup={needsBackup}
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
      <BackupDialogs backup={backup} />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
