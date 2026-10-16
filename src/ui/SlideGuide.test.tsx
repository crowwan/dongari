import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlideGuide, type Slide } from './SlideGuide'

const SLIDES: Slide[] = [
  { picture: <div data-testid="picture-a" />, text: '첫째 장 글' },
  { picture: <div data-testid="picture-b" />, text: '둘째 장 글' },
  { picture: <div data-testid="picture-c" />, text: '셋째 장 글' },
]

function renderGuide(onFinish = vi.fn()) {
  render(<SlideGuide slides={SLIDES} finishLabel="다 했어요" onFinish={onFinish} />)
  return onFinish
}

const prevButton = () => screen.getByRole('button', { name: '이전' })
const stepText = () => screen.getByTestId('slide-guide-text')

describe('SPEC-009 넘겨 보는 안내 틀 (SlideGuide)', () => {
  it('첫 장 그림과 "1 / 3" 글 줄이 보이고 [이전] 은 누를 수 없다', () => {
    renderGuide()

    expect(screen.getByTestId('picture-a')).toBeInTheDocument()
    expect(stepText()).toHaveTextContent('1 / 3, 첫째 장 글')
    expect(prevButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled()
  })

  it('[다음]·[이전] 으로 한 장씩 넘기고, 장이 바뀌면 글 줄이 장 번호와 함께 다시 읽힌다(aria-live)', async () => {
    renderGuide()

    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByTestId('picture-b')).toBeInTheDocument()
    expect(screen.queryByTestId('picture-a')).toBe(null)
    expect(stepText()).toHaveTextContent('2 / 3, 둘째 장 글')
    expect(stepText()).toHaveAttribute('aria-live', 'polite')
    expect(prevButton()).toBeEnabled()

    await userEvent.click(prevButton())
    expect(stepText()).toHaveTextContent('1 / 3, 첫째 장 글')
  })

  it('마지막 장에서는 [다음] 이 끝 버튼 이름으로 바뀌고, 누르면 끝났다고 알린다', async () => {
    const onFinish = renderGuide()

    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    await userEvent.click(screen.getByRole('button', { name: '다음' }))

    expect(screen.queryByRole('button', { name: '다음' })).toBe(null)
    expect(onFinish).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '다 했어요' }))
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('[이전] 으로 첫 장에 오면 누를 수 없게 된 [이전] 대신 [다음] 에 포커스를 둔다', async () => {
    renderGuide()
    await userEvent.click(screen.getByRole('button', { name: '다음' }))

    await userEvent.click(prevButton())

    expect(screen.getByRole('button', { name: '다음' })).toHaveFocus()
  })
})
