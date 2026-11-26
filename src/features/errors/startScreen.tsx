import { StrictMode, type ReactNode } from 'react'
import type { Root } from 'react-dom/client'
import { AppErrorBoundary } from './AppErrorBoundary'
import type { AppErrorRecorder } from './AppErrorRecorder'
import { ReopenPage } from './ReopenScreen'

const reloadPage = () => window.location.reload()

// 진입점(main.tsx)이 고른 화면을 오류 경계 안에 그린다 (SPEC-012 2절).
// 화면 고르기(시작 코드: 저장소 읽기·보관기 준비·조각 받기)가 던지면 오류 경계가 아직 없어 흰 화면이 남으므로,
// 그 오류를 render 로 세고 다시 열기 화면을 바로 그린다 — 시작 때도 흰 화면 대신 "다시 열기"
export async function renderStartScreen(
  root: Pick<Root, 'render'>,
  pick: () => Promise<ReactNode>,
  errors: Pick<AppErrorRecorder, 'record'>,
  reload: () => void = reloadPage,
): Promise<void> {
  const onError = (error: unknown) => errors.record('render', error)
  let screen: ReactNode
  try {
    screen = await pick()
  } catch (error) {
    onError(error)
    root.render(<ReopenPage onReopen={reload} />)
    return
  }
  root.render(
    <StrictMode>
      <AppErrorBoundary onError={onError} reload={reload}>
        {screen}
      </AppErrorBoundary>
    </StrictMode>,
  )
}
