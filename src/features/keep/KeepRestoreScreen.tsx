import { useState } from 'react'
import type { StoredData } from '../../domain/types'
import type { SaveResult } from '../../storage/LedgerRepository'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { TextField } from '../../ui/TextField'
import { BackButton } from '../BackToLedger'
import type { SheetHistory } from '../useScreenHistory'
import { restoreFailureMessage } from '../backup/backupMessages'
import { IN_APP_WORDS } from '../install/inAppBrowser'
import { fetchKept, type FetchKeptResult } from './keepRestore'
import type { KeepServer } from './keepServer'
import { keptAtText } from './keepStatus'
import { formatCodeInput } from './recoveryCode'
import './keep.css'

type KeepRestoreScreenProps = {
  server: KeepServer
  hasRecords: boolean // 이 폰에 장부가 있다 (바꾸면 지워진다고 알리고 [바꾸기] 를 위험 색으로)
  // 받아 온 데이터로 전체 바꾸기 (백업 불러오기와 같은 길). 성공하면 부른 쪽이 장부로 돌아간다
  onRestore: (data: StoredData) => SaveResult
  backLabel: string // 맨 위 되돌아가기 글자 (설정에서 왔으면 "설정", 첫 실행이면 "뒤로")
  onBack: () => void
  // 확인 창을 방문 기록 한 칸으로 연다 (설정 편집 화면 위에도 한 칸 더. 뒤로 버튼은 확인 창만 닫는다, #110)
  dialogs: Pick<SheetHistory, 'dialog' | 'openDialog' | 'closeDialog'>
  // 카톡에서 옮겨 와 열었을 때 (SPEC-009 C ③): 클립보드에서 읽은 코드를 미리 넣는다. 못 읽었으면 붙여 넣는 법을 한 줄 더한다
  fromKakao?: { code: string | undefined }
}

const CONFIRM_DIALOG = 'keep-restore'

type Found = Extract<FetchKeptResult, { status: 'found' }>

const FIELD_LABEL = '복구 코드를 넣어 주세요'
const CODE_LENGTH = 16

const FETCH_FAILURE: Record<Exclude<FetchKeptResult['status'], 'found'>, string> = {
  'not-found': '이 코드로 보관된 기록이 없어요. 코드를 다시 확인해 주세요',
  offline: '인터넷에 연결한 뒤 다시 눌러 주세요',
  failed: '보관본을 받아 오지 못했어요. 잠시 뒤 다시 눌러 주세요',
}

// 복구 코드로 불러오기 (SPEC-006): 글 칸(4자씩 자동 끊기) → [불러오기] → 받아 와 풀기 → 확인 창(보관한 때·장부·기록 수) → 바꾸기.
// 설정 "기록 지키기" 와 첫 실행(새 장부 만들기) 화면에서 연다
export function KeepRestoreScreen({ server, hasRecords, onRestore, backLabel, onBack, dialogs, fromKakao }: KeepRestoreScreenProps) {
  const [code, setCode] = useState(fromKakao?.code ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [found, setFound] = useState<Found | undefined>()
  const complete = code.replaceAll('-', '').length === CODE_LENGTH

  async function fetchCode() {
    setLoading(true)
    setError(undefined)
    const result = await fetchKept(server, code)
    setLoading(false)
    if (result.status === 'found') {
      setFound(result)
      dialogs.openDialog(CONFIRM_DIALOG, () => setFound(undefined))
    } else setError(FETCH_FAILURE[result.status])
  }

  function replace(chosen: Found) {
    setFound(undefined)
    // 바꿨으면 부른 쪽이 장부로 돌아가며 확인 창 칸까지 되돌린다
    const result = onRestore(chosen.data)
    if (result.ok) return
    dialogs.closeDialog()
    const { title, description } = restoreFailureMessage(result.reason)
    setError(`${title}. ${description}`)
  }

  return (
    <div className="screen screen--groups keep-restore" data-testid="keep-restore-screen">
      <div className="keep-restore__head">
        <BackButton label={backLabel} onBack={onBack} />
        <h1 className="screen__title">복구 코드로 불러오기</h1>
      </div>

      <div className="keep-restore__question">
        <TextField
          label={FIELD_LABEL}
          value={code}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoCapitalize="characters"
          error={error}
          onChange={(value) => {
            setCode(formatCodeInput(value))
            setError(undefined)
          }}
        />
        <p className="screen__note">예전 폰 설정 맨 위에 있던 16자예요. 4자마다 줄표는 저절로 들어가요.</p>
        {fromKakao && fromKakao.code === undefined && <p className="screen__note">{IN_APP_WORDS.pasteHint}</p>}
      </div>

      <BottomActionBar
        label={loading ? '불러오는 중이에요' : '불러오기'}
        icon="download"
        disabled={!complete || loading}
        note={complete ? undefined : '16자를 모두 넣어 주세요'}
        onClick={() => void fetchCode()}
      />

      <ConfirmDialog
        open={dialogs.dialog === CONFIRM_DIALOG && found !== undefined}
        title="보관본으로 바꿀까요?"
        description={hasRecords ? '이 폰에 있던 기록은 지워져요' : undefined}
        confirmLabel="바꾸기"
        danger={hasRecords}
        onConfirm={() => found && replace(found)}
        onCancel={() => {
          setFound(undefined)
          dialogs.closeDialog()
        }}
      >
        {found && (
          <KeptSummary
            savedAt={found.savedAt}
            bookCount={found.summary.bookCount}
            bookNames={found.bookNames}
            entryCount={found.summary.entryCount}
          />
        )}
      </ConfirmDialog>
    </div>
  )
}

type KeptSummaryProps = {
  savedAt: string
  bookCount: number
  bookNames: string[]
  entryCount: number
}

// 확인 창 안 보관본 요약: 보관한 때 / 장부 "2개 (한랑드림, 우리집 가계부)" / 기록 "128건" (시안 KeepConfirm)
export function KeptSummary({ savedAt, bookCount, bookNames, entryCount }: KeptSummaryProps) {
  return (
    <dl className="keep-restore__facts" data-testid="keep-restore-facts">
      <div className="keep-restore__fact">
        <dt>보관한 때</dt>
        <dd>{keptAtText(savedAt)}</dd>
      </div>
      <div className="keep-restore__fact">
        <dt>장부</dt>
        {/* 장부가 없는 보관본이면 "0개" */}
        <dd>{bookNames.length === 0 ? `${bookCount}개` : `${bookCount}개 (${bookNames.join(', ')})`}</dd>
      </div>
      <div className="keep-restore__fact">
        <dt>기록</dt>
        <dd>{`${entryCount}건`}</dd>
      </div>
    </dl>
  )
}
