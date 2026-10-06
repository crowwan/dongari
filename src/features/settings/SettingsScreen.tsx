import { useState } from 'react'
import type { LedgerInfo } from '../../domain/ledger'
import type { Ledger } from '../../domain/types'
import { Button } from '../../ui/Button'
import { ChoiceChip } from '../../ui/ChoiceChip'
import { TextField } from '../../ui/TextField'
import { BackToLedger } from '../BackToLedger'
import { lastBackupText } from '../backup/backupReminder'
import { CarryoverField } from '../ledger/CarryoverField'
import './settings.css'

type SettingsScreenProps = {
  year: number
  yearChoices: number[] // 장부가 있는 연도 + 올해, 최신 순
  ledger: Ledger | undefined // 고른 연도 장부. 아직 없으면 undefined
  onChangeYear: (year: number) => void // 고르면 장부 화면으로 돌아가 그 해를 보여 준다
  onSaveClubInfo: (info: LedgerInfo) => void
  lastBackupAt?: string // 마지막으로 백업 파일을 보낸 시각 (기록 백업 카드에 날짜로)
  onSendBackup: () => void
  onImportBackup: () => void
  onBack: () => void
}

// 설정 (SPEC-001 화면 구성): 동아리 정보, 장부 연도, 기록 백업(SPEC-002)
export function SettingsScreen({
  year,
  yearChoices,
  ledger,
  onChangeYear,
  onSaveClubInfo,
  lastBackupAt,
  onSendBackup,
  onImportBackup,
  onBack,
}: SettingsScreenProps) {
  return (
    <div className="screen" data-testid="settings-screen">
      <BackToLedger onBack={onBack} />
      <h1 className="screen__title">설정</h1>

      <section className="card" aria-labelledby="settings-club">
        <h2 className="card__title" id="settings-club">
          동아리 정보
        </h2>
        {ledger ? (
          // 연도를 바꾸면 그 해 장부 값으로 입력칸을 새로 채운다
          <ClubInfoForm key={ledger.year} ledger={ledger} onSave={onSaveClubInfo} />
        ) : (
          <p className="screen__note">{year}년 장부가 아직 없어요. 장부 화면에서 시작하면 여기서 고칠 수 있어요.</p>
        )}
      </section>

      <section className="card" aria-labelledby="settings-year">
        <h2 className="card__title" id="settings-year">
          장부 연도
        </h2>
        <p className="screen__note">지난 장부를 보려면 연도를 고르세요. 고르면 그 해 장부로 돌아가요.</p>
        <div className="settings__years" role="group" aria-label="장부 연도">
          {yearChoices.map((choice) => (
            <ChoiceChip key={choice} selected={choice === year} onClick={() => onChangeYear(choice)}>
              {choice}년
            </ChoiceChip>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="settings-backup" data-testid="settings-backup">
        <h2 className="card__title" id="settings-backup">
          기록 백업
        </h2>
        <p className="screen__note">
          폰을 바꾸거나 기록이 지워져도 백업 파일로 되살릴 수 있어요. 카톡 나에게 보내기나 드라이브에 보내 두세요.
        </p>
        <p className="settings__last-backup" data-testid="settings-last-backup">
          {lastBackupText(lastBackupAt)}
        </p>
        <div className="settings__actions">
          <Button variant="secondary" onClick={onSendBackup}>
            백업 파일 보내기
          </Button>
          <Button variant="secondary" onClick={onImportBackup}>
            백업 파일 불러오기
          </Button>
        </div>
      </section>
    </div>
  )
}

function ClubInfoForm({ ledger, onSave }: { ledger: Ledger; onSave: (info: LedgerInfo) => void }) {
  const [clubName, setClubName] = useState(ledger.clubName)
  const [carryover, setCarryover] = useState(ledger.carryover)
  const missingName = clubName.trim() === ''
  const changed = clubName.trim() !== ledger.clubName || carryover !== ledger.carryover

  return (
    <form
      className="settings__form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!missingName && changed) onSave({ clubName, carryover })
      }}
    >
      <TextField
        label="동아리 이름"
        value={clubName}
        onChange={setClubName}
        error={missingName ? '동아리 이름을 적어주세요' : undefined}
      />
      <CarryoverField value={carryover} onChange={setCarryover} />
      <Button type="submit" disabled={missingName || !changed}>
        바꾼 내용 저장
      </Button>
    </form>
  )
}
