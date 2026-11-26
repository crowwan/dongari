// 앱 오류 기록기 (SPEC-012 2절): 화면 그리기 오류·잡히지 않은 오류·Promise 거절·저장 실패 띠를 정리해 폰에 묶어 두고,
// 기록할 때마다 "보낼 일이 생김"을 알린다 (자동 보관기가 상태 신호를 바로 보낸다, main.tsx).
// 진입점(main.tsx)이 화면을 고르기 전에 하나 만들어 window 를 듣고, 오류 경계·App 이 같은 것을 쓴다.
// 기록하다 생긴 오류는 세지 않는다: 기록은 예외를 내지 않고, 기록하는 동안 또 기록하지 않는다
import { addError, rawErrorOf, recentErrors, seenError, UNKNOWN_SCREEN, type AppError, type AppErrorKind } from './appErrors'
import type { AppErrorStore } from './appErrorStore'

// window 의 error 이벤트만 주는 위치 (스택이 없을 때 쓴다)
type ErrorPlace = { filename?: string; line?: number; column?: number }

// App 이 쓰는 쪽: 지금 화면 이름(오류가 난 화면)과 저장 실패 띠
export interface AppErrorReporter {
  setScreen: (name: string) => void
  recordSave: (reason: string) => void
}

export interface AppErrorRecorderOptions {
  store: AppErrorStore
  // 앱 출처 (location.origin): 앱 파일의 오류만 센다
  origin: string
  now?: () => Date
}

export class AppErrorRecorder implements AppErrorReporter {
  private readonly store: AppErrorStore
  private readonly origin: string
  private readonly now: () => Date
  // 폰 저장소에 쓰지 못해도(저장 공간 모자람) 이번에 연 동안은 이 목록으로 보낸다
  private errors: AppError[]
  private screen = UNKNOWN_SCREEN
  private recording = false
  private readonly listeners = new Set<() => void>()

  constructor({ store, origin, now = () => new Date() }: AppErrorRecorderOptions) {
    this.store = store
    this.origin = origin
    this.now = now
    this.errors = store.load()
  }

  // 지금 둔 오류: 7일 안, 5줄까지, 마지막 때 순 (상태 신호에 싣는다)
  list = (): AppError[] => recentErrors(this.errors, this.now())

  // 지금 그리려는 화면 (App: useScreenHistory 의 screen.name, AppRoot: first-run·practice·in-app).
  // App·AppRoot 가 그리기 전에 알려, 새 화면이 처음 그릴 때 던져도 그 화면 이름이 된다
  setScreen = (name: string): void => {
    this.screen = name
  }

  // 저장 실패 띠가 떴다 (storageNotices). 이름은 실패 이유(quota-exceeded 등)
  recordSave = (reason: string): void => {
    this.record('save', { name: reason, message: '' })
  }

  // 오류 하나를 기록한다. 세지 않는 것(사용자 취소, 앱 밖 스크립트 오류)이면 아무것도 하지 않는다
  record(kind: AppErrorKind, value: unknown, place: ErrorPlace = {}): void {
    if (this.recording) return
    this.recording = true
    try {
      const seen = seenError(kind, { ...rawErrorOf(value), ...place }, this.screen, this.origin)
      if (seen === undefined) return
      this.errors = addError(this.errors, seen, this.now())
      this.store.save(this.errors)
      this.listeners.forEach((listener) => listener())
    } catch {
      // 기록하다(알리다) 생긴 오류는 세지 않는다
    } finally {
      this.recording = false
    }
  }

  // 오류를 기록할 때마다 부른다 (보낼 일이 생김). 떼는 함수를 돌려준다
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // 잡히지 않은 오류(error)·Promise 거절(unhandledrejection)을 듣는다. 떼는 함수를 돌려준다.
  // error 중 ErrorEvent 가 아닌 것(이미지 등 파일 읽기 실패)은 오류가 아니다. 다른 출처 스크립트는 error 가 없고 글이 Script error. 다
  listen(win: EventTarget): () => void {
    const onError = (event: Event) => {
      if (!(event instanceof ErrorEvent)) return
      const value: unknown = event.error ?? { name: 'Error', message: event.message }
      this.record('uncaught', value, { filename: event.filename, line: event.lineno, column: event.colno })
    }
    const onRejection = (event: Event) => {
      if ('reason' in event) this.record('rejection', event.reason)
    }
    win.addEventListener('error', onError)
    win.addEventListener('unhandledrejection', onRejection)
    return () => {
      win.removeEventListener('error', onError)
      win.removeEventListener('unhandledrejection', onRejection)
    }
  }
}
