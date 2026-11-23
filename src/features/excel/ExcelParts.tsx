// 엑셀 화면들이 같이 쓰는 조각 (SPEC-010 8·9절): 사실 카드(이름 ··· 값)와 알림 줄.
// 읽은 내용 확인 화면(#166, 엑셀 조각)과 "엑셀 파일을 저장했어요" 창(#167, 첫 화면 쪽)이 함께 써서 첫 화면 쪽에 둔다 (모양은 excel.css)
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../ui/Icon'
import './excel.css'

type ExcelFactsProps = {
  label: string // 목록 이름 (화면 읽기)
  // surface: 화면 위 흰 카드 / sheet: 선택 창(흰 면) 안 회색 면
  variant?: 'surface' | 'sheet'
  testId?: string
  children: ReactNode
}

// 사실 카드 (dl): 줄 사이 선 없이 이름 ··· 값. 큰 글씨에서 한 줄에 안 들어가면 값이 아래 줄 오른쪽으로
export function ExcelFacts({ label, variant = 'surface', testId, children }: ExcelFactsProps) {
  return (
    <dl className="excel-facts" aria-label={label} data-variant={variant} data-testid={testId}>
      {children}
    </dl>
  )
}

// 사실 카드 한 줄: 왼쪽 이름(보조 글자) + 오른쪽 값
export function ExcelFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="excel-facts__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// 값: 굵은 한 줄 + (있으면) 아래 작은 글자
export function ExcelFactValue({ main, sub }: { main: string; sub?: string }) {
  return (
    <>
      <span className="excel-facts__main">{main}</span>
      {sub && <span className="excel-facts__sub">{sub}</span>}
    </>
  )
}

const NOTE_ICONS: Readonly<Record<ExcelNoteProps['tone'], IconName>> = { ok: 'ok', info: 'info', warn: 'alert' }

type ExcelNoteProps = {
  // ok: 흰 면 + 체크(맞음) / info: 알아 둘 것(--info-bg) / warn: 확인할 것(--warn-bg)
  tone: 'ok' | 'info' | 'warn'
  title: string
  children: ReactNode
  // 있으면 줄 전체가 버튼이고 끝에 [보기 ›] (목록을 연다)
  onOpen?: () => void
}

// 알림 줄 한 개: 아이콘 + 굵은 제목 + 설명 (+ [보기 ›]). 색만이 아니라 아이콘 모양으로도 갈린다.
// [보기 ›] 는 글이 좁아지면(큰 글씨) 글 아래 줄로 내려간다 (PATTERNS A5)
export function ExcelNote({ tone, title, children, onOpen }: ExcelNoteProps) {
  // 버튼 안에는 글자 덩어리(span)만 둘 수 있다. 버튼이 아니면 설명에 목록(검산 차이)을 넣을 수 있게 div
  const Text = onOpen ? 'span' : 'div'
  const content = (
    <>
      <Icon name={NOTE_ICONS[tone]} />
      <Text className="excel-note__main">
        <Text className="excel-note__text">
          <Text className="excel-note__title">{title}</Text>
          <Text className="excel-note__body">{children}</Text>
        </Text>
        {onOpen && (
          <span className="excel-note__open">
            보기
            <Icon name="right" />
          </span>
        )}
      </Text>
    </>
  )
  if (!onOpen) {
    return (
      <div className="excel-note" data-tone={tone} data-testid="excel-note">
        {content}
      </div>
    )
  }
  return (
    <button type="button" className="excel-note" data-tone={tone} data-testid="excel-note" onClick={onOpen}>
      {content}
    </button>
  )
}
