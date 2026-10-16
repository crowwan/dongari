import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PictureSaver } from './savePicture'

export const SAVED_MESSAGE = '사진을 저장했어요. 갤러리의 Download 앨범에서 볼 수 있어요'
export const FAILED_MESSAGE = '사진을 만들지 못했어요. 다시 눌러 주세요'
// 아이폰: 공유 시트에서 고름 / 공유 시트를 못 써서 내려받음
export const PHOTOS_SAVED_MESSAGE = '사진 앱에 저장했어요'
export const FILES_SAVED_MESSAGE = '사진을 저장했어요. 파일 앱의 다운로드 폴더에서 볼 수 있어요'
// [사진 보내기] 가 공유 창을 열지 못해 대신 내려받음 (갤럭시, SPEC-003 AC-15)
export const SEND_SAVED_MESSAGE = '사진을 저장했어요. 카톡에서 갤러리의 Download 앨범 사진을 골라 보내 주세요'

// 화면이 다 그려지고 글꼴·양식 크기가 자리 잡은 뒤에 사진을 미리 만든다 (화면 전환 애니메이션을 끊지 않게)
const PREPARE_DELAY_MS = 600

export type PictureAction = 'save' | 'send'

// 사진은 다 만들었는데, 만드는 사이 누른 순간이 지나 공유 창(시트)이 거부된 사진. 한 번 더 누르면 바로 연다
type HeldPicture = { action: PictureAction; picture: Blob; fileName: string }

// 만들고 있거나 만들어 둔 사진 (파일 이름 = 어떤 화면의 사진인지)
type PreparedPicture = { fileName: string; making: Promise<Blob>; picture?: Blob }

type UsePictureActionsOptions = {
  fileName: string
  saver: PictureSaver
  // 결과 알림. 알림(Toast)은 App 이 하나만 가진다
  onNotify: (message: string) => void
  // 사진으로 만들 것이 있는지 (기록 없는 올해 결산은 없음)
  enabled?: boolean
}

// 같은 화면 사진을 이미 만들고 있거나 만들어 두었으면 그것을 쓰고, 아니면 새로 만든다. 실패하면 잊어서 다음에 다시 만든다
function makeOnce(preparedRef: RefObject<PreparedPicture | undefined>, saver: PictureSaver, fileName: string, target: HTMLElement): Promise<Blob> {
  const current = preparedRef.current
  if (current?.fileName === fileName) return current.making
  const entry: PreparedPicture = { fileName, making: saver.make(target) }
  preparedRef.current = entry
  entry.making.then(
    (picture) => {
      entry.picture = picture
    },
    () => {
      if (preparedRef.current === entry) preparedRef.current = undefined
    },
  )
  return entry.making
}

// 월 정리·올해 결산 아래 두 버튼의 흐름 (SPEC-003): targetRef 영역을 사진으로 만들어
// - save: 폰에 넣는다 (갤럭시 내려받기, 아이폰 공유 시트 "이미지 저장")
// - send: 폰 공유 창에 넘긴다 (v2.6 [사진 보내기], 공유 창을 쓸 수 있는 폰만)
// 만드는 동안(busy) 두 버튼 모두 다시 눌러도 무시한다. 공유 창은 누른 순간 안에서만 열리므로
// 공유 창을 쓸 수 있으면 화면을 열 때 사진을 미리 만들어 두고, 그래도 거부되면 만든 사진을 들고 있다가(ready) 한 번 더 누를 때 바로 연다
export function usePictureActions({ fileName, saver, onNotify, enabled = true }: UsePictureActionsOptions) {
  const targetRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<PictureAction>()
  // 화면이 다시 그려지기 전에 연달아 눌려도 한 번만 만들도록 바로 바뀌는 값으로 막는다
  const busyRef = useRef(false)
  const [held, setHeld] = useState<HeldPicture>()
  const preparedRef = useRef<PreparedPicture>(undefined)
  const canSend = saver.send !== undefined

  // 공유 창을 쓸 수 있으면 화면(파일 이름)이 바뀔 때마다 사진을 미리 만든다. 실패는 조용히 두고 누를 때 다시 만든다
  useEffect(() => {
    if (!canSend || !enabled) return
    const timer = window.setTimeout(() => {
      const target = targetRef.current
      if (target && !busyRef.current) makeOnce(preparedRef, saver, fileName, target).catch(() => {})
    }, PREPARE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [canSend, enabled, fileName, saver])

  // 다른 화면(달·요약/결산표)의 사진은 쓰지 않는다
  function heldFor(action: PictureAction): Blob | undefined {
    return held?.action === action && held.fileName === fileName ? held.picture : undefined
  }

  // 만든 사진을 폰에 넣는다. 아이폰은 공유 시트(사진 앱), 그 밖이나 공유 시트를 못 쓰면 내려받기
  async function deliverSave(picture: Blob, canRetry: boolean) {
    if (saver.share) {
      const result = await saver.share(new File([picture], fileName, { type: 'image/png' }))
      if (result === 'shared') return onNotify(PHOTOS_SAVED_MESSAGE)
      // 공유 시트를 그냥 닫았다: 실패가 아니니 조용히 둔다
      if (result === 'cancelled') return
      if (result === 'notAllowed' && canRetry) return setHeld({ action: 'save', picture, fileName })
    }
    saver.download(picture, fileName)
    onNotify(saver.share ? FILES_SAVED_MESSAGE : SAVED_MESSAGE)
  }

  // 만든 사진을 공유 창에 넘긴다. 고르거나 닫으면 조용히 원래대로(공유 창이 닫혔다고 보낸 것은 아니다),
  // 거부되면 한 번 더 누르게 하고, 그래도 안 되거나 다른 이유로 실패하면 내려받고 갤러리에서 골라 보내라고 안내한다
  async function deliverSend(picture: Blob, canRetry: boolean) {
    if (!saver.send) return
    const result = await saver.send(new File([picture], fileName, { type: 'image/png' }))
    if (result === 'shared' || result === 'cancelled') return
    if (result === 'notAllowed' && canRetry) return setHeld({ action: 'send', picture, fileName })
    saver.download(picture, fileName)
    onNotify(saver.share ? FILES_SAVED_MESSAGE : SEND_SAVED_MESSAGE)
  }

  async function run(action: PictureAction, deliver: (picture: Blob, canRetry: boolean) => Promise<void>) {
    const target = targetRef.current
    if (busyRef.current || !target || !enabled) return
    // 들고 있던 사진이나 미리 만든 사진은 기다리는 것 없이 넘겨야 누른 순간 안에서 공유 창이 열린다
    const heldPicture = heldFor(action)
    const prepared = preparedRef.current?.fileName === fileName ? preparedRef.current.picture : undefined
    busyRef.current = true
    setBusy(action)
    setHeld(undefined)
    try {
      if (heldPicture) await deliver(heldPicture, false)
      else if (prepared) await deliver(prepared, true)
      else await deliver(await makeOnce(preparedRef, saver, fileName, target), true)
    } catch {
      onNotify(FAILED_MESSAGE)
    } finally {
      busyRef.current = false
      setBusy(undefined)
    }
  }

  return {
    targetRef,
    busy,
    saveReady: heldFor('save') !== undefined,
    sendReady: heldFor('send') !== undefined,
    sharesToPhotos: saver.share !== undefined,
    canSend,
    save: () => run('save', deliverSave),
    send: () => run('send', deliverSend),
  }
}
