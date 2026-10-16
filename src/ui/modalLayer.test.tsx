import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomSheet } from './BottomSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { useModalLayer } from './modalLayer'

// 뒤 화면 버튼이 잠겼는지: 자신이나 조상 중 inert 가 있으면 Tab·화면 읽기가 닿지 않는다
function isLocked(element: HTMLElement): boolean {
  return element.closest('[inert]') !== null
}

// 뒤 화면([저장]) + 창을 여는 버튼. 창 종류만 바꿔 같은 점검을 한다
function Screen({ kind }: { kind: 'dialog' | 'sheet' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <main>
        <button type="button" onClick={() => setOpen(true)}>
          이 내역 지우기
        </button>
        <button type="button">저장</button>
      </main>
      {kind === 'dialog' ? (
        <ConfirmDialog
          open={open}
          title="이 내역을 정말 지울까요?"
          confirmLabel="지우기"
          danger
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <BottomSheet open={open} title="몇 월인가요?" onClose={() => setOpen(false)}>
          <button type="button" onClick={() => setOpen(false)}>
            9월
          </button>
        </BottomSheet>
      )}
    </>
  )
}

describe.each([
  { kind: 'dialog' as const, name: '확인 창', closeButton: '아니요' },
  { kind: 'sheet' as const, name: '선택 창', closeButton: '9월' },
])('#110 접근성 점검 08 $name 이 떠 있는 동안 뒤 화면 잠금', ({ kind, closeButton }) => {
  it('열려 있는 동안 뒤 화면(main)은 inert 라 Tab 이 창 밖 [저장] 으로 빠져나가지 않는다', async () => {
    const user = userEvent.setup()
    render(<Screen kind={kind} />)

    await user.click(screen.getByRole('button', { name: '이 내역 지우기' }))

    expect(isLocked(screen.getByRole('button', { name: '저장' }))).toBe(true)
    expect(isLocked(screen.getByRole('button', { name: closeButton }))).toBe(false)
  })

  it('닫으면 뒤 화면 잠금이 풀리고 연 버튼으로 포커스가 돌아온다', async () => {
    const user = userEvent.setup()
    render(<Screen kind={kind} />)
    const opener = screen.getByRole('button', { name: '이 내역 지우기' })
    await user.click(opener)

    await user.click(screen.getByRole('button', { name: closeButton }))

    expect(isLocked(screen.getByRole('button', { name: '저장' }))).toBe(false)
    expect(document.querySelector('[inert]')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('Esc 로 닫아도 잠금이 풀리고 연 버튼으로 포커스가 돌아온다', async () => {
    const user = userEvent.setup()
    render(<Screen kind={kind} />)
    const opener = screen.getByRole('button', { name: '이 내역 지우기' })
    await user.click(opener)

    await user.keyboard('{Escape}')

    expect(document.querySelector('[inert]')).toBeNull()
    expect(opener).toHaveFocus()
  })
})

describe('#110 접근성 점검 08 창 위에 창', () => {
  it('선택 창 위에 확인 창이 뜨면 선택 창도 잠기고, 확인 창을 닫으면 선택 창만 다시 풀린다', async () => {
    const user = userEvent.setup()
    function Stacked() {
      const [asking, setAsking] = useState(false)
      return (
        <>
          <main>
            <button type="button">저장</button>
          </main>
          <BottomSheet open title="자동 보관" onClose={() => {}}>
            <button type="button" onClick={() => setAsking(true)}>
              끄기
            </button>
          </BottomSheet>
          <ConfirmDialog open={asking} title="보관해 둔 기록도 지울까요?" onConfirm={() => {}} onCancel={() => setAsking(false)} />
        </>
      )
    }
    render(<Stacked />)

    await user.click(screen.getByRole('button', { name: '끄기' }))
    expect(isLocked(screen.getByRole('button', { name: '끄기' }))).toBe(true)
    expect(isLocked(screen.getByRole('button', { name: '저장' }))).toBe(true)

    await user.click(screen.getByRole('button', { name: '아니요' }))
    expect(isLocked(screen.getByRole('button', { name: '끄기' }))).toBe(false)
    expect(isLocked(screen.getByRole('button', { name: '저장' }))).toBe(true)
  })
})

describe('#110 카탈로그 견본 (inline)', () => {
  it('제자리에 그리고 뒤 화면을 잠그지 않는다', () => {
    render(
      <main>
        <button type="button">저장</button>
        <ConfirmDialog inline open title="지울까요?" onConfirm={() => {}} onCancel={() => {}} />
        <BottomSheet inline open title="몇 월인가요?" onClose={() => {}}>
          내용
        </BottomSheet>
      </main>,
    )

    expect(document.querySelector('[inert]')).toBeNull()
    expect(screen.getByRole('alertdialog').closest('main')).not.toBeNull()
    expect(screen.getByRole('dialog').closest('main')).not.toBeNull()
  })
})

describe('SPEC-008 말풍선: 창 밖에 열어 둘 요소 (keepOpen)', () => {
  // 뒤 화면 안의 가리키는 버튼(과 같이 열어 둘 칸)은 열어 두고 나머지는 잠그는 창
  function Pointing({ open, withField = false }: { open: boolean; withField?: boolean }) {
    const layerRef = useRef<HTMLDivElement>(null)
    const targetRef = useRef<HTMLButtonElement>(null)
    const fieldRef = useRef<HTMLInputElement>(null)
    const [keepOpen] = useState(() => (withField ? [targetRef, fieldRef] : [targetRef]))
    useModalLayer(open, layerRef, targetRef, true, keepOpen)
    return (
      <>
        <main>
          <header>
            <button type="button">결산</button>
            <button type="button" ref={targetRef}>
              설정
            </button>
          </header>
          <button type="button">내역 적기</button>
          <input aria-label="금액" ref={fieldRef} />
        </main>
        {open &&
          createPortal(
            <div ref={layerRef}>
              <button type="button">알겠어요</button>
            </div>,
            document.body,
          )}
      </>
    )
  }

  it('창과 열어 둘 요소(가리키는 버튼)는 누를 수 있고 그 밖은 모두 잠긴다. 포커스는 가리키는 버튼으로 간다', () => {
    render(<Pointing open />)

    expect(isLocked(screen.getByRole('button', { name: '설정' }))).toBe(false)
    expect(isLocked(screen.getByRole('button', { name: '알겠어요' }))).toBe(false)
    expect(isLocked(screen.getByRole('button', { name: '결산' }))).toBe(true)
    expect(isLocked(screen.getByRole('button', { name: '내역 적기' }))).toBe(true)
    expect(screen.getByRole('button', { name: '설정' })).toHaveFocus()
  })

  it('열어 둘 요소를 여럿 받으면(가리키는 버튼 + 금액 칸) 모두 누를 수 있고 나머지는 잠긴다', () => {
    render(<Pointing open withField />)

    expect(isLocked(screen.getByRole('button', { name: '설정' }))).toBe(false)
    expect(isLocked(screen.getByRole('textbox', { name: '금액' }))).toBe(false)
    expect(isLocked(screen.getByRole('button', { name: '내역 적기' }))).toBe(true)
    expect(screen.getByRole('button', { name: '설정' })).toHaveFocus()
  })

  it('닫으면 잠금이 모두 풀리고 포커스는 (열 때 있던 곳이 아니라) 가리키는 버튼에 남는다', () => {
    const { rerender } = render(<Pointing open={false} />)
    screen.getByRole('button', { name: '내역 적기' }).focus()
    rerender(<Pointing open />)

    rerender(<Pointing open={false} />)

    expect(document.querySelector('[inert]')).toBeNull()
    expect(screen.getByRole('button', { name: '설정' })).toHaveFocus()
  })
})
