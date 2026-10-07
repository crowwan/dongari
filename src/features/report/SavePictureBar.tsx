import { BottomActionBar } from '../../ui/BottomActionBar'

type SavePictureBarProps = {
  saving: boolean
  // 아이폰: 사진을 다 만들었고 한 번 더 누르면 공유 시트가 열린다
  ready?: boolean
  // 아이폰: 공유 시트의 "이미지 저장" 으로 사진 앱에 넣는다
  sharesToPhotos?: boolean
  onSave: () => void
  // 사진으로 만들 것이 없을 때 (기록 없는 올해 결산)
  disabled?: boolean
}

// 월 정리·올해 결산 아래 고정 [⬇ 사진으로 저장]. 만드는 동안은 "만드는 중…" 으로 바뀌고 누를 수 없다.
// 아이폰은 공유 시트에서 무엇을 고를지 버튼 위에 알려 주고, 사진이 준비돼 한 번 더 눌러야 하면 [사진 앱에 저장] 으로 바뀐다
export function SavePictureBar({ saving, ready = false, sharesToPhotos = false, onSave, disabled = false }: SavePictureBarProps) {
  return (
    <BottomActionBar
      icon="download"
      label={saving ? '만드는 중…' : ready ? '사진 앱에 저장' : '사진으로 저장'}
      onClick={onSave}
      disabled={disabled || saving}
      note={barNote(ready, sharesToPhotos && !disabled)}
    />
  )
}

function barNote(ready: boolean, sharesToPhotos: boolean): string | undefined {
  if (ready) return '사진이 준비됐어요. 한 번 더 눌러 주세요'
  if (sharesToPhotos) return "누른 다음 '이미지 저장'을 고르면 사진 앱에 들어가요"
  return undefined
}
