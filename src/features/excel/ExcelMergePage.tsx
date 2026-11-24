// 엑셀로 기존 장부에 넣기 — "어느 해를 넣을까요?" (SPEC-010 8절 "다른 장부에 넣기", F4, #169). 엑셀 조각(확인 화면 위 칸)이다.
// 넣을 장부(동아리·모임만) → 해 목록(앱 기록이 없는 해만 처음부터 체크, 시안 결정 E-4) → (앱 기록이 있는 해를 고르면) 경고 +
// [기록 파일 먼저 보내기] → [고른 해 넣기] → 확인 창 → 넣기. 확인 창 [넣기]·[바꾸기]를 누르기 전에는 아무것도 저장하지 않는다
import { useState } from 'react'
import { carryoverWords } from '../../domain/book'
import type { EntryDeps } from '../../domain/ledger'
import type { Book } from '../../domain/types'
import type { SaveFailureReason, SaveResult } from '../../storage/LedgerRepository'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { Button } from '../../ui/Button'
import { CheckList } from '../../ui/CheckList'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { formatAmount } from '../../ui/money'
import { NoticeBar } from '../../ui/NoticeBar'
import { OptionList } from '../../ui/OptionList'
import { BackButton } from '../BackToLedger'
import { bookKindIcon } from '../books/bookKindIcon'
import type { SheetHistory } from '../useScreenHistory'
import { excelMergeFailedMessage } from './excelMessages'
import { ExcelFact, ExcelFactValue, ExcelFacts, ExcelNote } from './ExcelParts'
import {
  defaultMergeYears,
  mergeImportedYears,
  mergePlan,
  mergeYearRows,
  type CarryoverGap,
  type ExcelMerge,
  type MergePlan,
  type MergeYearRow,
} from './mergeBook'
import type { ImportedBook } from './readExcelBook'

// 확인 창 (해 고르기 위 한 칸 — 뒤로 버튼은 창만 닫는다)
const MERGE_DIALOG = 'excel-merge-confirm'

// 확인 창의 이름 목록은 앞 몇 분만: 큰 글씨에서도 창이 한 화면에 들게 (합친 명단은 넣은 뒤 회원 명단에서 본다)
const SHOWN_NAMES = 5

// 이월금을 고치는 설정 줄 이름 (넣는 곳은 동아리·모임 장부만이라 그 종류의 말, SPEC-005)
const CARRYOVER_ROW = carryoverWords('club', false).label

const SOURCE_NAMES: Readonly<Record<CarryoverGap['carryoverFrom'], string>> = { app: '앱', excel: '엑셀' }

export type ExcelMergePageProps = {
  books: readonly Book[] // 넣을 수 있는 장부 (동아리·모임, 만든 순)
  imported: ImportedBook
  deps: Pick<EntryDeps, 'createId'> // 새로 넣는 회원 번호
  sheets: SheetHistory
  onBack: () => void // [‹ 읽은 내용]
  onSendBackup: () => void // [기록 파일 먼저 보내기]
  onMerge: (merge: ExcelMerge) => SaveResult // 확인 창 [넣기]·[바꾸기]. 기기에 저장하지 못했으면 그 이유
}

function yearOption({ year, excelCount, appCount }: MergeYearRow) {
  const excel = `엑셀 ${formatAmount(excelCount)}건`
  return {
    value: String(year),
    label: `${year}년`,
    detail: appCount === 0 ? `${excel} · 새로 넣어요` : `${excel} · 지금 앱 기록 ${formatAmount(appCount)}건 · 고르면 바꿔요`,
  }
}

function defaultYears(book: Book | undefined, imported: ImportedBook): number[] {
  return book ? defaultMergeYears(mergeYearRows(book, imported)) : []
}

// "강민지, 김도윤 외 3명"
function namesText(names: readonly string[]): string {
  const shown = names.slice(0, SHOWN_NAMES).join(', ')
  return names.length > SHOWN_NAMES ? `${shown} 외 ${formatAmount(names.length - SHOWN_NAMES)}명` : shown
}

// "2026년" / 여럿이면 "2026·2027년"
function yearsText(years: readonly number[]): string {
  return `${years.join('·')}년`
}

// 확인 창 설명: 바꾸는 해가 있으면 지워질 앱 기록, 없으면 넣는 엑셀 기록.
// 기록 0건인 해를 넣으면 [넣기]·"넣어요"여도 그 해 앱 값이 바뀌므로 한 문장을 더한다 (바꾸는 해 설명에서는 "되돌릴 수 없어요" 앞, #193)
function planDescription(bookName: string, plan: MergePlan): string {
  const emptyNote = plan.emptyYears.length > 0 ? [`${yearsText(plan.emptyYears)}은 이월금·월 회비·쉬는 달도 엑셀 값이 돼요`] : []
  if (plan.replaced.length === 0) return [`${bookName} 장부에 엑셀 기록 ${formatAmount(plan.entryCount)}건을 넣어요`, ...emptyNote].join('. ')
  const years = yearsText(plan.replaced.map((row) => row.year))
  const appCount = plan.replaced.reduce((sum, row) => sum + row.appCount, 0)
  return [`${bookName} 장부의 ${years} 앱 기록 ${formatAmount(appCount)}건은 지워지고 엑셀 기록으로 바뀌어요`, ...emptyNote, '되돌릴 수 없어요'].join('. ')
}

export function ExcelMergePage({ books, imported, deps, sheets, onBack, onSendBackup, onMerge }: ExcelMergePageProps) {
  // 넣을 장부: 하나면 고른 채 시작 (8절), 여럿이면 사람이 고른다
  const [bookId, setBookId] = useState(() => (books.length === 1 ? books[0]?.id : undefined))
  const book = books.find((item) => item.id === bookId)
  const [years, setYears] = useState(() => defaultYears(book, imported))
  // 넣기를 기기에 저장하지 못한 이유 (#172 처럼 이 화면 맨 위에 알린다)
  const [failure, setFailure] = useState<SaveFailureReason>()

  const rows = book ? mergeYearRows(book, imported) : []
  const plan = book && years.length > 0 ? mergePlan(book, imported, years) : undefined
  // 고른 해 중에 지워질 앱 기록(앱 기록이 있는 해)이 있을 때만 경고한다 — 그런 해는 빠진 채 시작해 처음 화면에는 없다 (#191 리뷰)
  const replacing = plan !== undefined && plan.replaced.length > 0
  const reason = !book ? '넣을 장부를 골라 주세요' : years.length === 0 ? '넣을 해를 골라 주세요' : undefined

  function chooseBook(id: string) {
    if (id === bookId) return
    setBookId(id)
    // 장부가 바뀌면 그 장부의 앱 기록으로 처음 체크를 다시 정한다
    setYears(defaultYears(books.find((item) => item.id === id), imported))
  }

  function toggleYear(value: string) {
    const year = Number(value)
    setYears((current) => (current.includes(year) ? current.filter((item) => item !== year) : [...current, year].sort((a, b) => a - b)))
  }

  function merge() {
    if (!book) return
    setFailure(undefined)
    const result = onMerge({ bookId: book.id, years, apply: (target) => mergeImportedYears(target, imported, years, deps) })
    if (result.ok) return
    // 저장하지 못했으면 아무것도 바뀌지 않았다: 창을 닫고 이 화면 맨 위에 알려 다시 누를 수 있게
    sheets.closeDialog()
    setFailure(result.reason)
    window.scrollTo(0, 0)
  }

  return (
    <div className="screen screen--stack excel excel-merge" data-testid="excel-merge-screen">
      {failure && <NoticeBar message={excelMergeFailedMessage(failure)} />}
      <div className="excel__head">
        <BackButton label="읽은 내용" onBack={onBack} />
        <h1 className="screen__title">어느 해를 넣을까요?</h1>
      </div>

      <div className="excel-import__group">
        <h2 className="excel-merge__heading">넣을 장부</h2>
        <OptionList
          label="넣을 장부"
          options={books.map((item) => ({ value: item.id, label: item.name, icon: bookKindIcon(item.kind) }))}
          value={bookId ?? null}
          onChange={chooseBook}
        />
      </div>

      {book && (
        <div className="excel-import__group">
          <h2 className="excel-merge__heading">넣을 해</h2>
          <CheckList label="넣을 해" options={rows.map(yearOption)} checked={years.map(String)} onToggle={toggleYear} />
        </div>
      )}

      {replacing && (
        <div className="excel-import__group">
          <ExcelNote tone="warn" title="고른 해의 앱 기록은 지워지고 엑셀 기록으로 바뀌어요">
            되돌릴 수 없으니 먼저 기록 파일을 보내 두세요
          </ExcelNote>
          <Button variant="secondary" icon="share" onClick={onSendBackup}>
            기록 파일 먼저 보내기
          </Button>
        </div>
      )}

      <BottomActionBar
        label="고른 해 넣기"
        icon="check"
        disabled={reason !== undefined}
        note={reason}
        onClick={() => {
          if (reason === undefined) sheets.openDialog(MERGE_DIALOG)
        }}
      />

      {book && plan && (
        <MergeConfirmDialog
          open={sheets.dialog === MERGE_DIALOG}
          bookName={book.name}
          yearCount={years.length}
          plan={plan}
          onConfirm={merge}
          onCancel={sheets.closeDialog}
        />
      )}
    </div>
  )
}

type MergeConfirmDialogProps = {
  open: boolean
  bookName: string
  yearCount: number
  plan: MergePlan
  onConfirm: () => void
  onCancel: () => void
  inline?: boolean // 카탈로그 견본
}

// 확인 창 "N개 해를 넣을까요?": 바꾸는 해가 있으면 지워질 앱 기록을 말하고 위험 [바꾸기], 없으면 [넣기].
// 아래 사실 카드에 합칠 회원·새 회원·이어지지 않는 이월금, 카드 밑에 이월금을 고칠 곳
export function MergeConfirmDialog({ open, bookName, yearCount, plan, onConfirm, onCancel, inline }: MergeConfirmDialogProps) {
  const replacing = plan.replaced.length > 0
  return (
    <ConfirmDialog
      open={open}
      title={`${formatAmount(yearCount)}개 해를 넣을까요?`}
      description={planDescription(bookName, plan)}
      confirmLabel={replacing ? '바꾸기' : '넣기'}
      danger={replacing}
      onConfirm={onConfirm}
      onCancel={onCancel}
      inline={inline}
    >
      <MergeFacts plan={plan} />
    </ConfirmDialog>
  )
}

// 확인 창 안 회색 사실 카드: 이름이 같아 합칠 분 / 새로 넣을 분(8절 "합칠 이름 목록을 확인 창에") / 이어지지 않는 이월금(#193).
// 이월금 줄이 있으면 카드 바로 밑에 고칠 곳 한 줄. 줄이 하나도 없으면 카드가 없다
function MergeFacts({ plan }: { plan: MergePlan }) {
  const { mergedNames, addedNames, carryoverGaps } = plan
  if (mergedNames.length === 0 && addedNames.length === 0 && carryoverGaps.length === 0) return null
  return (
    <div className="excel-merge__facts">
      <ExcelFacts label="넣을 내용" variant="sheet">
        {mergedNames.length > 0 && (
          <ExcelFact label="합칠 회원">
            <ExcelFactValue main={namesText(mergedNames)} sub={`${formatAmount(mergedNames.length)}명 · 앱 명단과 이름이 같아요`} />
          </ExcelFact>
        )}
        {addedNames.length > 0 && (
          <ExcelFact label="새 회원">
            <ExcelFactValue main={namesText(addedNames)} sub={`${formatAmount(addedNames.length)}명`} />
          </ExcelFact>
        )}
        {carryoverGaps.map((gap) => (
          <CarryoverGapFact key={gap.year} gap={gap} />
        ))}
      </ExcelFacts>
      {carryoverGaps.length > 0 && (
        <p className="excel-merge__fix">{`넣은 뒤 ${yearsText(carryoverGaps.map((gap) => gap.year))} 장부의 설정 › ${CARRYOVER_ROW}에서 고칠 수 있어요`}</p>
      )}
    </div>
  )
}

// 이월금 한 줄: 이름 = 고칠 값(뒤 해 이월금), 값 = 그 이월금과 어느 쪽 값인지, 작은 글자 = 비교한 앞 해 끝 잔액과 어느 쪽 값인지
function CarryoverGapFact({ gap }: { gap: CarryoverGap }) {
  const balanceFrom: CarryoverGap['carryoverFrom'] = gap.carryoverFrom === 'app' ? 'excel' : 'app'
  return (
    <ExcelFact label={`${gap.year}년 이월금`}>
      <ExcelFactValue
        main={`${SOURCE_NAMES[gap.carryoverFrom]} ${formatAmount(gap.carryover)}원`}
        sub={`${SOURCE_NAMES[balanceFrom]} ${gap.year - 1}년 끝 잔액 ${formatAmount(gap.previousBalance)}원과 달라요`}
      />
    </ExcelFact>
  )
}
