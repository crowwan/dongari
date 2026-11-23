// 엑셀 파일 읽기 → 읽은 내용 확인 (SPEC-010 8절 "흐름"·"읽은 내용 확인", #166). 이 파일은 엑셀 조각이다:
// 화면을 열 때 ExcelImportSlot 이 동적 import 로 받는다 (엑셀 읽기 규칙이 첫 화면 파일에 들어가지 않게).
// [새 장부 만들기]를 누르기 전에는 아무것도 저장하지 않는다. 읽는 중에 화면을 떠나면 읽기를 버린다
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { EntryDeps } from '../../domain/ledger'
import type { StoredData } from '../../domain/types'
import type { SaveFailureReason, SaveResult } from '../../storage/LedgerRepository'
import { BottomActionBar } from '../../ui/BottomActionBar'
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { formatAmount } from '../../ui/money'
import { MoneyInput } from '../../ui/MoneyInput'
import { NoticeBar } from '../../ui/NoticeBar'
import { TextField } from '../../ui/TextField'
import { BackToLedger } from '../BackToLedger'
import { EditPage } from '../settings/EditPage'
import type { SheetHistory } from '../useScreenHistory'
import { readExcelFile, type ExcelFileProblem, type PickedFile } from './excelFile'
import { excelCreateFailedMessage, type BackupFileRoute } from './excelMessages'
import { ExcelFact, ExcelFactValue, ExcelFacts, ExcelNote } from './ExcelParts'
import { ExcelProblem, ExcelReading } from './ExcelStatus'
import {
  balanceCheckText,
  feeLines,
  importedBookName,
  isNearKeepLimit,
  lineNoteLabel,
  unreadSheetsText,
  yearsText,
} from './importFacts'
import type { LineNote } from './ledgerSheet'
import { readExcelBook, type ExcelImportSummary, type ImportedBook } from './readExcelBook'
import type { ExcelWorkbook } from './sheet'
import './excelImport.css'

// 확인 화면 위에 뜨는 것 (방문 기록 한 칸 — 뒤로 버튼은 이것만 닫는다)
const FEE_PAGE = 'excel-fees'
const CHANGED_DATES_SHEET = 'excel-changed-dates'
const UNREAD_LINES_SHEET = 'excel-unread-lines'

export type ExcelImportScreenProps = {
  file: PickedFile // 고른 파일
  deps: EntryDeps // 기록·회원 번호와 적은 시각
  bookNames: readonly string[] // 지금 있는 장부 이름 (같은 이름이면 " (엑셀)")
  data: StoredData // 지금 저장 데이터 (자동으로 지키기 크기 경고)
  sheets: SheetHistory
  backupRoute: BackupFileRoute // 기록 파일을 골랐을 때 안내할 [기록 파일 불러오기] 자리
  onBack: () => void
  onPickAgain: () => void // 파일 고르기 창을 다시 연다
  onReload: () => void // [앱 다시 열기] (엑셀 기능을 받지 못했을 때)
  onCreate: (name: string, book: ImportedBook) => SaveResult // [새 장부 만들기]. 기기에 저장하지 못했으면 그 이유 (#172)
}

type Read = { book: ImportedBook; summary: ExcelImportSummary; workbook: ExcelWorkbook }

// 읽음: 자동으로 지키기 크기 경고는 읽을 때(월 회비를 고쳐 다시 읽을 때) 한 번만 센다 — 전체 데이터를 직렬화하므로
// 장부 이름을 칠 때마다 세지 않게 (#178 리뷰)
type Phase =
  | { name: 'reading' }
  | { name: 'failed'; problem: ExcelFileProblem }
  | { name: 'read'; read: Read; nearKeepLimit: boolean }

export function ExcelImportScreen({
  file,
  deps,
  bookNames,
  data,
  sheets,
  backupRoute,
  onBack,
  onPickAgain,
  onReload,
  onCreate,
}: ExcelImportScreenProps) {
  const [phase, setPhase] = useState<Phase>({ name: 'reading' })
  // 장부 이름 칸. 손대기 전에는 파일 이름에서 정한 값
  const [name, setName] = useState<string>()
  // 월 회비 고치기에서 사람이 바꾼 해만 (여러 번 고치면 쌓인다). 안 바꾼 해는 읽는 규칙대로 앞 해 값을 이어 쓴다 (#178 리뷰)
  const [fixedFees, setFixedFees] = useState<ReadonlyMap<number, number>>(() => new Map())
  // [새 장부 만들기]를 기기에 저장하지 못한 이유 (#178 리뷰, 이유별 문구 #172)
  const [createFailure, setCreateFailure] = useState<SaveFailureReason>()
  // [새 장부 만들기] 를 두 번 눌러 장부가 둘 생기지 않게
  const created = useRef(false)

  const readPhase = (read: Read): Phase => ({ name: 'read', read, nearKeepLimit: isNearKeepLimit(data, read.book) })
  const readFile = useEffectEvent(() => readExcelFile(file, deps))
  const showRead = useEffectEvent((read: Read) => setPhase(readPhase(read)))
  useEffect(() => {
    // 화면을 떠나면(읽는 중 [‹ 장부로]·뒤로 버튼) 읽은 결과를 버린다
    let alive = true
    readFile()
      .catch((): { ok: false; problem: ExcelFileProblem } => ({ ok: false, problem: 'not-excel' }))
      .then((result) => {
        if (!alive) return
        if (result.ok) showRead(result)
        else setPhase({ name: 'failed', problem: result.problem })
      })
    return () => {
      alive = false
    }
  }, [])

  if (phase.name === 'reading') return <ExcelReading fileName={file.name} onBack={onBack} />
  if (phase.name === 'failed') {
    return <ExcelProblem problem={phase.problem} route={backupRoute} onBack={onBack} onPickAgain={onPickAgain} onReload={onReload} />
  }

  const { read } = phase
  const { summary } = read

  if (sheets.sheet === FEE_PAGE) {
    return (
      <FeeEdit
        fees={summary.monthlyFees}
        onBack={sheets.closeSheet}
        onSave={(changed) => {
          // 바꾼 해만 고정해 낸 분 배수 판정을 다시 하며 처음부터 다시 읽는다 (8절 "월 회비", 스펙 "구현에서 정한 것")
          const fixed = new Map([...fixedFees, ...changed])
          const again = readExcelBook(read.workbook, deps, { monthlyFees: fixed })
          if (again.ok) {
            setFixedFees(fixed)
            setPhase(readPhase({ ...again, workbook: read.workbook }))
          }
          sheets.closeSheet()
        }}
      />
    )
  }

  const bookName = name ?? importedBookName(file.name, bookNames)
  const missingName = bookName.trim() === ''
  const unreadSheets = unreadSheetsText(summary.unreadSheets)

  return (
    <div className="screen screen--stack excel excel-import" data-testid="excel-import-screen">
      {/* 저장 실패 안내는 다른 화면의 저장 실패 안내 띠와 같은 자리(맨 위)에 */}
      {createFailure && <NoticeBar message={excelCreateFailedMessage(createFailure)} />}
      <div className="excel__head">
        <BackToLedger onBack={onBack} />
        <h1 className="screen__title">엑셀 파일을 읽었어요</h1>
      </div>
      <p className="excel-import__file">
        {file.name} · 시트 {summary.sheetCount}개 중 {summary.readSheets.length}개를 읽었어요
      </p>

      <div className="excel-import__group">
        <TextField label="장부 이름" value={bookName} onChange={setName} />
      </div>

      <div className="excel-import__group excel-import__facts-block">
        <ImportFacts summary={summary} />
        <Button variant="secondary" icon="pen" onClick={() => sheets.openSheet(FEE_PAGE)}>
          월 회비 고치기
        </Button>
      </div>

      <div className="excel-import__group excel-import__notes">
        <BalanceNote summary={summary} />
        {summary.unassignedDuesCount > 0 && (
          <ExcelNote tone="info" title={`낸 분을 다 못 나눈 회비 ${formatAmount(summary.unassignedDuesCount)}건`}>
            회원 이름이 섞인 입금은 회비로 넣고, 낸 분은 나중에 회비 표에서 붙여요. 회원 이름이 없는 입금(이자·찬조)은 엑셀 글이 항목
            이름이 돼요.
          </ExcelNote>
        )}
        {summary.changedDates.length > 0 && (
          <ExcelNote
            tone="warn"
            title={`날짜를 바꾼 줄 ${formatAmount(summary.changedDates.length)}건`}
            onOpen={() => sheets.openSheet(CHANGED_DATES_SHEET)}
          >
            그 달에 없는 날은 그 달 마지막 날로, 날을 읽을 수 없는 줄은 날짜 없이 넣었어요.
          </ExcelNote>
        )}
        {summary.unreadLines.length > 0 && (
          <ExcelNote
            tone="warn"
            title={`읽지 못한 줄 ${formatAmount(summary.unreadLines.length)}건`}
            onOpen={() => sheets.openSheet(UNREAD_LINES_SHEET)}
          >
            금액이나 날짜를 읽지 못해 넣지 않았어요. 필요하면 만든 뒤 직접 적어 주세요.
          </ExcelNote>
        )}
        {phase.nearKeepLimit && (
          <ExcelNote tone="warn" title="기록이 많아 자동으로 지키기를 못 할 수 있어요">
            장부는 만들 수 있어요. 가끔 기록 파일을 보내 두세요.
          </ExcelNote>
        )}
      </div>

      {unreadSheets && <p className="screen__note">{unreadSheets}</p>}

      <LineNotesSheet
        open={sheets.sheet === CHANGED_DATES_SHEET}
        title={`날짜를 바꾼 줄 ${formatAmount(summary.changedDates.length)}건`}
        notes={summary.changedDates}
        onClose={sheets.closeSheet}
      />
      <LineNotesSheet
        open={sheets.sheet === UNREAD_LINES_SHEET}
        title={`읽지 못한 줄 ${formatAmount(summary.unreadLines.length)}건`}
        notes={summary.unreadLines}
        onClose={sheets.closeSheet}
      />

      {/* 다른 장부에 넣기(F4)는 #169 에서 보조 버튼으로 붙인다 */}
      <BottomActionBar
        label="새 장부 만들기"
        icon="check"
        disabled={missingName}
        note={missingName ? '장부 이름을 적어 주세요' : undefined}
        onClick={() => {
          if (missingName || created.current) return
          created.current = true
          const result = onCreate(bookName.trim(), read.book)
          if (result.ok) return
          // 저장하지 못했으면 장부는 생기지 않았다: 이 화면에 남아 맨 위에 알리고 다시 누를 수 있게 (#178 리뷰)
          created.current = false
          setCreateFailure(result.reason)
          window.scrollTo(0, 0)
        }}
      />
    </div>
  )
}

// 사실 카드 (8절): 해 → 기록 → 회원 → 월 회비 → 회비 표. 흰 카드, 줄 사이 선 없음
export function ImportFacts({ summary }: { summary: ExcelImportSummary }) {
  const years = yearsText(summary.years)
  const lastYear = summary.years[summary.years.length - 1]
  const [startYear, startMonth] = summary.startMonth.split('-').map(Number)
  const total = summary.incomeCount + summary.expenseCount
  return (
    <ExcelFacts label="읽은 내용" testId="excel-facts">
      <ExcelFact label="해">
        <ExcelFactValue main={years.main} sub={years.sub} />
      </ExcelFact>
      <ExcelFact label="기록">
        <ExcelFactValue
          main={`${formatAmount(total)}건`}
          sub={`수입 ${formatAmount(summary.incomeCount)} · 지출 ${formatAmount(summary.expenseCount)}`}
        />
      </ExcelFact>
      <ExcelFact label="회원">
        <ExcelFactValue
          main={`${formatAmount(summary.memberCount)}명`}
          sub={summary.memberCount > 0 ? `${lastYear}년 회원 ${formatAmount(summary.lastYearMemberCount)}명` : undefined}
        />
      </ExcelFact>
      <ExcelFact label="월 회비">
        {feeLines(summary.monthlyFees).map((line) => (
          <span key={line} className="excel-facts__main">
            {line}
          </span>
        ))}
      </ExcelFact>
      <ExcelFact label="회비 표">
        <ExcelFactValue main={`${startYear}년 ${startMonth}월부터`} />
      </ExcelFact>
    </ExcelFacts>
  )
}

// 검산 줄: 맞음 ✓ / N곳이 달라요 + 해·차이 / 맞춰 볼 엑셀 잔액 없음. 이월금은 엑셀 값을 쓴다고 함께 말한다
function BalanceNote({ summary }: { summary: ExcelImportSummary }) {
  const check = balanceCheckText(summary.balanceChecks)
  const carryover = '이월금은 엑셀에 적힌 값을 그대로 써요.'
  if (check.kind === 'ok') {
    return (
      <ExcelNote tone="ok" title="해마다 잔액이 맞아요">
        엑셀 잔액과 앱 계산을 해마다 맞춰 봤어요. {carryover}
      </ExcelNote>
    )
  }
  if (check.kind === 'none') {
    return (
      <ExcelNote tone="info" title="엑셀에 잔액이 없어 맞춰 보지 못했어요">
        {carryover}
      </ExcelNote>
    )
  }
  return (
    <ExcelNote tone="warn" title={check.title}>
      <ul className="excel-note__items">
        {check.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {carryover} 다른 곳은 만든 뒤 고칠 수 있어요.
    </ExcelNote>
  )
}

type LineNotesSheetProps = {
  open: boolean
  title: string
  notes: readonly LineNote[]
  onClose: () => void
}

// [보기] 목록: 해·달 + 엑셀 원래 글 (8절 경고 줄)
function LineNotesSheet({ open, title, notes, onClose }: LineNotesSheetProps) {
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <ul className="excel-lines" aria-label={title}>
        {notes.map((note, index) => (
          <li key={index} className="excel-lines__line">
            <span className="excel-lines__where">{lineNoteLabel(note)}</span>
            <span className="excel-lines__text">{note.text}</span>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={onClose}>
        닫기
      </Button>
    </BottomSheet>
  )
}

type FeeEditProps = {
  fees: ExcelImportSummary['monthlyFees']
  onSave: (changed: Map<number, number>) => void // 바꾼 해와 금액만
  onBack: () => void
}

// 월 회비 고치기: 해마다 금액 칸 하나. 고치면 그 금액으로 낸 분을 다시 나눈다 (월 회비의 배수 판정이 달라지므로).
// [저장]은 바꾼 해만 넘긴다 — 안 바꾼 해까지 고정하면 앞 해 값을 이어 쓰던 해가 고친 앞 해 값을 따라가지 못한다 (#178 리뷰).
// 읽은 값이 있던 해는 비울 수 없다 (설정 월 회비처럼 "정하지 않음"으로 되돌리는 길은 두지 않는다)
function FeeEdit({ fees, onSave, onBack }: FeeEditProps) {
  const [amounts, setAmounts] = useState(() => new Map(fees.map(({ year, fee }) => [year, fee ?? 0])))
  const amountOf = (year: number) => amounts.get(year) ?? 0
  const changedYears = fees.filter(({ year, fee }) => amountOf(year) !== (fee ?? 0) && amountOf(year) > 0)
  const emptied = fees.some(({ year, fee }) => fee !== undefined && amountOf(year) === 0)

  return (
    <EditPage
      title="월 회비 고치기"
      backLabel="읽은 내용"
      canSave={changedYears.length > 0 && !emptied}
      onBack={onBack}
      onSave={() => onSave(new Map(changedYears.map(({ year }) => [year, amountOf(year)])))}
    >
      <p className="screen__note">해마다 한 분이 한 달에 내는 돈이에요. 고치면 그 금액으로 낸 분을 다시 나눠요.</p>
      {fees.map(({ year, fee }) => (
        <MoneyInput
          key={year}
          label={`${year}년 월 회비`}
          labelRole="label"
          value={amountOf(year)}
          error={fee !== undefined && amountOf(year) === 0 ? '금액을 적어 주세요' : undefined}
          onChange={(amount) => setAmounts((current) => new Map(current).set(year, amount))}
        />
      ))}
    </EditPage>
  )
}
