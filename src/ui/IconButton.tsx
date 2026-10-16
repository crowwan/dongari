import type { Ref } from 'react'
import { Icon, type IconName } from './Icon'
import './ui.css'

type IconButtonProps = {
  icon: IconName
  // 아이콘 옆 글자. 기호만 있는 버튼은 만들지 않는다 (SPEC-001)
  children: string
  onClick: () => void
  // plain: 면 없는 글자 버튼 (위쪽 [설정], [← 장부로]) / surface: 흰 면 + 청록 아이콘 (위쪽 [결산], 달 넘기기 아래 [10월 정리 보기])
  variant?: 'plain' | 'surface'
  // 점 표시 (예: 기록 파일 보내기 필요). 주면 오른쪽 위에 점을 찍고, 화면 읽기 이름에 이 말을 붙인다
  dotLabel?: string
  // 안내 말풍선이 가리킬 때 (SPEC-008)
  ref?: Ref<HTMLButtonElement>
}

// 아이콘 + 글자 버튼. 주 버튼보다 조용한 이동·보조 동작
export function IconButton({ icon, children, onClick, variant = 'plain', dotLabel, ref }: IconButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      className="ui-icon-button"
      data-testid="icon-button"
      data-variant={variant}
      data-dot={dotLabel !== undefined}
      onClick={onClick}
    >
      <Icon name={icon} />
      {children}
      {dotLabel !== undefined && (
        <>
          <span className="ui-icon-button__dot" data-testid="icon-button-dot" aria-hidden="true" />
          {/* 글자와 숨은 이유는 쉼표로 끊어 읽힌다 ("설정, 기록 파일 보내기 필요") */}
          <span className="ui-visually-hidden">, {dotLabel}</span>
        </>
      )}
    </button>
  )
}
