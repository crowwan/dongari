import { useEffect, useId, useLayoutEffect, useRef, type Ref } from 'react'
import { Button, type ButtonVariant } from './Button'
import type { IconName } from './Icon'
import { shouldRevealBar, useKeyboardOpen } from './keyboard'
import './ui.css'

// 주 버튼 왼쪽에 함께 두는 보조 버튼 (월 정리·올해 결산 [사진으로 저장], SPEC-003 v2.6)
type SecondaryAction = {
  label: string
  icon?: IconName
  onClick: () => void
  disabled?: boolean
}

type BottomActionBarProps = {
  label: string
  // 글자 앞 아이콘 (예: 더하기 + "내역 적기")
  icon?: IconName
  onClick: () => void
  disabled?: boolean
  // 버튼 바로 위 한 줄 안내 (누를 수 없는 이유 등). 버튼 설명으로도 읽힌다
  note?: string
  // 안내가 어느 버튼의 설명인지 (기본 주 버튼)
  noteFor?: 'main' | 'secondary'
  // 기본은 주 버튼. 할 일이 위 목록 고르기이고 아래는 끝내기뿐이면 보조 (연달아 적기 [다 적었어요])
  variant?: Extract<ButtonVariant, 'primary' | 'secondary'>
  // 버튼 자체 (안내 말풍선이 가리킬 때, SPEC-008)
  buttonRef?: Ref<HTMLButtonElement>
  // 주 버튼 왼쪽 보조 버튼. 한 줄에 안 들어가면 주 버튼이 위, 보조가 아래로 쌓인다 (ui.css)
  secondary?: SecondaryAction
  // 보조 버튼 자체 (안내 말풍선이 가리킬 때, SPEC-008)
  secondaryRef?: Ref<HTMLButtonElement>
}

// 화면 아래 고정 영역 + 버튼 하나 ([+ 내역 적기], [저장], 보조 [다 적었어요]) 또는 보조 + 주 둘 ([사진으로 저장] [사진 보내기]).
// 목록을 내려도 사라지지 않고 엄지가 닿는 자리 (ADR 003). 홈 표시줄(safe-area) 만큼 띄운다.
// 고정 영역 높이는 놓인 화면 요소에 --bottom-bar-height 로 알려 준다 (버튼이 쌓이거나 안내가 붙어 높아져도 화면 끝을 그만큼 띄우게).
// 키패드가 레이아웃을 줄이지 않는 브라우저(아이폰)에서 키패드가 뜨면 고정을 풀고 지금 질문 바로 아래 흐름에 둔 뒤
// 키패드 바로 위로 스크롤한다 (keyboard.ts, #70). 갤럭시는 레이아웃이 줄어 늘 고정
export function BottomActionBar({ label, icon, onClick, disabled, note, noteFor = 'main', variant, buttonRef, secondary, secondaryRef }: BottomActionBarProps) {
  const noteId = useId()
  const barRef = useRef<HTMLDivElement>(null)
  const keyboardOpen = useKeyboardOpen()

  // 고정 영역 높이를 놓인 화면 요소에 알린다 (ResizeObserver 가 없는 환경(테스트)에서는 알리지 않아 CSS 기본값을 쓴다)
  useLayoutEffect(() => {
    const bar = barRef.current
    const host = bar?.parentElement
    if (!bar || !host || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => host.style.setProperty('--bottom-bar-height', `${bar.offsetHeight}px`))
    observer.observe(bar)
    return () => {
      observer.disconnect()
      host.style.removeProperty('--bottom-bar-height')
    }
  }, [])

  // 키패드가 뜨면, 또 뜬 채 보이는 영역이 바뀌면(사파리 애니메이션 중 여러 번) 다시 맞춘다. 이미 보이면 움직이지 않는다
  useEffect(() => {
    const viewport = window.visualViewport
    if (!keyboardOpen || !viewport) return
    const reveal = () => {
      const bar = barRef.current
      if (!bar) return
      const barRect = bar.getBoundingClientRect()
      const focused = document.activeElement
      const focusTop = focused instanceof HTMLElement && focused !== document.body ? focused.getBoundingClientRect().top : barRect.top
      if (shouldRevealBar({ focusTop, barBottom: barRect.bottom, visibleHeight: viewport.height })) {
        bar.scrollIntoView({ block: 'nearest' })
      }
    }
    reveal()
    viewport.addEventListener('resize', reveal)
    return () => viewport.removeEventListener('resize', reveal)
  }, [keyboardOpen])

  const describedBy = (target: 'main' | 'secondary') => (note && noteFor === target ? noteId : undefined)
  const mainButton = (
    <Button ref={buttonRef} variant={variant} icon={icon} onClick={onClick} disabled={disabled} aria-describedby={describedBy('main')}>
      {label}
    </Button>
  )

  return (
    <div className="ui-bottom-bar" data-testid="bottom-action-bar" data-keyboard={keyboardOpen ? 'open' : 'closed'} ref={barRef}>
      <div className="ui-bottom-bar__inner">
        {note && (
          <p className="ui-bottom-bar__note" id={noteId} data-testid="bottom-action-bar-note">
            {note}
          </p>
        )}
        {secondary ? (
          <div className="ui-bottom-bar__pair">
            <Button
              ref={secondaryRef}
              variant="secondary"
              icon={secondary.icon}
              onClick={secondary.onClick}
              disabled={secondary.disabled}
              aria-describedby={describedBy('secondary')}
            >
              {secondary.label}
            </Button>
            {mainButton}
          </div>
        ) : (
          mainButton
        )}
      </div>
    </div>
  )
}
