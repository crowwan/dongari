import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('열려 있으면 제목 문장과 아니요/확인 버튼을 보여준다', () => {
    render(
      <ConfirmDialog
        open
        title="이 기록을 정말 지울까요?"
        confirmLabel="지우기"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByRole('alertdialog', { name: '이 기록을 정말 지울까요?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '아니요' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지우기' })).toBeInTheDocument()
  })

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    render(<ConfirmDialog open={false} title="지울까요?" onConfirm={() => {}} onCancel={() => {}} />)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('확인을 누르면 onConfirm 만 불린다', async () => {
    const user = userEvent.setup()
    const handleConfirm = vi.fn()
    const handleCancel = vi.fn()
    render(<ConfirmDialog open title="저장할까요?" onConfirm={handleConfirm} onCancel={handleCancel} />)

    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(handleConfirm).toHaveBeenCalledTimes(1)
    expect(handleCancel).not.toHaveBeenCalled()
  })

  it('아니요를 누르면 onCancel 만 불린다', async () => {
    const user = userEvent.setup()
    const handleConfirm = vi.fn()
    const handleCancel = vi.fn()
    render(<ConfirmDialog open title="저장할까요?" onConfirm={handleConfirm} onCancel={handleCancel} />)

    await user.click(screen.getByRole('button', { name: '아니요' }))

    expect(handleCancel).toHaveBeenCalledTimes(1)
    expect(handleConfirm).not.toHaveBeenCalled()
  })

  it('Esc 를 누르면 onCancel 이 불린다', async () => {
    const user = userEvent.setup()
    const handleCancel = vi.fn()
    render(<ConfirmDialog open title="저장할까요?" onConfirm={() => {}} onCancel={handleCancel} />)

    await user.keyboard('{Escape}')

    expect(handleCancel).toHaveBeenCalledTimes(1)
  })

  it('열리면 실수로 지우지 않도록 아니요 버튼에 포커스가 간다', () => {
    render(<ConfirmDialog open title="지울까요?" danger onConfirm={() => {}} onCancel={() => {}} />)

    expect(screen.getByRole('button', { name: '아니요' })).toHaveFocus()
  })

  it('위험 변형이면 확인 버튼이 위험 종류다', () => {
    render(
      <ConfirmDialog open title="지울까요?" confirmLabel="지우기" danger onConfirm={() => {}} onCancel={() => {}} />,
    )

    expect(screen.getByRole('button', { name: '지우기' })).toHaveAttribute('data-variant', 'danger')
  })
})
