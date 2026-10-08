import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewBookScreen } from './NewBookScreen'

function createButton() {
  return screen.getByRole('button', { name: '만들기' })
}

describe('SPEC-005 새 장부 만들기', () => {
  it('종류는 [동아리·모임 | 개인 가계부] 두 칸이고 기본값이 없으며, 처음 보여 줄 항목만 다르다고 알린다', () => {
    render(<NewBookScreen onCreate={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 1, name: '새 장부 만들기' })).toBeInTheDocument()
    const kinds = screen.getByRole('group', { name: '어떤 장부인가요?' })
    expect(kinds).toHaveTextContent('동아리·모임개인 가계부')
    expect(screen.getByRole('button', { name: '동아리·모임' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '개인 가계부' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('처음 보여 줄 항목만 달라요')).toBeInTheDocument()
  })

  it('종류를 고르면 비어 있는 장부 이름 칸에 종류별 예시 글자가 보인다', async () => {
    render(<NewBookScreen onCreate={vi.fn()} />)
    const name = screen.getByLabelText('장부 이름')
    expect(name).not.toHaveAttribute('placeholder')

    await userEvent.click(screen.getByRole('button', { name: '동아리·모임' }))
    expect(name).toHaveAttribute('placeholder', '예: 한랑드림')

    await userEvent.click(screen.getByRole('button', { name: '개인 가계부' }))
    expect(name).toHaveAttribute('placeholder', '예: 우리집 가계부')
  })

  it('AC-5 이월금 칸 이름은 동아리 "작년 이월금", 가계부 "지금 남은 돈" 이고 0원으로 시작한다', async () => {
    render(<NewBookScreen onCreate={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: '동아리·모임' }))
    expect(screen.getByLabelText('작년 이월금')).toHaveValue('0')

    await userEvent.click(screen.getByRole('button', { name: '개인 가계부' }))
    expect(screen.getByLabelText('지금 남은 돈')).toHaveValue('0')
    expect(screen.getByText('모르면 0으로 두고 나중에 설정에서 바꿀 수 있어요.')).toBeInTheDocument()
  })

  it('AC-4 종류와 이름이 있어야 [만들기] 를 누를 수 있고, 빠진 것을 버튼 위에 알린다', async () => {
    render(<NewBookScreen onCreate={vi.fn()} />)

    expect(createButton()).toBeDisabled()
    expect(screen.getByTestId('bottom-action-bar-note')).toHaveTextContent('어떤 장부인지 골라 주세요')

    await userEvent.click(screen.getByRole('button', { name: '개인 가계부' }))
    expect(createButton()).toBeDisabled()
    expect(screen.getByTestId('bottom-action-bar-note')).toHaveTextContent('장부 이름을 적어 주세요')

    await userEvent.type(screen.getByLabelText('장부 이름'), '   ')
    expect(createButton()).toBeDisabled()

    await userEvent.type(screen.getByLabelText('장부 이름'), '우리집')
    expect(createButton()).toBeEnabled()
    expect(screen.queryByTestId('bottom-action-bar-note')).not.toBeInTheDocument()
  })

  it('AC-4 [만들기] 를 누르면 고른 종류·이름·이월금(적자면 음수)으로 만들어 달라고 알린다', async () => {
    const onCreate = vi.fn()
    render(<NewBookScreen onCreate={onCreate} />)

    await userEvent.click(screen.getByRole('button', { name: '개인 가계부' }))
    await userEvent.type(screen.getByLabelText('장부 이름'), ' 우리집 가계부 ')
    await userEvent.clear(screen.getByLabelText('지금 남은 돈'))
    await userEvent.type(screen.getByLabelText('지금 남은 돈'), '30000')
    await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))
    await userEvent.click(createButton())

    expect(onCreate).toHaveBeenCalledWith({ kind: 'household', name: ' 우리집 가계부 ', carryover: -30_000 })
  })

  it('장부 고르기 창에서 왔으면 맨 위 [장부로] 로 돌아간다. 첫 실행(장부 없음)에는 없다', async () => {
    const onBack = vi.fn()
    const { unmount } = render(<NewBookScreen onCreate={vi.fn()} onBack={onBack} />)

    await userEvent.click(screen.getByRole('button', { name: '장부로' }))
    expect(onBack).toHaveBeenCalledOnce()
    unmount()

    render(<NewBookScreen onCreate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '장부로' })).not.toBeInTheDocument()
  })
})
