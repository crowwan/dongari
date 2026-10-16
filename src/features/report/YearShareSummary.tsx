import { useId, type Ref } from 'react'
import type { CarryoverWords } from '../../domain/book'
import type { YearReport } from '../../domain/report'
import { formatAmount, formatSignedAmount } from '../../ui/money'
import { carryoverNote } from '../carryoverNote'
import { ItemTotalsCards } from './ItemTotalsCards'
import { PRACTICE_RIBBON } from './practiceRibbon'
import './report.css'

type ShareLineProps = {
  label: string
  amount: string
  // income·expense: 금액색 / balance: 위 구분선 + 한 단계 큰 숫자
  kind: 'income' | 'expense' | 'balance'
}

// 요약 한 줄: 이름(18 SemiBold) ··· 금액(24 Bold, 줄바꿈 없음). 한 줄에 안 들어가면 금액이 이름 아래 줄 오른쪽으로 내려간다
function ShareLine({ label, amount, kind }: ShareLineProps) {
  return (
    <div className="share-line" data-kind={kind} data-testid="share-line">
      <span className="share-line__label">{label}</span>
      <span className="share-line__amount">{amount}</span>
    </div>
  )
}

type YearShareSummaryProps = {
  report: YearReport
  bookName: string
  carryoverWords: CarryoverWords // 보조 줄 이월금 이름 (장부 종류별, SPEC-005)
  // 사진으로 만들 영역 (카드 셋만)
  targetRef: Ref<HTMLDivElement>
  // 연습 장부 결산: 맨 위에 "연습" 띠 (SPEC-008, 사진에도 찍힌다)
  practice?: boolean
}

// 올해 결산 [단톡방용 요약] (SPEC-003 v2.6, ADR 007): 단톡방에서 폰 폭으로 읽히는 큰 글씨 카드 셋.
// 1 요약(제목 "N년 <장부> 결산", 수입 +·지출 −·잔액, 이월금 보조 줄) 2·3 수입·지출 항목별 합계.
// 이 영역이 그대로 사진 한 장이 된다 (계산은 결산표와 같은 yearReport)
export function YearShareSummary({ report, bookName, carryoverWords, targetRef, practice = false }: YearShareSummaryProps) {
  const titleId = useId()
  const note = carryoverNote(report.carryover, carryoverWords)
  return (
    <div className="share-summary" ref={targetRef} data-testid="year-share-summary">
      {practice && <p className="practice-ribbon">{PRACTICE_RIBBON}</p>}
      <section className="summary-card share-total" aria-labelledby={titleId}>
        <h2 className="share-total__title" id={titleId}>
          {report.year}년 {bookName} 결산
        </h2>
        <ShareLine label="수입" amount={`${formatSignedAmount(report.totals.income)}원`} kind="income" />
        <ShareLine label="지출" amount={`${formatSignedAmount(-report.totals.expense)}원`} kind="expense" />
        <ShareLine label="잔액" amount={`${formatAmount(report.totals.balance)}원`} kind="balance" />
        {note && (
          <p className="share-total__note" data-testid="share-total-note">
            {note}
          </p>
        )}
      </section>
      <ItemTotalsCards report={report} />
    </div>
  )
}
