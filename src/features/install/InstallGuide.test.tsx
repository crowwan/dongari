/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallGuide } from './InstallGuide'
import { INSTALL_GUIDE_STEPS, INSTALL_GUIDE_WORDS } from './installGuideSteps'

const stepText = () => screen.getByTestId('slide-guide-text')
const nextButton = () => screen.getByRole('button', { name: '다음' })

describe('SPEC-009 A 그림으로 따라 하는 설치 안내', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-3 크롬이면 1 / 4 장에 주소창 오른쪽 ⋮ 그림과 글 줄이 보이고 [이전] 은 누를 수 없다', () => {
    render(<InstallGuide browser="chrome" onFinish={() => {}} />)

    expect(stepText()).toHaveTextContent('1 / 4, 화면 위 오른쪽 [⋮] 메뉴를 누르세요')
    const picture = screen.getByTestId('browser-picture')
    expect(picture).toHaveAttribute('data-picture', 'chrome-menu-button')
    expect(picture.querySelector('[data-place="top"] [data-hot] [data-icon="kebab"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
  })

  it('AC-3 삼성 인터넷이면 1 / 4 장에 화면 아래 오른쪽 ≡ 그림과 글 줄이 보인다', () => {
    render(<InstallGuide browser="samsung" onFinish={() => {}} />)

    expect(stepText()).toHaveTextContent('1 / 4, 화면 아래 오른쪽 [≡] 메뉴를 누르세요')
    const picture = screen.getByTestId('browser-picture')
    expect(picture.querySelector('[data-place="bottom"] [data-hot] [data-icon="menu"]')).toBeInTheDocument()
  })

  it('AC-4 [다음] 으로 2·3장을 넘기면 4장은 홈 화면 모습 그림이고 버튼이 [다 했어요] 다. 누르면 끝났다고 알린다', async () => {
    const onFinish = vi.fn()
    render(<InstallGuide browser="chrome" onFinish={onFinish} />)

    await userEvent.click(nextButton())
    expect(stepText()).toHaveTextContent('2 / 4, [홈 화면에 추가] 또는 [앱 설치] 를 누르세요')
    await userEvent.click(nextButton())
    expect(stepText()).toHaveTextContent('3 / 4, [설치] 를 누르세요')
    await userEvent.click(nextButton())

    expect(stepText()).toHaveTextContent("4 / 4, 홈 화면에 '우리 장부' 가 생겨요")
    expect(screen.getByTestId('home-screen-preview')).toBeInTheDocument()
    expect(screen.getByText('누르면 바로 장부가 열려요')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '다 했어요' }))
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('AC-4 삼성 인터넷은 2장 [현재 페이지 추가] → [홈 화면], 3장 [추가], 4장 홈 화면 모습 그림이다', async () => {
    render(<InstallGuide browser="samsung" onFinish={() => {}} />)

    await userEvent.click(nextButton())
    expect(stepText()).toHaveTextContent('2 / 4, [현재 페이지 추가] 를 누르고 [홈 화면] 을 고르세요')
    await userEvent.click(nextButton())
    expect(stepText()).toHaveTextContent('3 / 4, [추가] 를 누르세요')
    await userEvent.click(nextButton())
    expect(screen.getByTestId('home-screen-preview')).toBeInTheDocument()
  })

  it('AC-5 시간이 지나도 장이 저절로 넘어가지 않는다', () => {
    vi.useFakeTimers()
    render(<InstallGuide browser="chrome" onFinish={() => {}} />)

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })

    expect(stepText()).toHaveTextContent('1 / 4,')
  })

  it('AC-6 크롬·삼성 인터넷이 아니면 "지금 쓰는 앱을 골라 주세요" 와 [인터넷(삼성)]·[크롬] 이 먼저 보이고 그림은 없다', () => {
    render(<InstallGuide browser="other" onFinish={() => {}} />)

    expect(screen.getByText('지금 쓰는 앱을 골라 주세요')).toBeVisible()
    const choices = screen.getByRole('group', { name: '지금 쓰는 앱을 골라 주세요' })
    expect(within(choices).getAllByRole('button').map((button) => button.textContent)).toEqual(['인터넷(삼성)', '크롬'])
    expect(screen.queryByTestId('browser-picture')).toBe(null)
    expect(screen.queryByRole('button', { name: '다음' })).toBe(null)
  })

  it('AC-6 고르면 그 브라우저의 1장이 나오고, 고른 칩이 남아 다시 바꾸면 그 브라우저 1장부터 본다', async () => {
    render(<InstallGuide browser="other" onFinish={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: '인터넷(삼성)' }))
    expect(screen.getByRole('button', { name: '인터넷(삼성)' })).toHaveAttribute('aria-pressed', 'true')
    expect(stepText()).toHaveTextContent('1 / 4, 화면 아래 오른쪽 [≡] 메뉴를 누르세요')
    await userEvent.click(nextButton())

    await userEvent.click(screen.getByRole('button', { name: '크롬' }))
    expect(stepText()).toHaveTextContent('1 / 4, 화면 위 오른쪽 [⋮] 메뉴를 누르세요')
  })

  it('AC-7 장마다 화면 읽기에 장 번호와 그 장의 글 줄이 읽히고, 그림 자체는 읽지 않는다', async () => {
    render(<InstallGuide browser="chrome" onFinish={() => {}} />)

    for (const [index, step] of INSTALL_GUIDE_STEPS.chrome.entries()) {
      expect(stepText()).toHaveAttribute('aria-live', 'polite')
      expect(stepText()).toHaveTextContent(`${index + 1} / 4, ${step.text}`)
      const picture = screen.queryByTestId('browser-picture') ?? screen.getByTestId('home-screen-preview')
      expect(picture.closest('[aria-hidden="true"]') ?? picture.querySelector('[aria-hidden="true"]')).not.toBe(null)
      if (index < 3) await userEvent.click(nextButton())
    }
    expect(screen.queryByRole('img')).toBe(null)
  })

  it('그림 속 진하게 쓴 누를 줄 글자가 그 장 글 줄의 [ ] 글자와 같다 (문구는 installGuideSteps 한 곳에서 고친다)', async () => {
    const { chrome, samsung } = INSTALL_GUIDE_WORDS
    expect(INSTALL_GUIDE_STEPS.chrome[1].text).toContain(`[${chrome.addItem}]`)
    expect(INSTALL_GUIDE_STEPS.chrome[2].text).toContain(`[${chrome.confirm}]`)
    expect(INSTALL_GUIDE_STEPS.samsung[1].text).toContain(`[${samsung.addItem}]`)
    expect(INSTALL_GUIDE_STEPS.samsung[1].text).toContain(`[${samsung.subTarget}]`)
    expect(INSTALL_GUIDE_STEPS.samsung[2].text).toContain(`[${samsung.confirm}]`)

    render(<InstallGuide browser="chrome" onFinish={() => {}} />)
    await userEvent.click(nextButton())
    expect(screen.getByTestId('browser-picture').querySelector('[data-hot]')).toHaveTextContent(chrome.addItem)
    await userEvent.click(nextButton())
    expect(screen.getByTestId('browser-picture').querySelector('[data-hot]')).toHaveTextContent(chrome.confirm)
  })

  it('AC-8 누를 곳 화살표·동그라미 깜빡임은 동작 줄이기를 켜지 않았을 때만 쓴다', () => {
    const css = readFileSync('src/features/install/browserPicture.css', 'utf8')
    const [outside, motionBlock = ''] = css.split('@media (prefers-reduced-motion: no-preference)')

    expect(outside).not.toMatch(/animation:/)
    expect(motionBlock).toMatch(/\.tap-mark \{\s*animation: tap-blink var\(--motion-blink\)/)

    render(<InstallGuide browser="chrome" onFinish={() => {}} />)
    const marks = screen.getByTestId('browser-picture').querySelectorAll('.tap-mark')
    expect([...marks].map((mark) => mark.getAttribute('data-mark'))).toEqual(['ring', 'arrow'])
  })
})
