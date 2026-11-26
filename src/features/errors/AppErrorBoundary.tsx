import { Component, type ReactNode } from 'react'
import { ReopenPage } from './ReopenScreen'

type AppErrorBoundaryProps = {
  children: ReactNode
  // 잡은 그리기 오류 (오류 기록기가 render 로 센다). 여기서 난 오류는 삼킨다
  onError?: (error: unknown) => void
  // [다시 열기]: 기본은 지금 주소를 처음부터 다시 연다 (시험에서 바꿔 넣는다)
  reload?: () => void
}

type AppErrorBoundaryState = { failed: boolean }

const reloadPage = () => window.location.reload()

// 오류 경계 (SPEC-012 2절): 진입점(main.tsx)이 앱 전체를 감싼다. 화면을 그리다 오류가 나면 흰 화면 대신 "다시 열기" 화면.
// 화면 이름은 App·AppRoot 가 그리기 전에 오류 기록기에 알린 "그리려던 화면" 이름을 쓴다(onError 쪽). 이 부품은 앱 상태·저장소를 읽지 않는다
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    try {
      this.props.onError?.(error)
    } catch {
      // 기록하다 생긴 오류는 세지 않는다. 다시 열기 화면은 그대로
    }
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return <ReopenPage onReopen={this.props.reload ?? reloadPage} />
  }
}
