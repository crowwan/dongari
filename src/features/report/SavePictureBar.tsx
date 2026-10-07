import { BottomActionBar } from '../../ui/BottomActionBar'

type SavePictureBarProps = {
  saving: boolean
  onSave: () => void
  // 사진으로 만들 것이 없을 때 (기록 없는 올해 결산)
  disabled?: boolean
}

// 월 정리·올해 결산 아래 고정 [⬇ 사진으로 저장]. 만드는 동안은 "만드는 중…" 으로 바뀌고 누를 수 없다
export function SavePictureBar({ saving, onSave, disabled = false }: SavePictureBarProps) {
  return (
    <BottomActionBar
      icon="download"
      label={saving ? '만드는 중…' : '사진으로 저장'}
      onClick={onSave}
      disabled={disabled || saving}
    />
  )
}
