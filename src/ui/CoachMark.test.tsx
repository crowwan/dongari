/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CoachMark } from './CoachMark'
import { coachPlacement } from './coachPlacement'

// Vitest 는 CSS import 를 빈 글자로 바꾸므로 파일을 그대로 읽는다
const coachCss = readFileSync('src/ui/coachMark.css', 'utf8')

function isLocked(element: HTMLElement): boolean {
  return element.closest('[inert]') !== null
}

type SampleProps = {
  open?: boolean
  onDismiss?: () => void
  inline?: boolean
}

// 뒤 화면([결산]) + 가리키는 버튼([설정]) + 말풍선
function Sample({ open = true, onDismiss = () => {}, inline = false }: SampleProps) {
  const targetRef = useRef<HTMLButtonElement>(null)
  return (
    <main>
      <button type="button">결산</button>
      <button type="button" ref={targetRef}>
        설정
      </button>
      <CoachMark
        open={open}
        name="4"
        target={targetRef}
        message="폰을 바꿔도 기록이 돌아오게 복구 코드를 보내 두세요"
        onDismiss={onDismiss}
        onTargetPress={() => {}}
        inline={inline}
      />
    </main>
  )
}

describe('SPEC-008 안내 말풍선 (CoachMark)', () => {
  it('말풍선 글과 [✕](안내 닫기)·[알겠어요] 를 그리고, 둘 다 onDismiss 를 부른다', async () => {
    const onDismiss = vi.fn()
    render(<Sample onDismiss={onDismiss} />)

    expect(screen.getByTestId('coach-mark')).toHaveAttribute('data-state', '4')
    expect(screen.getByText('폰을 바꿔도 기록이 돌아오게 복구 코드를 보내 두세요')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '안내 닫기' }))
    await userEvent.click(screen.getByRole('button', { name: '알겠어요' }))
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('열리면 포커스가 가리키는 버튼으로 가고, 그 버튼의 설명(aria-describedby)이 말풍선 글이다 (AC-12)', () => {
    render(<Sample />)

    const target = screen.getByRole('button', { name: '설정' })
    expect(target).toHaveFocus()
    expect(target).toHaveAccessibleDescription('폰을 바꿔도 기록이 돌아오게 복구 코드를 보내 두세요')
  })

  it('닫히면 가리키는 버튼의 설명을 원래대로 돌려놓는다', () => {
    const { rerender } = render(<Sample />)

    rerender(<Sample open={false} />)

    expect(screen.queryByTestId('coach-mark')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정' })).not.toHaveAttribute('aria-describedby')
  })

  it('떠 있는 동안 말풍선과 가리키는 버튼 밖은 inert 로 잠긴다 (AC-7)', () => {
    render(<Sample />)

    expect(isLocked(screen.getByRole('button', { name: '결산' }))).toBe(true)
    expect(isLocked(screen.getByRole('button', { name: '설정' }))).toBe(false)
    expect(isLocked(screen.getByRole('button', { name: '알겠어요' }))).toBe(false)
  })

  it('가리키는 버튼을 누르면 onTargetPress 를 부르고 버튼의 원래 일도 한다', async () => {
    const onTargetPress = vi.fn()
    const targetWork = vi.fn()
    function WithPress() {
      const targetRef = useRef<HTMLButtonElement>(null)
      return (
        <>
          <button type="button" ref={targetRef} onClick={targetWork}>
            설정
          </button>
          <CoachMark open name="4" target={targetRef} message="안내" onDismiss={() => {}} onTargetPress={onTargetPress} />
        </>
      )
    }
    render(<WithPress />)

    await userEvent.click(screen.getByRole('button', { name: '설정' }))

    expect(onTargetPress).toHaveBeenCalledOnce()
    expect(targetWork).toHaveBeenCalledOnce()
  })

  it('카탈로그 견본(inline)은 제자리에 그리고 뒤 화면을 잠그거나 포커스를 옮기지 않는다', () => {
    render(<Sample inline />)

    expect(document.querySelector('[inert]')).toBeNull()
    expect(screen.getByTestId('coach-mark').closest('main')).not.toBeNull()
    expect(screen.getByRole('button', { name: '설정' })).not.toHaveFocus()
  })
})

describe('SPEC-008 말풍선 모양 기준 (coachMark.css)', () => {
  it('[알겠어요]·[✕] 는 누르는 곳 최소(--touch-min, 56px) 이상이다 (AC-14)', () => {
    for (const selector of ['.ui-coach__close', '.ui-coach__ok']) {
      // 그 선택자로 끝나는 규칙을 모두 모은다 (여러 선택자를 묶은 공용 규칙 포함)
      const pattern = new RegExp(`^${selector.replace('.', '\\.')} \\{([^}]*)\\}`, 'gm')
      const rule = [...coachCss.matchAll(pattern)].map((match) => match[1]).join('\n')
      expect(rule, selector).toMatch(/min-height:\s*var\(--touch-min\)/)
      expect(rule, selector).toMatch(/min-width:\s*var\(--touch-min\)/)
    }
  })

  it('올라오는 효과는 동작 줄이기를 켜지 않았을 때만 쓴다 (AC-13)', () => {
    const [outside, motionBlock = ''] = coachCss.split('@media (prefers-reduced-motion: no-preference)')
    expect(outside).not.toMatch(/animation:/)
    expect(motionBlock).toMatch(/\.ui-coach__bubble \{\s*animation: ui-coach-in var\(--motion-base\) var\(--motion-curve\)/)
  })
})

describe('SPEC-008 말풍선 자리 (coachPlacement)', () => {
  const bubble = { left: 20, width: 350 }

  it('가리키는 버튼이 화면 아래쪽 절반이면 말풍선은 버튼 위(꼬리 아래), 꼬리는 버튼 가운데로', () => {
    // 390×844 화면 아래 고정 [+ 내역 적기]
    expect(coachPlacement({ top: 760, left: 24, width: 342, height: 60 }, 844, bubble)).toEqual({
      side: 'above',
      anchor: 84,
      tailX: 175,
    })
  })

  it('위쪽 절반이면 말풍선은 버튼 아래(꼬리 위)', () => {
    // 위쪽 오른쪽 [설정]
    expect(coachPlacement({ top: 20, left: 300, width: 70, height: 56 }, 844, bubble)).toEqual({
      side: 'below',
      anchor: 76,
      tailX: 315,
    })
  })

  it('꼬리는 말풍선 둥근 모서리 밖으로 나가지 않는다', () => {
    expect(coachPlacement({ top: 20, left: 370, width: 20, height: 56 }, 844, bubble).tailX).toBe(324)
    expect(coachPlacement({ top: 20, left: 0, width: 10, height: 56 }, 844, bubble).tailX).toBe(26)
  })
})
