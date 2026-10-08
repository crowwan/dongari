// 올해 결산 양식(v1 연말 양식, PLANS.md 6장)의 모양 값.
//
// 토큰 규칙의 예외 (docs/design.md "올해 결산 양식"): 이 양식은 앱 화면이 아니라 사진으로 저장해 단톡방에 올리는 종이 양식이라
// - 앱 테마(라이트/다크)·토큰이 바뀌어도 v1 과 똑같은 흰 종이·검정 글자·회색 선이어야 하고 (AC-7)
// - html2canvas 1.4 는 oklch() 같은 최신 색 문법을 읽지 못해 v1 때부터 평범한 hex 인라인 스타일로 그렸다.
// 그래서 색·크기를 CSS 변수 대신 여기 hex·px 로 둔다. 값은 v1 components/report 와 같다.
import type { CSSProperties } from 'react'

export const SHEET_COLOR = {
  paper: '#ffffff',
  ink: '#000000',
  line: '#9ca3af',
  headFill: '#f3f4f6',
  monthFill: '#f9fafb',
}

// v1 양식 폭. 화면에서는 이 폭을 화면 폭에 맞춰 줄이고, 사진은 이 폭 그대로 2배로 그린다
export const SHEET_WIDTH = 360

export const SHEET_LINE = `1px solid ${SHEET_COLOR.line}`

// 양식 종이: 흰 바탕·검정 글자, 글자 크기·여백은 v1 양식 그대로 (디자인 카탈로그도 표를 이 종이 위에 놓고 본다)
export const sheetPaper: CSSProperties = {
  boxSizing: 'border-box',
  width: `${SHEET_WIDTH}px`,
  padding: '16px',
  backgroundColor: SHEET_COLOR.paper,
  color: SHEET_COLOR.ink,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  lineHeight: 1.5,
  letterSpacing: 'normal',
}

// 표는 칸마다 오른쪽·아래 선만 긋고 표가 위·왼쪽 선을 긋는다.
// (border-collapse 를 쓰면 html2canvas 가 이웃 칸 선을 겹쳐 두 겹으로 그려서 v1 사진의 선이 굵고 어긋났다)
export const sheetTable: CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  borderTop: SHEET_LINE,
  borderLeft: SHEET_LINE,
}

export const sheetCell: CSSProperties = {
  borderRight: SHEET_LINE,
  borderBottom: SHEET_LINE,
}

export const sheetHeadCell: CSSProperties = {
  ...sheetCell,
  backgroundColor: SHEET_COLOR.headFill,
  fontWeight: 'bold',
}
