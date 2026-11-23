import type { DuesCell } from '../../domain/duesTable'
import { cellNote } from './duesWords'
import './dues.css'

type DuesCalendarProps = {
  cells: readonly DuesCell[] // 보는 해 1~12월
  year: number // 보는 해 (다른 해 입금 날짜에 해를 붙인다)
  referenceMonth?: number // 덜 낸 돈을 세는 기준 달 (테두리)
  onPick: (cell: DuesCell) => void // 달 칸을 눌렀다 (쉬는 달 넣기·빼기 선택 창)
}

// 칸이 아닌 달: 누를 일이 없다 (쉬는 달로 바꿀 수 없음)
function isPickable(cell: DuesCell): boolean {
  return cell.state !== 'notMember' && cell.state !== 'beforeStart'
}

// 한 분 보기 12칸 달력 (SPEC-010 5절, 4열 × 3행): 칸마다 달 + 작은 글(채운 입금 날짜 "1/19"·"10/19 반"·"아직"·"쉼"·"회비 모름").
// 모양은 12칸 띠와 같은 뜻(채움·반·안 냄·점선·빗금), 기준 달 테두리. 누르면 그 달 선택 창 — "1월 1/19 냄", "11월 아직" 으로 읽힌다.
// 회원 아닌 달·시작 달 전은 누를 수 없는 칸 "-"
export function DuesCalendar({ cells, year, referenceMonth, onPick }: DuesCalendarProps) {
  return (
    <div className="dues-calendar" role="group" aria-label={`${year}년 달마다`} data-testid="dues-calendar">
      {cells.map((cell) => {
        const paid = cell.state === 'full' || cell.state === 'partial'
        const content = (
          <>
            <span className="dues-calendar__month">{cell.month}월</span>{' '}
            <span className="dues-calendar__note">{cellNote(cell, year)}</span>
            {paid && (
              <>
                {' '}
                <span className="ui-visually-hidden">냄</span>
              </>
            )}
          </>
        )
        const common = {
          className: 'dues-calendar__cell',
          'data-testid': 'dues-calendar-cell',
          'data-state': cell.state,
          'data-reference': cell.month === referenceMonth,
        }
        return isPickable(cell) ? (
          <button key={cell.month} type="button" aria-haspopup="dialog" onClick={() => onPick(cell)} {...common}>
            {content}
          </button>
        ) : (
          <span key={cell.month} {...common}>
            {content}
          </span>
        )
      })}
    </div>
  )
}
