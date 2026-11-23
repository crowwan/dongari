import { useId } from 'react'
import { isDuesEntry } from '../../domain/dues'
import type { ItemTotal, YearReport } from '../../domain/report'
import type { EntryType } from '../../domain/types'
import { Icon } from '../../ui/Icon'
import { formatAmount } from '../../ui/money'
import './report.css'

const KIND: Record<EntryType, string> = { income: '수입', expense: '지출' }

// 막대 길이: 그해 그쪽 합계 대비 비율(%), 소수 한 자리
function sharePercent(amount: number, total: number): number {
  return Math.round((amount / total) * 1000) / 10
}

// 항목 한 줄: 이름 + 작은 "N건" ··· 금액, 아래 얇은 비율 막대. 누르는 곳 없음 — 회비 기록 줄만 onOpen 이 있으면 줄 전체가 회비 표 버튼(SPEC-010 4절,
// 줄 끝 › 는 사진에서 뺀다). 한 줄에 안 들어가면 금액이 아래 줄 오른쪽으로 내려간다 (금액 줄바꿈 없음, 이름은 낱말 단위)
function ItemTotalRow({ item, total, onOpen }: { item: ItemTotal; total: number; onOpen?: () => void }) {
  const content = (
    <>
      <span className="item-totals__line">
        <span className="item-totals__name">{item.name}</span> <span className="item-totals__count">{item.count}건</span>{' '}
        <span className="item-totals__amount">{formatAmount(item.amount)}원</span>
        {onOpen && (
          <span className="item-totals__chevron" aria-hidden="true">
            <Icon name="right" />
          </span>
        )}
      </span>
      {/* 숫자가 이미 있으니 막대는 눈으로만 보는 보조 */}
      <span className="item-totals__track" aria-hidden="true">
        <span className="item-totals__bar" style={{ width: `${sharePercent(item.amount, total)}%` }} data-testid="item-total-bar" />
      </span>
    </>
  )
  return (
    <li className="item-totals__row" data-testid="item-total-row">
      {onOpen ? (
        <button type="button" className="item-totals__open" onClick={onOpen}>
          {content}{' '}
          <span className="ui-visually-hidden">회비 표 보기</span>
        </button>
      ) : (
        content
      )}
    </li>
  )
}

// 수입 또는 지출 카드: 머리 = "수입 항목별"/"지출 항목별" + 그해 합계, 아래 항목별 줄. 기록이 없으면 "올해 적은 수입(지출)이 없어요" 한 줄
function ItemTotalsCard({ type, items, total, onOpenDues }: { type: EntryType; items: ItemTotal[]; total: number; onOpenDues?: () => void }) {
  const titleId = useId()
  return (
    <section className="item-totals" data-kind={type} aria-labelledby={titleId} data-testid="item-totals-card">
      <div className="item-totals__head">
        <h2 className="item-totals__title" id={titleId}>
          {KIND[type]} 항목별
        </h2>
        {items.length > 0 && (
          <span className="item-totals__total" data-testid="item-totals-total">
            {formatAmount(total)}원
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="item-totals__empty">올해 적은 {KIND[type]}이 없어요</p>
      ) : (
        <ul className="item-totals__list">
          {items.map((item) => (
            <ItemTotalRow
              key={item.name}
              item={item}
              total={total}
              onOpen={isDuesEntry({ type, name: item.name }) ? onOpenDues : undefined}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

// 항목별 합계 카드 둘 (SPEC-003 v2.3): 수입 카드·지출 카드 위아래. v2.6 부터 올해 결산 [단톡방용 요약] 의 2·3번 카드로 사진에 들어간다.
// onOpenDues: 수입 항목별의 회비 기록 줄("회비", "회비(14인)")을 누르면 회비 표로 (SPEC-010 4절, 동아리·모임 장부)
export function ItemTotalsCards({ report, onOpenDues }: { report: YearReport; onOpenDues?: () => void }) {
  return (
    <div className="item-totals-cards" data-testid="year-item-totals">
      <ItemTotalsCard type="income" items={report.incomeItems} total={report.totals.income} onOpenDues={onOpenDues} />
      <ItemTotalsCard type="expense" items={report.expenseItems} total={report.totals.expense} />
    </div>
  )
}
