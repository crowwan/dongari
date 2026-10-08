import { useState } from 'react'
import type { BookInfo } from '../../domain/ledger'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/TextField'
import { CarryoverField } from './CarryoverField'
import './ledger.css'

type StartLedgerScreenProps = {
  year: number
  // 이월금 칸 이름 (장부 종류별: 동아리 "작년 이월금", 가계부 "작년에서 넘어온 돈", SPEC-005)
  carryoverLabel: string
  // 입력칸 처음 값 (앞선 장부의 이름, 전년도 잔액)
  defaults: BookInfo
  onStart: (info: BookInfo) => void
}

// 새 연도 장부 시작 화면 (SPEC-001 첫 실행 "새 연도"): 지금 장부에 다른 연도 장부는 있고 고른 연도 장부만 없을 때 장부 이름과 이월금 두 칸만 묻는다.
// 장부가 하나도 없는 첫 실행은 새 장부 만들기 화면 (SPEC-005)
export function StartLedgerScreen({ year, carryoverLabel, defaults, onStart }: StartLedgerScreenProps) {
  const [bookName, setBookName] = useState(defaults.name)
  const [carryover, setCarryover] = useState(defaults.carryover)
  const missingName = bookName.trim() === ''

  return (
    <form
      className="screen screen--groups"
      data-testid="start-ledger-screen"
      onSubmit={(event) => {
        event.preventDefault()
        if (!missingName) onStart({ name: bookName, carryover })
      }}
    >
      <div className="ledger__intro">
        <h1 className="screen__title">{year}년 장부를 시작할까요?</h1>
        <p className="screen__lead">앞선 장부에서 장부 이름과 잔액을 채워 두었어요. 다르면 고쳐 주세요.</p>
      </div>

      <TextField label="장부 이름" value={bookName} onChange={setBookName} />
      {/* 이월금 칸과 그 안내는 한 묶음 */}
      <div className="ledger__field-group">
        <CarryoverField label={carryoverLabel} value={carryover} onChange={setCarryover} />
        <p className="screen__note">모르면 0으로 두고 나중에 설정에서 바꿀 수 있어요.</p>
      </div>

      <div className="ledger__submit">
        {missingName && <p className="screen__note ledger__submit-why">장부 이름을 적어 주세요</p>}
        <Button type="submit" disabled={missingName}>
          시작하기
        </Button>
      </div>
    </form>
  )
}
