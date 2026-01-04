// 숫자를 천 단위 콤마로 포맷팅
export function formatNumber(value: number): string {
  return value.toLocaleString('ko-KR');
}

// 숫자를 원화 형식으로 포맷팅
export function formatCurrency(value: number): string {
  return `₩ ${formatNumber(value)}`;
}

// 문자열에서 숫자만 추출
export function parseNumber(value: string): number {
  const cleaned = value.replace(/[^0-9-]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

// 입력값 포맷팅 (입력 중 콤마 자동 추가)
export function formatInputValue(value: string): string {
  const num = parseNumber(value);
  return num === 0 ? '' : formatNumber(num);
}
