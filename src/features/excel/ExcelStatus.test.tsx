import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExcelProblem } from './ExcelStatus'

describe('SPEC-010 엑셀 파일 안내 화면의 주 버튼 (8절 예외, #178 리뷰)', () => {
  it('엑셀 기능을 받지 못했으면 주 버튼이 [앱 다시 열기]이고 누르면 앱을 다시 연다', async () => {
    const onReload = vi.fn()
    const onPickAgain = vi.fn()
    render(<ExcelProblem problem="load-failed" route="settings" onBack={vi.fn()} onPickAgain={onPickAgain} onReload={onReload} />)

    await userEvent.click(screen.getByRole('button', { name: '앱 다시 열기' }))

    expect(onReload).toHaveBeenCalledOnce()
    expect(onPickAgain).not.toHaveBeenCalled()
  })

  it.each(['too-large', 'backup-file', 'not-excel', 'no-sheets'] as const)('%s 면 주 버튼이 [파일 다시 고르기]다', async (problem) => {
    const onPickAgain = vi.fn()
    render(<ExcelProblem problem={problem} route="settings" onBack={vi.fn()} onPickAgain={onPickAgain} onReload={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: '파일 다시 고르기' }))

    expect(onPickAgain).toHaveBeenCalledOnce()
  })
})
