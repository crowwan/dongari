import { ConfirmDialog } from '../../ui/ConfirmDialog'
import type { BackupFlow } from './useBackup'

// 백업 파일로 고를 수 있는 형식. 보내는 파일은 .txt(공유 화면 제약), 예전·직접 만든 .json 도 받는다
const BACKUP_FILE_ACCEPT = 'text/plain,application/json,.txt,.json'

// 백업 불러오기에 쓰는 숨은 파일 고르기 칸과 확인·알림 창
export function BackupDialogs({ backup: { dialog, attachFileInput, onFileChosen, confirm, close } }: { backup: BackupFlow }) {
  return (
    <>
      <input
        ref={attachFileInput}
        type="file"
        accept={BACKUP_FILE_ACCEPT}
        hidden
        aria-label="백업 파일 고르기"
        data-testid="backup-file-input"
        onChange={onFileChosen}
      />
      <ConfirmDialog
        open={dialog !== undefined}
        title={dialog?.title ?? ''}
        description={dialog?.description}
        confirmLabel={dialog?.kind === 'confirm' ? '불러오기' : '확인'}
        cancelLabel={dialog?.kind === 'confirm' ? '아니요' : null}
        danger={dialog?.kind === 'confirm' && dialog.danger}
        onConfirm={confirm}
        onCancel={close}
      />
    </>
  )
}
