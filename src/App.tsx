import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BackupDialogs } from './features/backup/BackupDialogs'
import { BACKUP_DOT_LABEL, BACKUP_REMINDER_MESSAGE, backupReminderFor } from './features/backup/backupReminder'
import { useBackup } from './features/backup/useBackup'
import { NewBookScreen } from './features/books/NewBookScreen'
import { FirstUseGuideMark } from './features/guide/FirstUseGuideMark'
import type { GuideStore } from './features/guide/guideStore'
import { useFirstUseGuide } from './features/guide/useFirstUseGuide'
import type { InAppBrowser } from './features/install/inAppBrowser'
import { InAppBrowserScreen, type LedgerMove } from './features/install/InAppBrowserScreen'
import { useInstallAction } from './features/install/installAction'
import { InstallGuideSheet } from './features/install/InstallGuideSheet'
import { showsInstallOffer, type InstallOfferStore } from './features/install/installOffer'
import { InstallOfferCard } from './features/install/InstallOfferCard'
import { browserInstallEnvironment, type InstallEnvironment } from './features/install/installPrompt'
import type { KeepState } from './features/keep/AutoKeeper'
import { KeepRestoreScreen } from './features/keep/KeepRestoreScreen'
import { KEEP_REMINDER_MESSAGE, keepStatusText, needsKeepReminder } from './features/keep/keepStatus'
import { recoveryCodeOf } from './features/keep/recoveryCode'
import { shareRecoveryCode, type ShareCodeResult } from './features/keep/shareCode'
import type { Keep } from './features/keep/startKeep'
import { AddEntryForm } from './features/ledger/AddEntryForm'
import { EditEntryForm } from './features/ledger/EditEntryForm'
import { LedgerScreen } from './features/ledger/LedgerScreen'
import type { StepState } from './features/ledger/entrySteps'
import { StartLedgerScreen } from './features/ledger/StartLedgerScreen'
import { useLedger, type LedgerState, type UseLedgerOptions } from './features/ledger/useLedger'
import { PRACTICE_STOP_DIALOG, type PracticeSlot } from './features/practice/practiceSlot'
import type { PracticeView } from './features/practice/practiceSteps'
import { MonthSummaryScreen } from './features/report/MonthSummaryScreen'
import { pictureSaver, type PictureSaver } from './features/report/savePicture'
import { YearSummaryScreen } from './features/report/YearSummaryScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { storageNotices, type StorageNoticeAction } from './features/storage/storageNotices'
import { useScreenHeading } from './features/useScreenHeading'
import { useScreenHistory } from './features/useScreenHistory'
import { totalEntryCount } from './domain/book'
import type { BookSetup, EntryInput } from './domain/ledger'
import type { BookKind, StoredData } from './domain/types'
import type { LedgerRepository, LoadResult } from './storage/LedgerRepository'
import { requestPersistentStorage } from './storage/persist'
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
  // 복구 코드 자동 보관 (SPEC-006). 없으면 서버 주소가 정해지기 전 빌드 — 설정에 "준비 중", 복구 코드로 불러오기 없음
  keep?: Keep
  // 복구 코드 안내 말풍선 상태 (SPEC-008, 이 폰에만). 없으면 안내를 하지 않는다
  guideStore?: GuideStore
  // 월 정리·올해 결산 사진 만들기·공유 창 (테스트는 가짜를 넣는다)
  saver?: PictureSaver
  // 연습 장부로 그릴 때 (SPEC-008): 연습 띠·단계 말풍선을 얹고, 뒤로 버튼은 그만할까요를 묻는다
  practice?: PracticeSlot
  // 설정 [연습해 보기] (SPEC-008): 지금 장부 종류와 연습이 끝나면 돌아올 진짜 장부 데이터
  onStartPractice?: (kind: BookKind, back: LoadResult) => void
  // 장부가 하나도 없는 첫 실행 화면인지 (첫 실행 새 장부 만들기에서 뒤로 버튼은 첫 실행 물음으로, SPEC-008)
  onFirstRunChange?: (firstRun: boolean) => void
  // 첫 장부 뒤 홈 화면에 추가 권하기 상태 (SPEC-002 #135, 이 폰에만). 없으면 권하지 않는다
  installOfferStore?: InstallOfferStore
  // 홈 화면에 추가 줄·권하기 카드가 보는 브라우저 상태 (기본은 지금 브라우저, 테스트에서 바꿔 넣는다)
  install?: InstallEnvironment
  // 카톡 안 브라우저 (SPEC-009 C). 있으면 장부가 있을 때 장부보다 먼저 "카톡 안에서 열렸어요"(②, 표시가 없을 때),
  // 설정 [홈 화면에 추가] 자리에 [인터넷 앱으로 열기], 장부 위 권하기 카드 없음
  inApp?: InAppBrowser
  // 카톡에서 옮겨 와 첫 실행 물음의 [카톡에서 쓰던 장부 가져오기] 로 열었다 (SPEC-009 C ③): 복구 코드로 불러오기부터 (클립보드에서 읽은 코드)
  restoreFromKakao?: { code: string | undefined }
}

// 장부 위 권하기 카드 [홈 화면에 추가] 의 방법 안내 선택 창 (설정 줄은 settings-install-guide)
const LEDGER_INSTALL_GUIDE_SHEET = 'ledger-install-guide'

// 복구 코드 [보내기] 결과 알림. 공유 화면을 그냥 닫았으면 알리지 않는다
const SHARE_CODE_MESSAGES: Record<Exclude<ShareCodeResult, 'cancelled'>, string> = {
  shared: '복구 코드를 보냈어요',
  copied: '복사했어요',
  failed: '보내지 못했어요. 코드를 종이에 적어 두세요',
}

// 연습이 끝나면 다시 그릴 진짜 장부: 지금 데이터 + 앱을 열 때의 시작 상태 (저장 안 됨 표시·마지막 저장 실패는 다시 그리면 없어진다)
function currentLoad({ startup, data }: LedgerState): LoadResult {
  return startup.status === 'read-only' ? { status: 'read-only', reason: startup.reason, data } : { status: startup.status, data }
}

// 자동 보관이 없는 빌드에서 상태 구독 자리
const subscribeNothing = () => () => {}
const noKeepState = (): KeepState | undefined => undefined

// 앱 뼈대 (SPEC-001 화면 구성, 탭 없음): 장부(첫 화면) / 내역 적기·고치기 / 설정 / 월 정리 / 올해 결산 / 새 장부 만들기.
// 장부가 하나도 없으면 새 장부 만들기 화면만(첫 실행, SPEC-005).
// 화면은 모두 지금 장부(마지막에 본 장부) 하나를 보여 준다. 장부를 고르기·만들기·지우기는 useLedger 가 지금 장부를 바꾸고 App 은 보던 달을 비운다
export default function App({
  repository,
  loaded,
  options,
  keep,
  guideStore,
  saver = pictureSaver,
  practice,
  onStartPractice,
  onFirstRunChange,
  installOfferStore,
  install = browserInstallEnvironment(),
  inApp,
  restoreFromKakao,
}: AppProps) {
  const ledger = useLedger(repository, loaded, options)
  const bookName = ledger.book?.name ?? ''
  // 연습 장부에서는 뒤로 버튼이 화면을 닫지 않고 "연습을 그만할까요?" 를 묻는다 (SPEC-008)
  const navigation = useScreenHistory({ backOpensDialog: practice ? PRACTICE_STOP_DIALOG : undefined })
  // 화면이 바뀌면 새 화면 제목에 포커스·브라우저 제목 (#110)
  const mainRef = useRef<HTMLElement>(null)
  useScreenHeading(mainRef)
  // 장부 화면에서 넘겨 본 달. 다른 화면에 다녀와도 그대로이고, 연도를 바꾸면 비워서 그 해의 처음 달(올해면 이번 달, 지난 연도면 12월)로
  const [viewedMonth, setViewedMonth] = useState<number | undefined>()
  const [toast, setToast] = useState<string | null>(null)
  // 연달아 적기 (SPEC-001 v2.1): 이번에 내역 적기 화면에 들어와 저장한 내역. 장부로 돌아오면 비운다
  const [chainSaved, setChainSaved] = useState<EntryInput[]>([])
  // 내역 적기의 지금 단계 (연습 말풍선이 본다). form: 연달아 적기로 다시 그린 몇 번째 화면인지
  const [entryStep, setEntryStep] = useState<{ form: number; state: StepState }>()
  const reportEntryStep = useCallback((state: StepState) => setEntryStep({ form: chainSaved.length, state }), [chainSaved.length])
  // 백업 파일 보내기·불러오기 (SPEC-002). 불러오면 올해 장부의 처음 달로 돌아가 알린다
  const now = options?.now ?? (() => new Date())
  const backup = useBackup(ledger, {
    now,
    onRestored: () => {
      // 첫 실행에서 기록 파일로 시작했으면 이미 쓰던 분이다 (SPEC-008)
      if (ledger.isFirstRun) guide.turnOff()
      setViewedMonth(undefined)
      navigation.backToLedger()
      setToast('불러왔어요')
    },
    onSent: setToast,
    dialogs: navigation,
  })

  // 홈 화면에 추가 (SPEC-002): 권하기 카드는 첫 장부를 만든 직후부터 [나중에]·설치 전까지 (#135)
  const installAction = useInstallAction(install, navigation, LEDGER_INSTALL_GUIDE_SHEET)
  const [installOffer, setInstallOffer] = useState(() => installOfferStore?.load())
  const finishInstallOffer = useCallback(() => {
    installOfferStore?.save('done')
    setInstallOffer('done')
  }, [installOfferStore])
  // 설치를 마쳤으면(카드·설정 줄·브라우저 메뉴 어느 쪽이든) 기기에 적어 다시 권하지 않는다. 화면은 installed 로 이미 숨는다
  const installedNow = installAction.installed && installOffer === 'waiting'
  useEffect(() => {
    if (installedNow) installOfferStore?.save('done')
  }, [installedNow, installOfferStore])

  // 자동 보관 상태 (설정 줄 "켜짐 · 3분 전", 7일 안내). 보관기가 바뀌면 다시 그린다
  const keepState = useSyncExternalStore(keep?.keeper.subscribe ?? subscribeNothing, keep?.keeper.getState ?? noKeepState)
  const recoveryCode = recoveryCodeOf(ledger.data)

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
  const { isFirstRun } = ledger
  useEffect(() => {
    onFirstRunChange?.(isFirstRun)
  }, [isFirstRun, onFirstRunChange])

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

  // 새 장부를 만들면 그 장부의 올해 장부 화면(이번 달)으로. 기기에 저장했을 때만 알린다 (SPEC-005 AC-4)
  // 첫 장부면 브라우저에 오래 보관을 요청한다. 앱 시작 때는 장부가 없어 요청하지 않았다 (SPEC-002). 결과를 기다리지 않는다
  function createBook(setup: BookSetup) {
    const isFirstBook = ledger.isFirstRun
    if (ledger.createBook(setup)) {
      setToast('새 장부를 만들었어요')
      if (isFirstBook) {
        void requestPersistentStorage()
        // 처음 쓰는 분 안내는 이때만 켠다 (SPEC-008). 두 번째 장부를 만들 때는 켜지 않는다
        guide.activate()
        // 홈 화면에 추가 권하기도 첫 장부 직후에만 (SPEC-002 #135). 연습 장부에는 없다.
        // 연습 끝 "홈 화면에 추가하시겠어요?" 에 이미 대답했으면(done) 덮지 않는다 (SPEC-009 B). 카톡 안에서는 설치가 안 돼 권하지 않는다 (SPEC-009 C)
        if (installOfferStore && !practice && installOfferStore.load() !== 'done' && !inApp) {
          installOfferStore.save('waiting')
          setInstallOffer('waiting')
        }
      }
    }
    setViewedMonth(undefined)
    // 첫 실행이면 이미 장부 화면 자리라 돌아갈 방문 기록이 없다
    if (screen.name === 'new-book') navigation.backToLedger()
  }

  // 복구 코드로 받아 온 데이터로 전체 바꾸기 (SPEC-006 AC-5). 백업 불러오기와 같이 올해 장부의 처음 달로 돌아가 알린다
  function restoreKept(data: StoredData) {
    const wasFirstRun = ledger.isFirstRun
    const result = ledger.restoreBackup(data)
    if (result.ok) {
      if (wasFirstRun) guide.turnOff()
      setViewedMonth(undefined)
      navigation.backToLedger()
      setToast('불러왔어요')
    }
    return result
  }

  // 복구 코드로 불러오기 화면에 넘기는 것. 서버 주소가 없는 빌드면 없다
  const restoreByCode = keep && { server: keep.server, hasRecords: !ledger.isFirstRun, onRestore: restoreKept }

  // 카톡에서 옮겨 와 [카톡에서 쓰던 장부 가져오기] 로 열었으면 복구 코드로 불러오기부터 (SPEC-009 C ③).
  // 첫 실행 물음 칸 위에 그 화면 칸 하나만 쌓아, 뒤로 버튼은 물음으로 돌아간다(AppRoot)
  const openedRestoreAtStart = useRef(false)
  const openRestoreAtStart = useEffectEvent(() => {
    if (openedRestoreAtStart.current || !restoreFromKakao || !restoreByCode || !ledger.isFirstRun) return
    openedRestoreAtStart.current = true
    navigation.open({ name: 'keep-restore' })
  })
  useEffect(() => openRestoreAtStart(), [])

  // 카톡 안에 장부가 있으면 장부보다 먼저 "카톡 안에서 열렸어요" ② (SPEC-009 C). [그냥 여기서 쓸게요] 로 표시를 남기면 다시 묻지 않는다
  const [inAppGate, setInAppGate] = useState(() => inApp !== undefined && !ledger.isFirstRun && !inApp.store.stays())
  // ② 옮기는 길: 자동으로 지키기를 쓸 수 있으면 복구 코드, 아니면(서버 주소 없는 빌드·꺼짐·읽기 전용·너무 큼) 기록 파일
  const keepUsableForMove =
    keep !== undefined && keepState?.enabled === true && keepState.tooLarge !== true && ledger.startup.status !== 'read-only'
  const ledgerMove: LedgerMove =
    keepUsableForMove && recoveryCode
      ? { by: 'code', code: recoveryCode, keepNow: () => keep.keeper.keepNow(ledger.data) }
      : { by: 'file', sendFile: backup.send }
  function stayInApp() {
    inApp?.store.stay()
    setInAppGate(false)
  }

  function shareCode() {
    if (!recoveryCode) return
    void shareRecoveryCode(recoveryCode).then((result) => {
      if (result !== 'cancelled') setToast(SHARE_CODE_MESSAGES[result])
    })
  }

  // 자동으로 지키기 끄기: 서버 사본을 지우기로 했으면 지운 결과까지 알린다
  function turnOffKeep(forgetCopy: boolean) {
    if (!keep) return
    keep.keeper.setEnabled(false)
    if (!forgetCopy) {
      setToast('자동으로 지키기를 껐어요')
      return
    }
    void keep.keeper.forget().then((removed) =>
      setToast(
        removed ? '자동으로 지키기를 끄고 보관해 둔 기록을 지웠어요' : '자동으로 지키기를 껐어요. 보관해 둔 기록은 지우지 못했어요',
      ),
    )
  }

  // 저장 상태 안내는 어느 화면이든 맨 위에 (SPEC-002). 할 일이 있으면 기록 파일 버튼을 붙인다
  const noticeActions: Record<StorageNoticeAction, { label: string; icon: IconName; onClick: () => void }> = {
    'import-backup': { label: '기록 파일 불러오기', icon: 'folder', onClick: backup.startImport },
    'send-backup': { label: '기록 파일 보내기', icon: 'share', onClick: backup.send },
  }
  const storageNoticeList = storageNotices(ledger.startup, ledger.saveFailure)
  const notices = storageNoticeList.map(({ message, action }) => (
    <NoticeBar key={message} message={message} action={action && noticeActions[action]} />
  ))
  const noticeOffersImport = storageNoticeList.some((notice) => notice.action === 'import-backup')
  // 7일 보관 안내 (SPEC-006): 장부 위, 저장 안내가 없을 때만. 연습 장부에는 없다 (진짜 장부에 대한 안내, SPEC-008)
  const showKeepReminder = !practice && needsKeepReminder(keepState, now()) && storageNoticeList.length === 0
  // 30일 백업 안내 (SPEC-002): [설정] 점 표시는 늘, 장부·설정 위 띠는 저장 안내가 없을 때만 (띠는 하나만: 저장 > 보관 > 백업). 연습 장부에는 없다
  const needsBackup = !practice && backupReminderFor(ledger.data, now())
  const showBackupReminder = needsBackup && storageNoticeList.length === 0
  // 홈 화면에 추가 권하기 (SPEC-002 #135): 띠 순서 맨 뒤 — 위 띠가 하나라도 있으면 뒤로 미룬다
  const showInstallOffer = !inApp && showsInstallOffer({
    status: installOffer,
    standalone: install.standalone,
    installed: installAction.installed,
    practice: practice !== undefined,
    otherNotice: storageNoticeList.length > 0 || showKeepReminder || showBackupReminder,
  })

  // 복구 코드 안내 말풍선 (SPEC-008 4번): 장부 화면이 새로 보일 때 띄울지 묻는다
  const guide = useFirstUseGuide({
    store: guideStore,
    visit: ledger.isFirstRun ? undefined : screen,
    context: {
      screen: !ledger.isFirstRun && screen.name === 'ledger' && ledger.ledger ? 'ledger' : 'other',
      entryCount: totalEntryCount(ledger.data),
      keepUsable: keepState?.enabled === true && recoveryCode !== undefined,
      blocked:
        storageNoticeList.length > 0 || navigation.dialog !== null || navigation.sheet !== null || navigation.confirmingLeave,
    },
    dialogs: navigation,
  })

  // 연습 말풍선이 보는 지금 화면 (SPEC-008)
  const practiceView: PracticeView = {
    screen: screen.name,
    covered: navigation.dialog !== null || navigation.sheet !== null || navigation.confirmingLeave,
    entries: ledger.ledger?.entries ?? [],
    entry:
      screen.name === 'add-entry' && entryStep?.form === chainSaved.length
        ? { step: entryStep.state.step, amount: entryStep.state.draft.amount, saved: chainSaved.length }
        : undefined,
    canSend: saver.send !== undefined,
  }

  function screenContent(): ReactNode {
    if (inApp && inAppGate && !ledger.isFirstRun) {
      return <InAppBrowserScreen kind={inApp.kind} move={ledgerMove} onStay={stayInApp} />
    }
    if (ledger.isFirstRun) {
      if (restoreByCode && screen.name === 'keep-restore') {
        return (
          <KeepRestoreScreen
            {...restoreByCode}
            dialogs={navigation}
            backLabel="뒤로"
            onBack={navigation.backToLedger}
            fromKakao={restoreFromKakao}
          />
        )
      }
      // 첫 실행은 새 장부 만들기 (SPEC-005). 새 폰으로 옮길 때는 장부를 만들지 않고 기록 파일(안내 띠에 같은 버튼이 있으면 하나만)이나
      // 복구 코드(SPEC-006)로 불러온다
      return (
        <>
          {(!noticeOffersImport || restoreByCode) && (
            <div className="screen__top-end">
              {!noticeOffersImport && (
                <IconButton icon="folder" onClick={backup.startImport}>
                  기록 파일 불러오기
                </IconButton>
              )}
              {restoreByCode && (
                <IconButton icon="key" onClick={() => navigation.open({ name: 'keep-restore' })}>
                  복구 코드로 불러오기
                </IconButton>
              )}
            </div>
          )}
          <NewBookScreen onCreate={createBook} />
        </>
      )
    }

    switch (screen.name) {
      case 'settings':
        return (
          <SettingsScreen
            bookName={bookName}
            bookKind={ledger.book?.kind ?? 'club'}
            carryoverWords={ledger.carryoverWords}
            canDeleteBook={ledger.bookChoices.length > 1}
            onDeleteBook={() => {
              // 저장하지 못하면 아무것도 지우지 않고 설정에 남아 위쪽 실패 안내만 (SPEC-005)
              if (!ledger.book || !ledger.deleteBook(ledger.book.id)) return false
              setToast('장부를 지웠어요')
              setViewedMonth(undefined)
              navigation.backToLedger()
              return true
            }}
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
            onSaveBookInfo={(setup) => {
              // 저장에 실패하면 위쪽 안내 띠만 보이고 "바꿨어요" 는 띄우지 않는다
              if (ledger.updateBookInfo(setup)) setToast('바꿨어요')
            }}
            onSendBackup={backup.send}
            onImportBackup={backup.startImport}
            keep={
              keep &&
              keepState && {
                statusText: keepStatusText(keepState, now()),
                enabled: keepState.enabled,
                tooLarge: keepState.tooLarge === true,
                onTurnOn: () => {
                  keep.keeper.setEnabled(true)
                  setToast('자동으로 지키기를 켰어요')
                },
                onTurnOff: turnOffKeep,
              }
            }
            recoveryCode={recoveryCode}
            onShareCode={shareCode}
            restoreByCode={restoreByCode}
            onBack={navigation.backToLedger}
            onPractice={onStartPractice && (() => onStartPractice(ledger.book?.kind ?? 'club', currentLoad(ledger)))}
            install={install}
            inApp={inApp && { kind: inApp.kind, move: ledgerMove }}
          />
        )
      case 'month-summary':
        // 월 정리는 장부가 있을 때 장부 화면에서만 열린다
        if (!ledger.ledger) return null
        return (
          <MonthSummaryScreen
            ledger={ledger.ledger}
            month={screen.month}
            carryoverWords={ledger.carryoverWords}
            onBack={navigation.backToLedger}
            onNotify={setToast}
            saver={saver}
          />
        )
      case 'year-summary':
        return (
          <YearSummaryScreen
            bookName={bookName}
            year={ledger.year}
            ledger={ledger.ledger}
            carryoverWords={ledger.carryoverWords}
            onBack={navigation.backToLedger}
            onNotify={setToast}
            saver={saver}
            practice={practice !== undefined}
            onPictureResult={practice?.onPictureResult}
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
            olderChoices={ledger.olderChoices}
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
            onStepChange={practice && reportEntryStep}
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
            olderChoices={ledger.olderChoices}
            sheets={navigation}
            onSave={(input) => returnToLedger(ledger.updateEntry(id, input), '고쳤어요', input.month)}
            onBack={navigation.requestBack}
            onDirtyChange={navigation.confirmBeforeLeave}
            onDelete={() => returnToLedger(ledger.deleteEntry(id), '지웠어요', entryMonth)}
          />
        )
      }
      case 'new-book':
        return <NewBookScreen onCreate={createBook} onBack={navigation.backToLedger} />
      case 'keep-restore':
        // 첫 실행에서 열고 불러온 직후(장부로 돌아가는 중)에만 여기에 온다
        return restoreByCode ? <KeepRestoreScreen {...restoreByCode} dialogs={navigation} backLabel="장부로" onBack={navigation.backToLedger} /> : null
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
            year={year}
            carryoverLabel={ledger.carryoverWords.label}
            defaults={ledger.newLedgerDefaults}
            onStart={ledger.startLedger}
          />
        </>
      )
    }
    // 장부 위 띠는 하나만: 저장 안내 > 7일 보관 안내(SPEC-006) > 30일 백업 안내(SPEC-002) > 첫 장부 뒤 홈 화면에 추가 권하기(SPEC-002 #135).
    // 홈 화면에 추가는 늘 설정 "앱" 묶음 줄에도 있다 (#56)
    return (
      <>
        {showKeepReminder && <NoticeBar message={KEEP_REMINDER_MESSAGE} />}
        {!showKeepReminder && showBackupReminder && (
          <NoticeBar message={BACKUP_REMINDER_MESSAGE} action={noticeActions['send-backup']} />
        )}
        {showInstallOffer && <InstallOfferCard onInstall={installAction.start} onLater={finishInstallOffer} />}
        <InstallGuideSheet install={install} sheets={navigation} guideSheet={LEDGER_INSTALL_GUIDE_SHEET} />
        <LedgerScreen
          bookName={bookName}
          bookId={ledger.book?.id ?? ''}
          books={ledger.bookChoices}
          carryoverWords={ledger.carryoverWords}
          onPickBook={(id) => {
            // 고른 장부의 올해 장부, 올해면 이번 달부터 (SPEC-005 AC-3)
            ledger.switchBook(id)
            setViewedMonth(undefined)
          }}
          onNewBook={() => navigation.open({ name: 'new-book' })}
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
          unsavedEntryIds={ledger.unsavedEntryIds}
          settingsRef={guide.settings}
        />
      </>
    )
  }

  return (
    <div className="app">
      {practice?.render(practiceView, navigation)}
      <main ref={mainRef} className="app__main">
        {notices}
        {screenContent()}
      </main>
      {/* 내역 적기·고치기에서 적던 내용이 있을 때 [← 장부로]·뒤로 버튼을 누르면 묻는다.
          연달아 적기로 넣은 것이 있으면 그건 남는다고 알린다 (AC-34). 고치기 화면에서는 chainSaved 가 늘 비어 있다 */}
      <ConfirmDialog
        open={navigation.confirmingLeave}
        title="적던 내용을 버릴까요?"
        description={chainSaved.length > 0 ? `장부에 넣은 ${chainSaved.length}건은 그대로 있어요` : undefined}
        confirmLabel="버리기"
        danger
        onConfirm={navigation.confirmLeave}
        onCancel={navigation.cancelLeave}
      />
      <BackupDialogs backup={backup} />
      <FirstUseGuideMark guide={guide} />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
