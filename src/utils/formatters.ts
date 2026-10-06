// v1 보고서(src/components/report) 전용. #16 에서 보고서를 옮기면 지운다
// 숫자를 천 단위 콤마로 포맷팅
export function formatNumber(value: number): string {
  return value.toLocaleString('ko-KR');
}

