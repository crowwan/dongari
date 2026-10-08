import { useId, useState, type ReactNode } from 'react'
import { BOOK_KIND_LABELS, type CarryoverWords } from '../../domain/book'
import type { BookSetup } from '../../domain/ledger'
import type { BookKind, Ledger } from '../../domain/types'
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

const KIND_QUESTION = '어떤 장부인가요?'
const KIND_CHOICES: BookKind[] = ['club', 'household']

type SettingsScreenProps = {
  bookName: string // 지금 장부 이름 (SPEC-005)
  bookKind: BookKind
  carryoverWords: CarryoverWords // 이월금 줄 이름 (장부 종류·연도별, "작년 이월금" / "지금 남은 돈" …)
  canDeleteBook: boolean // 장부가 둘 이상일 때만 [이 장부 지우기] (빈 앱이 되지 않게)
  onDeleteBook: () => void // 확인 창 [지우기]
  year: number
  yearChoices: number[] // 장부가 있는 연도 + 올해, 최신 순
  ledger: Ledger | undefined // 고른 연도 장부. 아직 없으면 undefined
  // 편집 화면·연도 선택 창을 여닫는 방문 기록
  sheets: SheetHistory
  // 한 달 넘게 백업하지 않았으면 제목 아래 안내 띠 (SPEC-002, 장부 화면과 같은 띠)
  needsBackup?: boolean
  onChangeYear: (year: number) => void // 고르면 장부 화면으로 돌아가 그 해를 보여 준다
  onSaveBookInfo: (setup: BookSetup) => void
  lastBackupAt?: string // 마지막으로 백업 파일을 보낸 시각 (백업 보내기 줄에 날짜로)
  onSendBackup: () => void
  onImportBackup: () => void
  onBack: () => void
  // 홈 화면에 추가 줄이 보는 브라우저 상태 (기본은 지금 브라우저, 테스트에서 바꿔 넣는다)
  install?: InstallEnvironment
}

// 이월금 값: 적자는 빼기표 대신 "적자" (장부 잔액 카드와 같은 말)
function carryoverText(carryover: number): string {
  return carryover < 0 ? `적자 ${formatAmount(-carryover)}원` : `${formatAmount(carryover)}원`
}

// 설정 (SPEC-001 화면 구성, SPEC-002 백업, SPEC-005 장부 정보): 묶음 제목 + 아이콘·이름·값·화살표 줄 목록.
// 이름·이월금 줄은 그 값 하나만 고치는 편집 화면을, 종류·연도 줄은 선택 창을 연다. 맨 아래 [이 장부 지우기]
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
  onBack,
  install = browserInstallEnvironment(),
}: SettingsScreenProps) {
  const installPrompt = useInstallPrompt(install.installPrompt)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
        <NoticeBar message={BACKUP_REMINDER_MESSAGE} action={{ label: '백업 파일 보내기', icon: 'share', onClick: onSendBackup }} />
      )}

      <SettingsGroup title="장부 정보">
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

      <SettingsGroup title="기록 백업" testId="settings-backup">
        <SettingRow icon="share" title="백업 파일 보내기" description={lastBackupText(lastBackupAt)} onClick={onSendBackup} />
        <SettingRow icon="folder" title="백업 파일 불러오기" description="새 폰으로 옮길 때" onClick={onImportBackup} />
      </SettingsGroup>

      {/* 홈 화면에 추가 (SPEC-002): 설치 제안이 있으면 브라우저 설치 창, 없으면 방법 안내. 홈 화면 앱이면 묶음째 없다 */}
      {shouldOfferInstall({ standalone: install.standalone, installed: installPrompt.installed }) && (
        <SettingsGroup title="앱">
          <SettingRow
            icon="phone"
            title="홈 화면에 추가"
            description="기록이 더 안전해요"
            onClick={() => (installPrompt.canInstall ? void installPrompt.install() : sheets.openSheet(INSTALL_GUIDE_SHEET))}
          />
        </SettingsGroup>
      )}

      {/* 장부 지우기 (SPEC-005): 되돌릴 수 없어 맨 아래 위험 글자형으로 따로 두고, 확인을 받는다 */}
      {canDeleteBook && (
        <div className="settings__danger">
          <Button variant="danger-text" onClick={() => setConfirmingDelete(true)}>
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

      <BottomSheet open={sheets.sheet === INSTALL_GUIDE_SHEET} title="홈 화면에 추가하는 방법" onClose={sheets.closeSheet}>
        <InstallGuide browser={browserKind(install.userAgent)} />
        <Button onClick={sheets.closeSheet}>확인</Button>
      </BottomSheet>

      <ConfirmDialog
        open={confirmingDelete}
        title={`‘${bookName}’ 장부와 기록을 모두 지울까요?`}
        description="되돌릴 수 없어요"
        confirmLabel="지우기"
        danger
        onConfirm={() => {
          setConfirmingDelete(false)
          onDeleteBook()
        }}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  )
}

// 묶음: 작은 묶음 제목 + 흰 카드 안 줄 목록
function SettingsGroup({ title, testId, children }: { title: string; testId?: string; children: ReactNode }) {
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

// 설정 줄: 원형 아이콘 + 이름(+ 보조 줄) + 값 + 화살표. 줄 전체가 버튼이라 "장부 이름 한랑드림" 으로 읽힌다
function SettingRow({ icon, title, value, description, onClick }: SettingRowProps) {
  return (
    <ListRow
      icon={icon}
      title={title}
      description={description}
      onClick={onClick}
      end={
        <span className="settings__end">
          {value !== undefined && <span className="settings__value">{value}</span>}
          <Icon name="right" />
        </span>
      }
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
