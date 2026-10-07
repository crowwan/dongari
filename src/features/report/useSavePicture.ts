import { useRef, useState } from 'react'
import type { PictureSaver } from './savePicture'

export const SAVED_MESSAGE = '사진을 저장했어요. 갤러리의 Download 앨범에서 볼 수 있어요'
export const FAILED_MESSAGE = '사진을 만들지 못했어요. 다시 눌러 주세요'
// 아이폰: 공유 시트에서 고름 / 공유 시트를 못 써서 내려받음
export const PHOTOS_SAVED_MESSAGE = '사진 앱에 저장했어요'
export const FILES_SAVED_MESSAGE = '사진을 저장했어요. 파일 앱의 다운로드 폴더에서 볼 수 있어요'

type UseSavePictureOptions = {
  fileName: string
  saver: PictureSaver
  // 결과 알림. 알림(Toast)은 App 이 하나만 가진다
  onNotify: (message: string) => void
}

// 아이폰에서 사진은 다 만들었는데, 만드는 사이 누른 순간이 지나 공유 시트가 거부된 사진
type ReadyPicture = { picture: Blob; fileName: string }

// [사진으로 저장] 흐름: targetRef 영역을 사진으로 만들어 폰에 넣고 결과를 알린다. 만드는 동안(saving) 다시 눌러도 무시한다.
// 아이폰은 공유 시트를 누른 순간 안에서만 열 수 있어, 거부되면 만든 사진을 들고 있다가(ready) 한 번 더 누를 때 바로 연다
export function useSavePicture({ fileName, saver, onNotify }: UseSavePictureOptions) {
  const targetRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  // 화면이 다시 그려지기 전에 연달아 눌려도 한 번만 만들도록 바로 바뀌는 값으로 막는다
  const savingRef = useRef(false)
  const [held, setHeld] = useState<ReadyPicture>()
  // 다른 달 사진은 쓰지 않는다
  const ready = held?.fileName === fileName ? held.picture : undefined

  // 만든 사진을 폰에 넣는다. 아이폰은 공유 시트(사진 앱), 그 밖이나 공유 시트를 못 쓰면 내려받기
  async function deliver(picture: Blob, canRetry: boolean) {
    if (saver.share) {
      const result = await saver.share(new File([picture], fileName, { type: 'image/png' }))
      if (result === 'shared') return onNotify(PHOTOS_SAVED_MESSAGE)
      // 공유 시트를 그냥 닫았다: 실패가 아니니 조용히 둔다
      if (result === 'cancelled') return
      if (result === 'notAllowed' && canRetry) return setHeld({ picture, fileName })
    }
    saver.download(picture, fileName)
    onNotify(saver.share ? FILES_SAVED_MESSAGE : SAVED_MESSAGE)
  }

  async function save() {
    const target = targetRef.current
    if (savingRef.current || !target) return
    savingRef.current = true
    setSaving(true)
    setHeld(undefined)
    try {
      // 준비된 사진은 다시 만들지 않는다. 기다리는 것 없이 불러야 누른 순간 안에서 공유 시트가 열린다
      if (ready) await deliver(ready, false)
      else await deliver(await saver.make(target), true)
    } catch {
      onNotify(FAILED_MESSAGE)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return { targetRef, saving, ready: ready !== undefined, sharesToPhotos: saver.share !== undefined, save }
}
