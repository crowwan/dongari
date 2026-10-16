import type { Ref } from 'react'
import { BottomActionBar } from '../../ui/BottomActionBar'
import type { PictureAction } from './usePictureActions'

// 보내기 주 버튼 이름 (SPEC-003 v2.6 가칭, 바꾸기 쉽게 한 곳에). 카카오 전용이 아니라 폰 공유 창을 연다
export const SEND_LABEL = '사진 보내기'
// 공유 창이 거부돼 만든 사진을 들고 한 번 더 누르게 할 때
export const SEND_AGAIN_LABEL = '한 번 더 눌러 보내기'
const MAKING_LABEL = '만드는 중…'
const READY_NOTE = '사진이 준비됐어요. 한 번 더 눌러 주세요'
const PHOTOS_NOTE = "누른 다음 '이미지 저장'을 고르면 사진 앱에 들어가요"

type SavePictureBarProps = {
  // 사진을 만드는 중인 버튼 (그동안 두 버튼 모두 누를 수 없다)
  busy?: PictureAction
  // 아이폰: 사진을 다 만들었고 한 번 더 누르면 공유 시트가 열린다 ([사진 앱에 저장])
  saveReady?: boolean
  // 사진을 다 만들었고 한 번 더 누르면 공유 창이 열린다 ([한 번 더 눌러 보내기])
  sendReady?: boolean
  // 아이폰: 공유 시트의 "이미지 저장" 으로 사진 앱에 넣는다
  sharesToPhotos?: boolean
  // 공유 창에 사진을 넘길 수 있는 폰: [사진 보내기] 를 주 버튼으로 함께 둔다. 아니면 [사진으로 저장] 하나만
  canSend?: boolean
  onSave: () => void
  onSend?: () => void
  // 사진으로 만들 것이 없을 때 (기록 없는 올해 결산)
  disabled?: boolean
  // [사진으로 저장] 버튼 자체 (올해 결산 안내 말풍선이 가리킬 때, SPEC-008)
  buttonRef?: Ref<HTMLButtonElement>
}

// 월 정리·올해 결산 아래 고정 버튼 (SPEC-003). 공유 창을 쓸 수 있으면 보조 [⬇ 사진으로 저장] + 주 [↗ 사진 보내기],
// 못 쓰면(PC 등) 주 [⬇ 사진으로 저장] 하나. 만드는 동안 누른 버튼은 "만드는 중…" 이고 두 버튼 모두 누를 수 없다.
// 아이폰은 공유 시트에서 무엇을 고를지 버튼 위에 알려 주고, 사진이 준비돼 한 번 더 눌러야 하면 그 버튼 이름이 바뀐다
export function SavePictureBar({
  busy,
  saveReady = false,
  sendReady = false,
  sharesToPhotos = false,
  canSend = false,
  onSave,
  onSend = () => {},
  disabled = false,
  buttonRef,
}: SavePictureBarProps) {
  const locked = disabled || busy !== undefined
  const saveLabel = busy === 'save' ? MAKING_LABEL : saveReady ? '사진 앱에 저장' : '사진으로 저장'
  const saveNote = saveReady ? READY_NOTE : sharesToPhotos && !disabled ? PHOTOS_NOTE : undefined

  if (!canSend) {
    return <BottomActionBar buttonRef={buttonRef} icon="download" label={saveLabel} onClick={onSave} disabled={locked} note={saveNote} />
  }

  return (
    <BottomActionBar
      icon="share"
      label={busy === 'send' ? MAKING_LABEL : sendReady ? SEND_AGAIN_LABEL : SEND_LABEL}
      onClick={onSend}
      disabled={locked}
      note={sendReady ? READY_NOTE : saveNote}
      noteFor={sendReady ? 'main' : 'secondary'}
      secondary={{ icon: 'download', label: saveLabel, onClick: onSave, disabled: locked }}
      secondaryRef={buttonRef}
    />
  )
}
