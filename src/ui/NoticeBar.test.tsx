import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NoticeBar } from './NoticeBar'

describe('NoticeBar', () => {
  it('알아 둘 내용을 바로 읽히는 안내 띠로 보여준다', () => {
    render(<NoticeBar message="저장하지 못했어요. 백업 파일을 보내 두세요" />)

    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요. 백업 파일을 보내 두세요')
  })
})
