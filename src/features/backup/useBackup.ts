// 백업 파일 보내기·불러오기 흐름 (SPEC-002 백업). 설정 카드·안내 띠·첫 실행 화면이 같은 동작을 쓰도록 App 에 하나만 둔다
import { useState, type ChangeEvent } from 'react'
import { createBackup, readBackup, type BackupSummary } from '../../storage/backup'
import type { StoredData } from '../../domain/types'
import type { LedgerState } from '../ledger/useLedger'
import type { SheetHistory } from '../useScreenHistory'
import { importConfirmTitle, importFailureMessage, REPLACE_WARNING, restoreFailureMessage } from './backupMessages'
import { sendFile } from './sendFile'

// 떠 있는 창: 불러올지 묻기 / 열 수 없거나 불러오지 못했다는 알림 (버튼 하나)
export type BackupDialog =
  | { kind: 'confirm'; title: string; description?: string; danger: boolean }
  | { kind: 'notice'; title: string; description: string }

export interface BackupFlow {
  send: () => Promise<boolean> // [기록 파일 보내기]. 보냈거나 내려받았으면 true (공유 화면을 그냥 닫았으면 false)
  startImport: () => void // [기록 파일 불러오기]: 파일 고르기 창을 연다
  attachFileInput: (input: HTMLInputElement | null) => void // 숨은 파일 고르기 칸 (callback ref)
  onFileChosen: (event: ChangeEvent<HTMLInputElement>) => void
  dialog: BackupDialog | undefined
  confirm: () => void // 확인 창 [불러오기] / 알림 [확인]
  close: () => void // 확인 창 [아니요], Esc
}

interface BackupOptions {
  now: () => Date
  onRestored: () => void // 불러와 저장까지 했다 (장부로 돌아가 알린다)
  onSent: (message: string) => void // 보냈다 (알림 문구)
  // 확인·알림 창을 방문 기록 한 칸으로 연다 (뒤로 버튼은 창만 닫는다 = [아니요], #110)
  dialogs: Pick<SheetHistory, 'openDialog' | 'closeDialog'>
}

// 백업 불러오기 확인·알림 창 이름
const BACKUP_DIALOG = 'backup'

type Pending = { data: StoredData; summary: BackupSummary }

export function useBackup(
  ledger: Pick<LedgerState, 'data' | 'restoreBackup' | 'recordBackup'>,
  { now, onRestored, onSent, dialogs }: BackupOptions,
): BackupFlow {
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null)
  const [pending, setPending] = useState<Pending | undefined>()
  const [notice, setNotice] = useState<{ title: string; description: string } | undefined>()

  const hasRecords = ledger.data.books.length > 0

  // 창을 비운다 ([아니요]·Esc·뒤로 버튼)
  function clear() {
    setNotice(undefined)
    setPending(undefined)
  }

  // 확인 창이든 알림이든 창 하나. 이미 떠 있으면(불러오기 실패 알림) 칸을 바꿔 끼운다
  function showDialog() {
    dialogs.openDialog(BACKUP_DIALOG, clear)
  }

  async function readChosenFile(file: File) {
    let text: string
    try {
      text = await file.text()
    } catch {
      setNotice(importFailureMessage('broken'))
      showDialog()
      return
    }
    const result = readBackup(text)
    if (result.ok) setPending({ data: result.data, summary: result.summary })
    else setNotice(importFailureMessage(result.reason))
    showDialog()
  }

  function restorePending(chosen: Pending) {
    setPending(undefined)
    const result = ledger.restoreBackup(chosen.data)
    // 불러왔으면 부른 쪽이 장부로 돌아간다 (backToLedger 가 창의 칸까지 되돌린다). 못 했으면 같은 창을 알림으로 바꾼다
    if (result.ok) onRestored()
    else {
      setNotice(restoreFailureMessage(result.reason))
      showDialog()
    }
  }

  function dialog(): BackupDialog | undefined {
    if (notice) return { kind: 'notice', ...notice }
    if (!pending) return undefined
    // 지금 기록이 있으면 바뀐다고 알리고 확인 버튼을 위험 색으로 (되돌릴 수 없다)
    return {
      kind: 'confirm',
      title: importConfirmTitle(pending.summary),
      description: hasRecords ? REPLACE_WARNING : undefined,
      danger: hasRecords,
    }
  }

  return {
    send: () => {
      // 공유 화면은 누른 순간에만 열리므로 파일을 만들자마자 바로 보낸다
      const backup = createBackup(ledger.data, now())
      const file = new File([backup.text], backup.fileName, { type: 'text/plain' })
      return sendFile(file).then((result) => {
        // 공유 화면을 그냥 닫았으면 보낸 것이 아니다: 백업 시각을 남기지 않고 조용히 둔다
        if (result === 'cancelled') return false
        ledger.recordBackup()
        onSent(result === 'shared' ? '기록 파일을 보냈어요' : '기록 파일을 다운로드 폴더에 저장했어요')
        return true
      })
    },
    startImport: () => fileInput?.click(),
    attachFileInput: setFileInput,
    onFileChosen: (event) => {
      const file = event.target.files?.[0]
      // 같은 파일을 다시 골라도 change 가 오도록 비운다
      event.target.value = ''
      if (file) void readChosenFile(file)
    },
    dialog: dialog(),
    confirm: () => {
      if (notice) {
        setNotice(undefined)
        dialogs.closeDialog()
      } else if (pending) restorePending(pending)
    },
    close: () => {
      clear()
      dialogs.closeDialog()
    },
  }
}
