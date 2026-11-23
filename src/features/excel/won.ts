// 엑셀 칸에 글로 적힌 돈 읽기: "27만원"·"27만"·"270,000원"·"15000원" (SPEC-010 8절 금액·이월금·미수합계, 낸 분 "이름(N만원)")
import { cellText, type SheetCell } from './sheet'

const WON = /^(-?\d[\d,]*)(만원|만|원)?$/

// 원 단위 정수. 읽을 수 없으면 undefined.
// unitRequired 면 "만"·"원"이 꼭 붙어야 한다 — "강민지(3)"의 3 은 금액이 아니다
export function parseWonText(text: string, unitRequired: boolean): number | undefined {
  const match = WON.exec(text.replace(/\s+/g, ''))
  if (!match || (unitRequired && match[2] === undefined)) return undefined
  const value = Number(match[1].replaceAll(',', '')) * (match[2]?.startsWith('만') ? 10_000 : 1)
  return Number.isSafeInteger(value) ? value : undefined
}

// 돈 칸: 숫자 그대로, 글자면 "30000"·"30,000"·"30,000원"·"3만원" 을 읽는다(숫자를 글자로 저장한 엑셀 칸). 빈칸·다른 글은 undefined.
// 정수·범위 검사는 부르는 쪽이 한다
export function wonOf(cell: SheetCell): number | undefined {
  return typeof cell === 'number' ? cell : parseWonText(cellText(cell), false)
}
