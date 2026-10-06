import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabBar } from './TabBar'

describe('TabBar', () => {
  it('장부/보고서/설정을 글자 있는 버튼으로 보여준다', () => {
    render(<TabBar current="ledger" onChange={() => {}} />)

    const navigation = screen.getByRole('navigation', { name: '화면 바꾸기' })
    const buttons = within(navigation).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['장부', '보고서', '설정'])
  })

  it('tabpanel·화살표 키를 기대하게 만드는 tab 역할은 쓰지 않는다', () => {
    render(<TabBar current="ledger" onChange={() => {}} />)

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('지금 화면 탭만 aria-current="page" 다', () => {
    render(<TabBar current="report" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: '보고서' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '장부' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: '설정' })).not.toHaveAttribute('aria-current')
  })

  it('탭을 누르면 그 탭 이름으로 onChange 가 불린다', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<TabBar current="ledger" onChange={handleChange} />)

    await user.click(screen.getByRole('button', { name: '설정' }))

    expect(handleChange).toHaveBeenCalledWith('settings')
  })
})
