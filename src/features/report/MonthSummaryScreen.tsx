import { useId } from 'react'
import { monthSummary, type OpeningBalance } from '../../domain/report'
import type { Entry, Ledger } from '../../domain/types'
import { formatAmount } from '../../ui/money'
import { BackToLedger } from '../BackToLedger'
import { monthPictureName, pictureSaver, type PictureSaver } from './savePicture'
import { SavePictureBar } from './SavePictureBar'
import { useSavePicture } from './useSavePicture'
import './report.css'

type MonthSummaryScreenProps = {
  ledger: Ledger
  month: number
  onBack: () => void
  // [사진으로 저장] 결과 알림
  onNotify: (message: string) => void
  // 사진 만들기·내려받기 (테스트는 가짜를 넣는다)
  saver?: PictureSaver
}

type SummaryLineProps = {
  label: string
  amount: string
  total?: boolean
  // income: 수입 합계(수입 금액색) / closing: 월말 잔액(큰 숫자)
  kind?: 'income' | 'closing'
}

// 정리 한 줄: 왼쪽 이름, 오른쪽 금액. 합계 줄만 위에 구분선 + 굵게
function SummaryLine({ label, amount, total = false, kind }: SummaryLineProps) {
  return (
    <div className="summary-line" data-total={total || undefined} data-kind={kind} data-testid="summary-line">
      <span className="summary-line__label">{label}</span>
      <span className="summary-line__amount">{amount}</span>
    </div>
  )
}

// 수입 또는 지출 묶음: 그 달 기록을 입력 순으로(같은 이름도 합치지 않는다) + 합계. 기록이 없으면 "없어요" 한 줄
function EntriesCard({ title, entries, total, kind }: { title: '수입' | '지출'; entries: Entry[]; total: number; kind?: 'income' }) {
  const titleId = useId()
  return (
    <section className="summary-card" aria-labelledby={titleId}>
      <h2 className="summary-card__title" id={titleId}>
        {title}
      </h2>
      {entries.length === 0 ? (
        <p className="summary-card__empty">없어요</p>
      ) : (
        <>
          {entries.map((entry) => (
            <SummaryLine key={entry.id} label={entry.name} amount={`${formatAmount(entry.amount)}원`} />
          ))}
          <SummaryLine label={`${title} 합계`} amount={`${formatAmount(total)}원`} total kind={kind} />
        </>
      )}
    </section>
  )
}

// 전달까지 잔액 줄. 1월은 작년 이월금이고, 작년이 적자였으면 "작년 적자" 로 금액만 보인다 (장부 잔액 카드의 "작년 적자 … 포함" 과 같은 말)
function openingLine(opening: OpeningBalance): SummaryLineProps {
  if (opening.kind === 'previousMonth') {
    return { label: `${opening.month}월까지 잔액`, amount: `${formatAmount(opening.amount)}원` }
  }
  if (opening.amount < 0) return { label: '작년 적자', amount: `${formatAmount(-opening.amount)}원` }
  return { label: '작년 이월금', amount: `${formatAmount(opening.amount)}원` }
}

// 그 달 수입 − 지출은 늘었는지 줄었는지가 보이게 부호를 붙인다 (0 은 부호 없음)
function signedAmount(value: number): string {
  return `${value > 0 ? '+' : ''}${formatAmount(value)}원`
}

// 월 정리 (SPEC-003): 제목 → 수입 카드 → 지출 카드 → 잔액 카드, 아래 고정 [⬇ 사진으로 저장]. 사진은 제목부터 잔액 카드까지
export function MonthSummaryScreen({ ledger, month, onBack, onNotify, saver = pictureSaver }: MonthSummaryScreenProps) {
  const summary = monthSummary(ledger, month)
  const { targetRef, saving, ready, sharesToPhotos, save } = useSavePicture({ fileName: monthPictureName(ledger.year, month), saver, onNotify })

  return (
    <div className="screen report" data-testid="month-summary-screen" data-month={month}>
      <BackToLedger onBack={onBack} />
      <div className="summary" ref={targetRef} data-testid="month-summary-sheet">
        <h1 className="screen__title">
          {ledger.year}년 {month}월 정리
        </h1>
        <EntriesCard title="수입" entries={summary.incomeEntries} total={summary.income} kind="income" />
        <EntriesCard title="지출" entries={summary.expenseEntries} total={summary.expense} />
        <section className="summary-card" aria-label="잔액">
          <SummaryLine {...openingLine(summary.opening)} />
          <SummaryLine label={`${month}월 수입 − 지출`} amount={signedAmount(summary.net)} />
          <SummaryLine label={`${month}월 말 잔액`} amount={`${formatAmount(summary.closing)}원`} total kind="closing" />
        </section>
      </div>
      <SavePictureBar saving={saving} ready={ready} sharesToPhotos={sharesToPhotos} onSave={save} />
    </div>
  )
}
