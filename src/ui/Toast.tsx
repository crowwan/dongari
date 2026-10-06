import { useEffect, useRef } from 'react'
import './ui.css'

// 저장·삭제 결과를 읽을 시간은 주되 다음 입력을 막지 않는 길이
const MIN_DURATION_MS = 2000
// 긴 안내("사진을 저장했어요. 갤러리의 …")는 끝까지 읽을 시간을 글자 수만큼 준다
const PER_CHARACTER_MS = 120

// 짧은 알림은 2초, 긴 문장은 글자 수 × 0.12초
function readingTime(message: string): number {
  return Math.max(MIN_DURATION_MS, message.length * PER_CHARACTER_MS)
}

type ToastProps = {
  // null 이면 아무것도 보이지 않는다
  message: string | null
  // 보여 주는 시간(ms). 주지 않으면 글자 수에 맞춘다
  duration?: number
  // 보여주는 시간이 끝나면 불린다. 부모가 message 를 null 로 돌린다
  onDone: () => void
}

// 잠깐 떴다 사라지는 알림. 화면 읽기 프로그램이 읽도록 role="status" 영역은 늘 남겨 둔다
export function Toast({ message, duration, onDone }: ToastProps) {
  // 부모가 다시 그려질 때마다 onDone 이 새로 만들어져도 타이머가 처음부터 다시 돌지 않게 한다
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    if (message === null) return
    const timer = window.setTimeout(() => onDoneRef.current(), duration ?? readingTime(message))
    return () => window.clearTimeout(timer)
  }, [message, duration])

  return (
    <div className="ui-toast-region" role="status" aria-live="polite" data-testid="toast">
      {message !== null && <div className="ui-toast">{message}</div>}
    </div>
  )
}
