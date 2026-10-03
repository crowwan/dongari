import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabBar } from './TabBar'

describe('TabBar', () => {
  it('장부/보고서/설정 탭을 글자와 함께 보여준다', () => {
    render(<TabBar current="ledger" onChange={() => {}} />)

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['장부', '보고서', '설정'])
  })

  it('지금 탭만 aria-selected 가 true 다', () => {
    render(<TabBar current="report" onChange={() => {}} />)

    expect(screen.getByRole('tab', { name: '보고서' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '장부' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: '설정' })).toHaveAttribute('aria-selected', 'false')
  })

  it('탭을 누르면 그 탭 이름으로 onChange 가 불린다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<TabBar current="ledger" onChange={handleChange} />)

    await user.click(screen.getByRole('tab', { name: '설정' }))

    expect(handleChange).toHaveBeenCalledWith('settings')
  })
})
