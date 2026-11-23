// 엑셀 칸에 글로 적힌 돈 읽기: "27만원"·"27만"·"270,000원"·"15000원" (SPEC-010 8절 미수합계, 낸 분 "이름(N만원)")

const WON = /^(-?\d[\d,]*)(만원|만|원)?$/

// 원 단위 정수. 읽을 수 없으면 undefined.
// unitRequired 면 "만"·"원"이 꼭 붙어야 한다 — "강민지(3)"의 3 은 금액이 아니다
export function parseWonText(text: string, unitRequired: boolean): number | undefined {
  const match = WON.exec(text.replace(/\s+/g, ''))
  if (!match || (unitRequired && match[2] === undefined)) return undefined
  const value = Number(match[1].replaceAll(',', '')) * (match[2]?.startsWith('만') ? 10_000 : 1)
  return Number.isSafeInteger(value) ? value : undefined
}
