import { useId, useState, type ReactNode } from 'react'
import type { LedgerInfo } from '../../domain/ledger'
import type { Ledger } from '../../domain/types'
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { Icon, type IconName } from '../../ui/Icon'
import { ListRow } from '../../ui/ListRow'
import { formatAmount } from '../../ui/money'
import { NoticeBar } from '../../ui/NoticeBar'
import { OptionList } from '../../ui/OptionList'
import { TextField } from '../../ui/TextField'
import { BackButton, BackToLedger } from '../BackToLedger'
import { BACKUP_REMINDER_MESSAGE, lastBackupText } from '../backup/backupReminder'
import { InstallGuide } from '../install/InstallGuide'
import { browserInstallEnvironment, useInstallPrompt, type InstallEnvironment } from '../install/installPrompt'
import { browserKind, shouldOfferInstall } from '../install/installRules'
import { CarryoverField } from '../ledger/CarryoverField'
import type { SheetHistory } from '../useScreenHistory'
import './settings.css'

// 설정 화면 위에 뜨는 것들 (방문 기록 한 칸씩 — 뒤로 버튼은 이것만 닫는다)
const CLUB_NAME_PAGE = 'settings-club-name'
const CARRYOVER_PAGE = 'settings-carryover'
const YEAR_SHEET = 'settings-year'
const INSTALL_GUIDE_SHEET = 'settings-install-guide'

type SettingsScreenProps = {
  bookName: string // 지금 장부 이름 (SPEC-005, 화면 글자는 #88 전까지 "동아리 이름")
  year: number
  yearChoices: number[] // 장부가 있는 연도 + 올해, 최신 순
  ledger: Ledger | undefined // 고른 연도 장부. 아직 없으면 undefined
  // 편집 화면·연도 선택 창을 여닫는 방문 기록
  sheets: SheetHistory
  // 한 달 넘게 백업하지 않았으면 제목 아래 안내 띠 (SPEC-002, 장부 화면과 같은 띠)
  needsBackup?: boolean
  onChangeYear: (year: number) => void // 고르면 장부 화면으로 돌아가 그 해를 보여 준다
  onSaveClubInfo: (info: LedgerInfo) => void
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

// 설정 (SPEC-001 화면 구성, SPEC-002 백업): 묶음 제목 + 아이콘·이름·값·화살표 줄 목록.
// 이름·이월금 줄은 그 값 하나만 고치는 편집 화면을, 연도 줄은 선택 창을 연다
export function SettingsScreen({
  bookName,
  year,
  yearChoices,
  ledger,
  sheets,
  needsBackup = false,
  onChangeYear,
  onSaveClubInfo,
  lastBackupAt,
  onSendBackup,
  onImportBackup,
  onBack,
  install = browserInstallEnvironment(),
}: SettingsScreenProps) {
  const installPrompt = useInstallPrompt(install.installPrompt)

  if (ledger && sheets.sheet === CLUB_NAME_PAGE) {
    return (
      <ClubNameEdit
        name={bookName}
        onSave={(name) => {
          onSaveClubInfo({ name, carryover: ledger.carryover })
          sheets.closeSheet()
        }}
        onBack={sheets.closeSheet}
      />
    )
  }
  if (ledger && sheets.sheet === CARRYOVER_PAGE) {
    return (
      <CarryoverEdit
        ledger={ledger}
        onSave={(carryover) => {
          onSaveClubInfo({ name: bookName, carryover })
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

      <SettingsGroup title="동아리">
        {ledger ? (
          <>
            <SettingRow icon="users" title="동아리 이름" value={bookName} onClick={() => sheets.openSheet(CLUB_NAME_PAGE)} />
            <SettingRow
              icon="bank"
              title="작년 이월금"
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

// 설정 줄: 원형 아이콘 + 이름(+ 보조 줄) + 값 + 화살표. 줄 전체가 버튼이라 "동아리 이름 한랑드림" 으로 읽힌다
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

function ClubNameEdit({ name, onSave, onBack }: { name: string; onSave: (name: string) => void; onBack: () => void }) {
  const [clubName, setClubName] = useState(name)
  const missingName = clubName.trim() === ''
  const changed = clubName.trim() !== name

  return (
    <EditPage title="동아리 이름 바꾸기" canSave={!missingName && changed} onSave={() => onSave(clubName)} onBack={onBack}>
      <TextField
        label="동아리 이름"
        labelRole="label"
        value={clubName}
        onChange={setClubName}
        error={missingName ? '동아리 이름을 적어주세요' : undefined}
      />
    </EditPage>
  )
}

function CarryoverEdit({ ledger, onSave, onBack }: { ledger: Ledger; onSave: (carryover: number) => void; onBack: () => void }) {
  const [carryover, setCarryover] = useState(ledger.carryover)

  return (
    <EditPage
      title="작년 이월금 바꾸기"
      canSave={carryover !== ledger.carryover}
      onSave={() => onSave(carryover)}
      onBack={onBack}
    >
      <CarryoverField value={carryover} onChange={setCarryover} labelRole="label" />
    </EditPage>
  )
}
