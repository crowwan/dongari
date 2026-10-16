import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { APP_SHORT_NAME } from '../../pwa/appName'
import { HomeScreenPreview } from './HomeScreenPreview'

describe('SPEC-009 홈 화면 모습 그림', () => {
  it('AC-1 흐린 도형 사이로 앱 아이콘(icons/icon-192.png)과 manifest short_name 과 같은 이름이 보이고, 아래에 "누르면 바로 장부가 열려요" 가 있다', () => {
    render(<HomeScreenPreview />)

    const preview = screen.getByTestId('home-screen-preview')
    const icon = preview.querySelector('img')
    expect(icon).toHaveAttribute('src', `${import.meta.env.BASE_URL}icons/icon-192.png`)
    expect(preview.querySelector('[data-app="ours"]')).toHaveTextContent(APP_SHORT_NAME)
    expect(preview.querySelectorAll('[data-app="other"]')).toHaveLength(7)
    expect(screen.getByText('누르면 바로 장부가 열려요')).toBeVisible()
  })

  it('AC-2 화면 읽기에는 그림이 "홈 화면에 \'우리 장부\' 아이콘이 생겨요" 한 줄로 읽히고 흐린 도형은 읽히지 않는다', () => {
    render(<HomeScreenPreview />)

    const pictures = screen.getAllByRole('img')
    expect(pictures).toHaveLength(1)
    expect(pictures[0]).toHaveAccessibleName("홈 화면에 '우리 장부' 아이콘이 생겨요")
    // 그림 안 글자·도형(앱 여덟 칸)은 모두 화면 읽기에서 숨긴 묶음 안에 있다
    const hidden = pictures[0].querySelector('[aria-hidden="true"]')
    expect(hidden?.querySelectorAll('[data-app]')).toHaveLength(8)
  })

  it('아이콘 파일을 읽지 못하면 그 칸은 청록 면 둥근 네모로 두고 이름은 그대로 보인다', () => {
    render(<HomeScreenPreview />)
    const preview = screen.getByTestId('home-screen-preview')

    fireEvent.error(preview.querySelector('img') ?? document.body)

    expect(preview.querySelector('img')).toBe(null)
    expect(preview.querySelector('[data-app="ours"] [data-icon-fallback]')).toBeInTheDocument()
    expect(preview.querySelector('[data-app="ours"]')).toHaveTextContent(APP_SHORT_NAME)
  })

  it('그림 안내 마지막 장처럼 옆에 글 줄이 따로 있으면 그림은 읽지 않고 아래 줄만 읽힌다', () => {
    render(<HomeScreenPreview decorative />)

    expect(screen.queryByRole('img')).toBe(null)
    expect(screen.getByText('누르면 바로 장부가 열려요')).toBeVisible()
  })
})
