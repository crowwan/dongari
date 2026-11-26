import { useEffect, useState } from 'react'
import { DEV_CRASH_MESSAGE } from './crashRequest'

// 앱 옆에 그려 두면, 앱이 한 번 그려진 뒤(App 이 오류 기록기에 화면 이름을 알린 뒤) 다음 그리기에서 오류를 던진다 (SPEC-012 AC-11).
// 오류 경계가 잡아 "다시 열기" 화면을 띄우고 render 로 센다
export function DevCrash() {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setArmed(true))
    return () => clearTimeout(timer)
  }, [])
  if (armed) throw new Error(DEV_CRASH_MESSAGE)
  return null
}
