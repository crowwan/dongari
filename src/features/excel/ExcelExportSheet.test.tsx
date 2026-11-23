import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExcelExportSheet } from './ExcelExportSheet'
import type { ExcelExportState } from './useExcelExport'

function renderSheet(state: ExcelExportState) {
  const close = vi.fn()
  const onReload = vi.fn()
  render(<ExcelExportSheet flow={{ state, open: true, close }} onReload={onReload} />)
  return { close, onReload }
}

describe('SPEC-010 엑셀 내보내기 선택 창 (9절, #167)', () => {
  it('만드는 중: 창 이름 "엑셀 파일을 만드는 중이에요", 처음 한 번은 엑셀 기능을 받느라 걸린다는 안내, 바쁨 표시', () => {
    renderSheet({ step: 'making' })

    const dialog = screen.getByRole('dialog', { name: '엑셀 파일을 만드는 중이에요' })
    expect(dialog).toHaveTextContent('처음 한 번은 엑셀 기능을 받느라 조금 더 걸려요')
    expect(screen.getByTestId('excel-export')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('받지 못함: [앱 다시 열기]를 누르면 앱을 다시 열고, [닫기]는 창만 닫는다', async () => {
    const { close, onReload } = renderSheet({ step: 'load-failed' })

    await userEvent.click(screen.getByRole('button', { name: '앱 다시 열기' }))
    expect(onReload).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('저장 안내: 사실 목록(어디에·파일·담긴 것) + 카톡으로 보내는 길 + [닫기]', async () => {
    const { close } = renderSheet({ step: 'saved', fileName: '다솜회 장부 2026-11-24.xlsx', years: '2026년', sheets: '입출금내역' })

    expect(screen.getByRole('dialog', { name: '엑셀 파일을 저장했어요' })).toBeInTheDocument()
    expect(screen.getByText('파일').nextElementSibling).toHaveTextContent('다솜회 장부 2026-11-24.xlsx')
    expect(screen.getByText('담긴 것').nextElementSibling).toHaveTextContent('2026년입출금내역')
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(close).toHaveBeenCalledOnce()
  })
})
