import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Toast } from './Toast'

// 부모가 메시지를 들고 있다가 onDone 에서 지우는 실제 사용 모양
function Harness({ initial, duration }: { initial: string; duration?: number }) {
  const [message, setMessage] = useState<string | null>(initial)
  return <Toast message={message} duration={duration} onDone={() => setMessage(null)} />
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('알림 문장을 role="status" 영역에 보여준다', () => {
    render(<Harness initial="저장했어요" />)

    expect(screen.getByRole('status')).toHaveTextContent('저장했어요')
  })

  it('기본 2초가 지나면 사라진다', () => {
    render(<Harness initial="저장했어요" />)

    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(screen.getByText('저장했어요')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('저장했어요')).not.toBeInTheDocument()
  })

  it('보여주는 시간을 바꿀 수 있다', () => {
    render(<Harness initial="지웠어요" duration={500} />)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.queryByText('지웠어요')).not.toBeInTheDocument()
  })

  it('긴 문장은 읽을 시간을 글자 수만큼 더 준다 (글자당 0.12초, 짧으면 2초)', () => {
    // 37글자 → 4.44초
    const message = '사진을 저장했어요. 갤러리의 Download 앨범에서 볼 수 있어요'
    render(<Harness initial={message} />)

    act(() => {
      vi.advanceTimersByTime(message.length * 120 - 1)
    })
    expect(screen.getByText(message)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })

  it('메시지가 없으면 빈 알림 영역만 남는다', () => {
    render(<Toast message={null} onDone={() => {}} />)

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
