import { useState } from 'react'
import type { LedgerInfo } from '../../domain/ledger'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/TextField'
import { CarryoverField } from './CarryoverField'
import './ledger.css'

type StartLedgerScreenProps = {
  // first: 장부가 하나도 없다 / new-year: 다른 연도 장부는 있고 고른 연도 장부만 없다
  kind: 'first' | 'new-year'
  year: number
  // 입력칸 처음 값 (새 연도면 앞선 장부의 이름, 전년도 잔액)
  defaults: LedgerInfo
  onStart: (info: LedgerInfo) => void
}

// 장부 시작 화면 (SPEC-001 첫 실행): 동아리 이름과 이월금 두 칸만 묻는다
export function StartLedgerScreen({ kind, year, defaults, onStart }: StartLedgerScreenProps) {
  const [clubName, setClubName] = useState(defaults.name)
  const [carryover, setCarryover] = useState(defaults.carryover)
  const missingName = clubName.trim() === ''

  return (
    <form
      className="screen screen--groups"
      data-testid="start-ledger-screen"
      data-kind={kind}
      onSubmit={(event) => {
        event.preventDefault()
        if (!missingName) onStart({ name: clubName, carryover })
      }}
    >
      {kind === 'first' ? (
        <div className="ledger__intro">
          <h1 className="screen__title">동아리 회계를 시작해 볼까요?</h1>
          <p className="screen__lead">두 가지만 적으면 바로 쓸 수 있어요.</p>
        </div>
      ) : (
        <div className="ledger__intro">
          <h1 className="screen__title">{year}년 장부를 시작할까요?</h1>
          <p className="screen__lead">앞선 장부에서 동아리 이름과 잔액을 채워 두었어요. 다르면 고쳐 주세요.</p>
        </div>
      )}

      <TextField label="동아리 이름" value={clubName} placeholder="예: 한랑드림" onChange={setClubName} />
      {/* 이월금 칸과 그 안내는 한 묶음 */}
      <div className="ledger__field-group">
        <CarryoverField value={carryover} onChange={setCarryover} />
        <p className="screen__note">모르면 0으로 두고 나중에 설정에서 바꿀 수 있어요.</p>
      </div>

      <div className="ledger__submit">
        {missingName && <p className="screen__note ledger__submit-why">동아리 이름을 적어주세요</p>}
        <Button type="submit" disabled={missingName}>
          시작하기
        </Button>
      </div>
    </form>
  )
}
