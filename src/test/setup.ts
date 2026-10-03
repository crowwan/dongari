// jest-dom 매처(toBeInTheDocument, toHaveValue 등)를 Vitest expect 에 등록한다
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// globals 를 쓰지 않으므로 Testing Library 자동 정리가 동작하지 않는다 → 테스트마다 직접 정리
afterEach(() => {
  cleanup()
})
