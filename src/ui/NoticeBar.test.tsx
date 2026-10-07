import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NoticeBar } from './NoticeBar'

describe('NoticeBar', () => {
  it('알아 둘 내용을 바로 읽히는 안내 띠로 보여준다', () => {
    render(<NoticeBar message="저장하지 못했어요. 백업 파일을 보내 두세요" />)

    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요. 백업 파일을 보내 두세요')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('할 일이 있으면 문장 아래 버튼을 붙이고, 읽히는 안내에는 버튼 글자가 섞이지 않는다', async () => {
    const handleClick = vi.fn()
    render(
      <NoticeBar
        message="저장하지 못했어요. 백업 파일을 보내 두세요"
        action={{ label: '백업 파일 보내기', onClick: handleClick }}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/^저장하지 못했어요. 백업 파일을 보내 두세요$/)
    await userEvent.click(screen.getByRole('button', { name: '백업 파일 보내기' }))
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('버튼에 아이콘을 붙일 수 있고 이름은 글자로만 읽힌다', () => {
    render(<NoticeBar message="한 달 넘게 백업하지 않았어요" action={{ label: '백업 파일 보내기', icon: 'share', onClick: () => {} }} />)

    const button = screen.getByRole('button', { name: '백업 파일 보내기' })
    expect(button.querySelector('[data-icon="share"]')).toHaveAttribute('aria-hidden', 'true')
  })
})
