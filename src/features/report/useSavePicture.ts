import { useRef, useState } from 'react'
import type { PictureSaver } from './savePicture'

export const SAVED_MESSAGE = '사진을 저장했어요. 갤러리의 Download 앨범에서 볼 수 있어요'
export const FAILED_MESSAGE = '사진을 만들지 못했어요. 다시 눌러 주세요'

type UseSavePictureOptions = {
  fileName: string
  saver: PictureSaver
  // 결과 알림. 알림(Toast)은 App 이 하나만 가진다
  onNotify: (message: string) => void
}

// [사진으로 저장] 흐름: targetRef 영역을 사진으로 만들어 내려받고 결과를 알린다. 만드는 동안(saving) 다시 눌러도 무시한다
export function useSavePicture({ fileName, saver, onNotify }: UseSavePictureOptions) {
  const targetRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  // 화면이 다시 그려지기 전에 연달아 눌려도 한 번만 만들도록 바로 바뀌는 값으로 막는다
  const savingRef = useRef(false)

  async function save() {
    const target = targetRef.current
    if (savingRef.current || !target) return
    savingRef.current = true
    setSaving(true)
    try {
      const picture = await saver.make(target)
      saver.download(picture, fileName)
      onNotify(SAVED_MESSAGE)
    } catch {
      onNotify(FAILED_MESSAGE)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return { targetRef, saving, save }
}
