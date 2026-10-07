import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('아이콘 옆에 늘 글자가 있고 글자로 읽힌다 (아이콘은 숨김)', () => {
    render(
      <IconButton icon="settings" onClick={() => {}}>
        설정
      </IconButton>,
    )

    const button = screen.getByRole('button', { name: '설정' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.querySelector('[data-icon="settings"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('누르면 onClick 이 불린다', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(
      <IconButton icon="left" onClick={handleClick}>
        장부로
      </IconButton>,
    )

    await user.click(screen.getByRole('button', { name: '장부로' }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('기본은 면 없는 글자 버튼, fill 이면 회색 면 버튼이다 (data-variant)', () => {
    render(
      <>
        <IconButton icon="chart" onClick={() => {}}>
          결산
        </IconButton>
        <IconButton icon="receipt" variant="fill" onClick={() => {}}>
          10월 정리 보기
        </IconButton>
      </>,
    )

    expect(screen.getByRole('button', { name: '결산' })).toHaveAttribute('data-variant', 'plain')
    expect(screen.getByRole('button', { name: '10월 정리 보기' })).toHaveAttribute('data-variant', 'fill')
  })

  it('점 표시: 점을 그리고 화면 읽기 이름에도 이유를 붙인다 (색만으로 알리지 않는다)', () => {
    render(
      <IconButton icon="settings" dotLabel="백업 필요" onClick={() => {}}>
        설정
      </IconButton>,
    )

    const button = screen.getByRole('button', { name: '설정 백업 필요' })
    expect(button).toHaveAttribute('data-dot', 'true')
    expect(screen.getByTestId('icon-button-dot')).toHaveAttribute('aria-hidden', 'true')
  })
})
