import { Fragment, useId, useState, type ReactNode } from 'react'
import { BOOK_KIND_LABELS, type CarryoverWords } from '../../domain/book'
import type { BookSetup } from '../../domain/ledger'
import type { BookKind, Ledger, StoredData } from '../../domain/types'
import type { SaveResult } from '../../storage/LedgerRepository'
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { Icon, type IconName } from '../../ui/Icon'
import { ListRow } from '../../ui/ListRow'
import { formatAmount } from '../../ui/money'
import { NoticeBar } from '../../ui/NoticeBar'
import { OptionList } from '../../ui/OptionList'
import { TextField } from '../../ui/TextField'
import { BackButton, BackToLedger } from '../BackToLedger'
import { BACKUP_REMINDER_MESSAGE, lastBackupText } from '../backup/backupReminder'
import { bookKindIcon } from '../books/bookKindIcon'
import { KeepRestoreScreen } from '../keep/KeepRestoreScreen'
import type { KeepServer } from '../keep/keepServer'
import { InstallGuide } from '../install/InstallGuide'
import { browserInstallEnvironment, useInstallPrompt, type InstallEnvironment } from '../install/installPrompt'
import { browserKind, shouldOfferInstall } from '../install/installRules'
import { CarryoverField } from '../ledger/CarryoverField'
import type { SheetHistory } from '../useScreenHistory'
import './settings.css'

// 설정 화면 위에 뜨는 것들 (방문 기록 한 칸씩 — 뒤로 버튼은 이것만 닫는다)
const BOOK_NAME_PAGE = 'settings-book-name'
const CARRYOVER_PAGE = 'settings-carryover'
const KIND_SHEET = 'settings-kind'
const YEAR_SHEET = 'settings-year'
const INSTALL_GUIDE_SHEET = 'settings-install-guide'
const KEEP_SHEET = 'settings-keep'
const KEEP_RESTORE_PAGE = 'settings-keep-restore'
// 확인 창 (방문 기록 한 칸 — 뒤로 버튼은 확인 창만 닫는다, #110)
const DELETE_BOOK_DIALOG = 'settings-delete-book'
const KEEP_OFF_DIALOG = 'settings-keep-off' // 자동으로 지키기 선택 창 칸에 바꿔 끼운다

const KIND_QUESTION = '어떤 장부인가요?'
const KIND_CHOICES: BookKind[] = ['club', 'household']

// 기록 지키기 (SPEC-006) 자동으로 지키기
export interface KeepRow {
  statusText: string // 맨 위 카드 상태 줄 "자동으로 지키기 켜짐 · 3분 전에 보관했어요" (keepStatusText)
  enabled: boolean // 접기 안 [자동으로 지키기] 줄 값 켜짐·꺼짐
  tooLarge: boolean // 보관본이 1MB 를 넘어 올리지 못했다
  onTurnOn: () => void
  onTurnOff: (forgetCopy: boolean) => void // forgetCopy: 서버에 보관해 둔 사본도 지운다
}

// 복구 코드로 불러오기 화면에 넘기는 것 (서버 주소가 있는 빌드에만)
export interface RestoreByCode {
  server: KeepServer
  hasRecords: boolean
  onRestore: (data: StoredData) => SaveResult
}

type SettingsScreenProps = {
  bookName: string // 지금 장부 이름 (SPEC-005)
  bookKind: BookKind
  carryoverWords: CarryoverWords // 이월금 줄 이름 (장부 종류·연도별, "작년 이월금" / "지금 남은 돈" …)
  canDeleteBook: boolean // 장부가 둘 이상일 때만 [이 장부 지우기] (빈 앱이 되지 않게)
  onDeleteBook: () => boolean // 확인 창 [지우기]. 지웠으면 true (부른 쪽이 장부로 돌아간다), 저장하지 못했으면 false
  year: number
  yearChoices: number[] // 장부가 있는 연도 + 올해, 최신 순
  ledger: Ledger | undefined // 고른 연도 장부. 아직 없으면 undefined
  // 편집 화면·연도 선택 창을 여닫는 방문 기록
  sheets: SheetHistory
  // 한 달 넘게 기록 파일을 보내지 않았으면 제목 아래 안내 띠 (SPEC-002, 장부 화면과 같은 띠)
  needsBackup?: boolean
  onChangeYear: (year: number) => void // 고르면 장부 화면으로 돌아가 그 해를 보여 준다
  onSaveBookInfo: (setup: BookSetup) => void
  lastBackupAt?: string // 마지막으로 기록 파일을 보낸 시각 ([기록 파일 보내기] 줄에 날짜로)
  onSendBackup: () => void
  onImportBackup: () => void
  // 자동으로 지키기. 없으면 서버 주소가 정해지기 전 빌드 (SPEC-006)
  keep?: KeepRow
  recoveryCode?: string // 복구 코드. 아직 없으면(읽기 전용 시작) 없다
  onShareCode: () => void // [복구 코드 보내기]
  restoreByCode?: RestoreByCode // 있으면 [복구 코드로 불러오기] 줄
  onBack: () => void
  // [연습해 보기] (SPEC-008): 저장되지 않는 연습 장부를 연다. 없으면 줄이 없다
  onPractice?: () => void
  // 홈 화면에 추가 줄이 보는 브라우저 상태 (기본은 지금 브라우저, 테스트에서 바꿔 넣는다)
  install?: InstallEnvironment
}

// 이월금 값: 적자는 빼기표 대신 "적자" (장부 잔액 카드와 같은 말)
function carryoverText(carryover: number): string {
  return carryover < 0 ? `적자 ${formatAmount(-carryover)}원` : `${formatAmount(carryover)}원`
}

// 설정 (SPEC-001 화면 구성, SPEC-002 기록 파일, SPEC-005 장부 정보, SPEC-006 기록 지키기 v2.6):
// 맨 위 기록 지키기 카드 → "다른 방법으로 옮기기" 접기 → 장부 정보 → 앱 → [이 장부 지우기].
// 이름·이월금 줄은 그 값 하나만 고치는 편집 화면을, 종류·연도·자동으로 지키기 줄은 선택 창을 연다
export function SettingsScreen({
  bookName,
  bookKind,
  carryoverWords,
  canDeleteBook,
  onDeleteBook,
  year,
  yearChoices,
  ledger,
  sheets,
  needsBackup = false,
  onChangeYear,
  onSaveBookInfo,
  lastBackupAt,
  onSendBackup,
  onImportBackup,
  keep,
  recoveryCode,
  onShareCode,
  restoreByCode,
  onBack,
  onPractice,
  install = browserInstallEnvironment(),
}: SettingsScreenProps) {
  const installPrompt = useInstallPrompt(install.installPrompt)
  const offersInstall = shouldOfferInstall({ standalone: install.standalone, installed: installPrompt.installed })
  // 다른 방법으로 옮기기: 설정을 열 때마다 처음엔 접혀 있다 (편집·불러오기 화면에 다녀와도 그대로)
  const [moreOpen, setMoreOpen] = useState(false)

  // 기록 파일 보내기·불러오기 두 줄 (SPEC-002): 맨 위(코드 없을 때) 또는 접기 안 처음 두 줄
  const fileRows = (
    <>
      <SettingRow icon="share" title="기록 파일 보내기" description={lastBackupText(lastBackupAt)} onClick={onSendBackup} />
      <SettingRow icon="folder" title="기록 파일 불러오기" description="받아 둔 파일로 기록 되살리기" onClick={onImportBackup} />
    </>
  )

  if (restoreByCode && sheets.sheet === KEEP_RESTORE_PAGE) {
    return <KeepRestoreScreen {...restoreByCode} dialogs={sheets} backLabel="설정" onBack={sheets.closeSheet} />
  }

  if (ledger && sheets.sheet === BOOK_NAME_PAGE) {
    return (
      <BookNameEdit
        name={bookName}
        onSave={(name) => {
          onSaveBookInfo({ name, kind: bookKind, carryover: ledger.carryover })
          sheets.closeSheet()
        }}
        onBack={sheets.closeSheet}
      />
    )
  }
  if (ledger && sheets.sheet === CARRYOVER_PAGE) {
    return (
      <CarryoverEdit
        label={carryoverWords.label}
        ledger={ledger}
        onSave={(carryover) => {
          onSaveBookInfo({ name: bookName, kind: bookKind, carryover })
          sheets.closeSheet()
        }}
        onBack={sheets.closeSheet}
      />
    )
  }

  return (
    <div className="screen settings" data-testid="settings-screen">
      <BackToLedger onBack={onBack} />
      <h1 className="screen__title">설정</h1>
      {needsBackup && (
        <NoticeBar message={BACKUP_REMINDER_MESSAGE} action={{ label: '기록 파일 보내기', icon: 'share', onClick: onSendBackup }} />
      )}

      {/* 기록 지키기 (SPEC-006 v2.6). 복구 코드가 있으면 맨 위 카드 + 나머지는 접기,
          없으면(서버 주소 없는 빌드·읽기 전용 시작) 받아 올 곳 없는 코드·"준비 중" 대신 기록 파일 두 줄만 맨 위에 */}
      {keep && recoveryCode ? (
        <>
          <KeepCard code={recoveryCode} statusText={keep.statusText} tooLarge={keep.tooLarge} onShare={onShareCode} />
          <MoreWays open={moreOpen} onToggle={() => setMoreOpen((open) => !open)}>
            {fileRows}
            {restoreByCode && (
              <SettingRow
                icon="key"
                title="복구 코드로 불러오기"
                description="다른 폰의 코드를 넣기"
                onClick={() => sheets.openSheet(KEEP_RESTORE_PAGE)}
              />
            )}
            <SettingRow
              icon="cloud"
              title="자동으로 지키기"
              value={keep.enabled ? '켜짐' : '꺼짐'}
              onClick={() => sheets.openSheet(KEEP_SHEET)}
            />
          </MoreWays>
        </>
      ) : (
        <div className="settings__list" data-testid="settings-block-files">
          {fileRows}
        </div>
      )}

      {/* 장부 정보 (SPEC-005): 처음 만들 때 정한 값이라 자주 열지 않아 기록 지키기 아래 */}
      <SettingsGroup title="장부 정보" testId="settings-block-book">
        {ledger ? (
          <>
            <SettingRow icon="pen" title="장부 이름" value={bookName} onClick={() => sheets.openSheet(BOOK_NAME_PAGE)} />
            <SettingRow
              icon={bookKindIcon(bookKind)}
              title="종류"
              value={BOOK_KIND_LABELS[bookKind]}
              onClick={() => sheets.openSheet(KIND_SHEET)}
            />
            <SettingRow
              icon="bank"
              title={carryoverWords.label}
              value={carryoverText(ledger.carryover)}
              onClick={() => sheets.openSheet(CARRYOVER_PAGE)}
            />
          </>
        ) : (
          <p className="settings__note">{year}년 장부가 아직 없어요. 장부 화면에서 시작하면 여기서 고칠 수 있어요.</p>
        )}
        <SettingRow icon="calendar" title="장부 연도" value={`${year}년`} onClick={() => sheets.openSheet(YEAR_SHEET)} />
      </SettingsGroup>

      {/* 앱: 홈 화면에 추가 (SPEC-002, 설치 제안이 있으면 브라우저 설치 창, 없으면 방법 안내. 홈 화면 앱이면 없다) +
          맨 아래 [연습해 보기] (SPEC-008, 홈 화면 앱에서도 있어 묶음은 늘 있다) */}
      {(offersInstall || onPractice) && (
        <SettingsGroup title="앱" testId="settings-block-app">
          {offersInstall && (
            <SettingRow
              icon="phone"
              title="홈 화면에 추가"
              description="기록이 더 안전해요"
              onClick={() => (installPrompt.canInstall ? void installPrompt.install() : sheets.openSheet(INSTALL_GUIDE_SHEET))}
            />
          )}
          {onPractice && <SettingRow icon="play" title="연습해 보기" description="저장되지 않는 장부로 따라 해 봐요" onClick={onPractice} />}
        </SettingsGroup>
      )}

      {/* 장부 지우기 (SPEC-005): 되돌릴 수 없어 맨 아래 위험 글자형으로 따로 두고, 확인을 받는다 */}
      {canDeleteBook && (
        <div className="settings__danger" data-testid="settings-block-delete">
          <Button variant="danger-text" onClick={() => sheets.openDialog(DELETE_BOOK_DIALOG)}>
            이 장부 지우기
          </Button>
        </div>
      )}

      {ledger && (
        <BottomSheet open={sheets.sheet === KIND_SHEET} title={KIND_QUESTION} onClose={sheets.closeSheet}>
          <OptionList
            label={KIND_QUESTION}
            options={KIND_CHOICES.map((kind) => ({ value: kind, label: BOOK_KIND_LABELS[kind], icon: bookKindIcon(kind) }))}
            value={bookKind}
            onChange={(picked) => {
              if (picked !== bookKind) onSaveBookInfo({ name: bookName, kind: picked, carryover: ledger.carryover })
              sheets.closeSheet()
            }}
          />
        </BottomSheet>
      )}

      <BottomSheet open={sheets.sheet === YEAR_SHEET} title="어느 해 장부를 볼까요?" onClose={sheets.closeSheet}>
        <OptionList
          label="장부 연도"
          options={yearChoices.map((choice) => ({ value: String(choice), label: `${choice}년` }))}
          value={String(year)}
          onChange={(picked) => onChangeYear(Number(picked))}
        />
      </BottomSheet>

      {keep && (
        <BottomSheet open={sheets.sheet === KEEP_SHEET} title="자동으로 지키기" onClose={sheets.closeSheet}>
          <OptionList
            label="자동으로 지키기"
            options={[
              { value: 'on', label: '켜기' },
              { value: 'off', label: '끄기' },
            ]}
            value={keep.enabled ? 'on' : 'off'}
            onChange={(picked) => {
              // 끄면 서버에 남은 사본을 어떻게 할지 묻는다: 선택 창 칸을 확인 창으로 바꿔 끼운다. 뒤로 버튼은 [남겨 두기] 와 같다
              if (picked === 'off' && keep.enabled) {
                sheets.openSheet(KEEP_OFF_DIALOG, () => keep.onTurnOff(false))
                return
              }
              sheets.closeSheet()
              if (picked === 'on' && !keep.enabled) keep.onTurnOn()
            }}
          />
        </BottomSheet>
      )}

      <BottomSheet open={sheets.sheet === INSTALL_GUIDE_SHEET} title="홈 화면에 추가하는 방법" onClose={sheets.closeSheet}>
        <InstallGuide browser={browserKind(install.userAgent)} />
        <Button onClick={sheets.closeSheet}>확인</Button>
      </BottomSheet>

      <ConfirmDialog
        open={sheets.dialog === DELETE_BOOK_DIALOG}
        title={`‘${bookName}’ 장부와 기록을 모두 지울까요?`}
        description="되돌릴 수 없어요"
        confirmLabel="지우기"
        danger
        onConfirm={() => {
          // 지웠으면 부른 쪽이 장부로 돌아가며 확인 창 칸까지 되돌린다
          if (!onDeleteBook()) sheets.closeDialog()
        }}
        onCancel={sheets.closeDialog}
      />

      {/* 자동으로 지키기 끄기 (SPEC-006): 서버 사본을 남겨 둘지 지울지. 어느 쪽이든 끈다 (Esc·뒤로 버튼은 남겨 두기) */}
      <ConfirmDialog
        open={sheets.sheet === KEEP_OFF_DIALOG}
        title="보관해 둔 기록도 지울까요?"
        description="남겨 두면 나중에 복구 코드로 다시 불러올 수 있어요"
        cancelLabel="남겨 두기"
        confirmLabel="지우기"
        danger
        onConfirm={() => {
          sheets.closeSheet()
          keep?.onTurnOff(true)
        }}
        onCancel={() => {
          sheets.closeSheet()
          keep?.onTurnOff(false)
        }}
      />
    </div>
  )
}

type KeepCardProps = {
  code: string
  statusText: string
  tooLarge: boolean // 보관본이 1MB 를 넘어 올리지 못했다
  onShare: () => void
}

// 기록 지키기 맨 위 카드 (SPEC-006 v2.6 시안 C): 제목 → 큰 복구 코드 → 안내 → 주 버튼 [복구 코드 보내기] → 상태 줄.
// 묶음 제목 "기록 지키기" 대신 카드 제목이 그 자리다. 상태 줄은 누르는 곳이 아니다 (켜고 끄기는 접기 안)
export function KeepCard({ code, statusText, tooLarge, onShare }: KeepCardProps) {
  const titleId = useId()
  return (
    <section className="settings__keep" aria-labelledby={titleId} data-testid="settings-block-keep">
      <h2 className="settings__keep-title" id={titleId}>
        새 폰으로 옮기려면 이 코드만 적어 두세요
      </h2>
      {/* 큰 글씨에서 한 줄에 안 들어가면 4자 묶음 사이(줄표 뒤)에서만 줄을 바꾼다 */}
      <span className="settings__code-value" data-testid="recovery-code-value">
        {code.split('-').map((part, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <>
                -<wbr />
              </>
            )}
            {part}
          </Fragment>
        ))}
      </span>
      <p className="settings__code-note">새 폰에서 이 코드를 넣으면 기록이 돌아와요. 가족에게도 보내 두세요.</p>
      <Button icon="share" onClick={onShare}>
        복구 코드 보내기
      </Button>
      <p className="settings__keep-status" data-testid="keep-status">
        <Icon name="cloud" />
        <span>{statusText}</span>
      </p>
      {tooLarge && <p className="settings__keep-warning">기록이 너무 많아 보관하지 못했어요. 기록 파일을 보내 두세요</p>}
    </section>
  )
}

type MoreWaysProps = {
  open: boolean
  onToggle: () => void
  children: ReactNode
}

// 다른 방법으로 옮기기 (SPEC-006 v2.6): 흰 카드 머리 줄을 누르면 펼쳐진다. 펼침 상태는 aria-expanded 로 읽힌다
function MoreWays({ open, onToggle, children }: MoreWaysProps) {
  const bodyId = useId()
  return (
    <div className="settings__more" data-testid="settings-block-more">
      <button type="button" className="settings__more-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        다른 방법으로 옮기기
        <Icon name="down" />
      </button>
      {open && (
        <div className="settings__more-body" id={bodyId} data-testid="settings-more-body">
          {children}
        </div>
      )}
    </div>
  )
}

type SettingsGroupProps = {
  title: string
  testId?: string
  children: ReactNode
}

// 묶음: 작은 묶음 제목 + 흰 카드 안 줄 목록
function SettingsGroup({ title, testId, children }: SettingsGroupProps) {
  const titleId = useId()
  return (
    <section className="settings__group" aria-labelledby={titleId} data-testid={testId}>
      <h2 className="settings__group-title" id={titleId}>
        {title}
      </h2>
      <div className="settings__list">{children}</div>
    </section>
  )
}

type SettingRowProps = {
  icon: IconName
  title: string
  // 지금 값 (오른쪽 회색 글자)
  value?: string
  // 이름 아래 보조 줄
  description?: string
  onClick: () => void
}

// 설정 줄: 원형 아이콘 + 이름(+ 보조 줄) + 값 + 줄 끝 › (ListRow chevron — 큰 글씨에서 값이 아래 줄로 내려가도 › 는 줄 끝에 남는다). 줄 전체가 버튼이라 "장부 이름 한랑드림" 으로 읽힌다
function SettingRow({ icon, title, value, description, onClick }: SettingRowProps) {
  return (
    <ListRow
      icon={icon}
      title={title}
      description={description}
      onClick={onClick}
      end={value !== undefined ? <span className="settings__value">{value}</span> : undefined}
      chevron
    />
  )
}

type EditPageProps = {
  title: string
  // 저장할 수 있는가 (바꾼 것이 있고 빠진 것이 없다)
  canSave: boolean
  onSave: () => void
  onBack: () => void
  children: ReactNode
}

// 설정 값 하나를 고치는 화면: [‹ 설정] → 제목 → 입력칸 → [저장]. 선택 창 대신 화면을 통째로 쓴다 —
// 폰 키패드가 올라와도 칸과 [저장] 이 가려지지 않고, 큰 글씨로 늘어나도 한 화면에 들어간다 (SPEC-001 설정)
function EditPage({ title, canSave, onSave, onBack, children }: EditPageProps) {
  return (
    <form
      className="screen screen--groups"
      data-testid="settings-edit"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) onSave()
      }}
    >
      <div className="settings__edit-head">
        <BackButton label="설정" onBack={onBack} />
        <h1 className="screen__title">{title}</h1>
      </div>
      {children}
      <Button type="submit" icon="check" disabled={!canSave}>
        저장
      </Button>
    </form>
  )
}

function BookNameEdit({ name, onSave, onBack }: { name: string; onSave: (name: string) => void; onBack: () => void }) {
  const [bookName, setBookName] = useState(name)
  const missingName = bookName.trim() === ''
  const changed = bookName.trim() !== name

  return (
    <EditPage title="장부 이름 바꾸기" canSave={!missingName && changed} onSave={() => onSave(bookName)} onBack={onBack}>
      <TextField
        label="장부 이름"
        labelRole="label"
        value={bookName}
        onChange={setBookName}
        error={missingName ? '장부 이름을 적어 주세요' : undefined}
      />
    </EditPage>
  )
}

type CarryoverEditProps = {
  label: string // 이월금 이름 (장부 종류별)
  ledger: Ledger
  onSave: (carryover: number) => void
  onBack: () => void
}

function CarryoverEdit({ label, ledger, onSave, onBack }: CarryoverEditProps) {
  const [carryover, setCarryover] = useState(ledger.carryover)

  return (
    <EditPage
      title={`${label} 바꾸기`}
      canSave={carryover !== ledger.carryover}
      onSave={() => onSave(carryover)}
      onBack={onBack}
    >
      <CarryoverField label={label} value={carryover} onChange={setCarryover} labelRole="label" />
    </EditPage>
  )
}
