import type { DuesCell } from '../../domain/duesTable'
import './dues.css'

type DuesStripProps = {
  cells: readonly DuesCell[] // 보는 해 1~12월
  referenceMonth?: number // 덜 낸 돈을 세는 기준 달 (테두리)
}

// 회비 표 사람별 줄의 12칸 띠 (SPEC-010 4절): 채움 = 주 색, 일부 = 반 채움, 안 냄 = 회색 면, 쉬는 달 = 점선, 월 회비 모름 = 빗금,
// 회원 아닌 달·시작 달 전 = 가운데 짧은 줄. 기준 달은 테두리. 폭을 12등분해 큰 글씨에서도 가로로 넘치지 않는다.
// 같은 내용을 줄의 상태 문구가 말하니 띠는 화면 읽기에서 숨긴다 (줄 버튼 이름이 길어지지 않게). 줄 버튼 안이라 span 으로만 그린다
export function DuesStrip({ cells, referenceMonth }: DuesStripProps) {
  return (
    <span className="dues-strip" aria-hidden="true" data-testid="dues-strip">
      {cells.map((cell) => (
        <span
          key={cell.month}
          className="dues-strip__cell"
          data-testid="dues-strip-cell"
          data-state={cell.state}
          data-reference={cell.month === referenceMonth}
        />
      ))}
    </span>
  )
}
