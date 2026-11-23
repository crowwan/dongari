import type { ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { BackButton } from '../BackToLedger'
import './settings.css'

type EditPageProps = {
  title: string
  // 저장할 수 있는가 (바꾼 것이 있고 빠진 것이 없다)
  canSave: boolean
  onSave: () => void
  onBack: () => void
  // 맨 위 [‹ …] 이름: 설정 편집 화면은 "설정", 회원 명단 안 화면은 "회원 명단" (SPEC-010 6절)
  backLabel?: string
  // 주 버튼 글자 (회원 넣기는 "넣기")
  saveLabel?: string
  // 주 버튼 아래 큰 구획 (회원 정보의 [이 회원 지우기])
  footer?: ReactNode
  children: ReactNode
}

// 설정 값 하나를 고치는 화면: [‹ 설정] → 제목 → 입력칸 → [저장]. 선택 창 대신 화면을 통째로 쓴다 —
// 폰 키패드가 올라와도 칸과 [저장] 이 가려지지 않고, 큰 글씨로 늘어나도 한 화면에 들어간다 (SPEC-001 설정)
export function EditPage({ title, canSave, onSave, onBack, backLabel = '설정', saveLabel = '저장', footer, children }: EditPageProps) {
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
        <BackButton label={backLabel} onBack={onBack} />
        <h1 className="screen__title">{title}</h1>
      </div>
      {children}
      <Button type="submit" icon="check" disabled={!canSave}>
        {saveLabel}
      </Button>
      {footer}
    </form>
  )
}
