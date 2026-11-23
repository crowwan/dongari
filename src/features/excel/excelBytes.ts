// 고른 파일이 엑셀인지 파일 머리로 본다 (SPEC-010 8절). 다른 엑셀 코드를 부르지 않는 작은 파일이라
// 첫 화면 쪽(기록 파일 불러오기에서 엑셀을 고른 경우, #166)이 불러도 첫 화면이 커지지 않는다

// .xlsx(zip) / .xls(옛 형식, 복합 문서) 파일 머리
const EXCEL_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
]

export function isExcelBytes(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 8))
  return EXCEL_SIGNATURES.some((signature) => signature.every((byte, index) => head[index] === byte))
}
