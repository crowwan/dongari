// 자동 보관기 (SPEC-006): 저장소가 저장에 성공했다는 알림을 받아 암호화한 보관본을 서버에 덮어쓴다.
// 저장 계층과 따로 있다 — 저장소는 알림만 보내고(storage/NotifyingRepository), 보관이 실패해도 앱 저장·사용은 그대로다.
// - 저장 알림 → 10초 모아서 한 번 (연달아 적기 중 여러 번 올리지 않게, 첫 저장부터 10초)
// - 화면을 떠나면(visibilitychange hidden) 기다리지 않고 남은 것을 바로
// - 실패·인터넷 없음은 조용히 밀린 채로 두고 다음 저장·앱 열기·연결 회복(online) 때 다시
// - 읽기 전용(SPEC-002)이면 저장이 실패해 알림이 오지 않고, 진입점도 앱을 열 때 올리지 않는다
// - 앱을 열 때 올리기 시도가 끝나면 상태 신호를 한 번 보낸다 (SPEC-007, 꺼져 있어도. 복구 코드가 없으면 안 보낸다)
import type { StoredData } from '../../domain/types'
import { createBackup } from '../../storage/backup'
import { keepIdOf, sealKeep } from './keepCrypto'
import type { KeepServer, KeepStatus } from './keepServer'
import { recoveryCodeOf } from './recoveryCode'

// 기기에만 두는 보관 상태 (백업 파일에 넣지 않는다 — 폰마다 다르다)
export interface KeepState {
  enabled: boolean // 자동 보관 켜짐 (기본 켜짐, 설정에서 끈다)
  lastKeptAt?: string // 마지막으로 올리는 데 성공한 때
  pendingSince?: string // 아직 올리지 못한 변경이 처음 생긴 때. 없으면 밀린 것 없음 (7일 안내가 본다)
  tooLarge?: boolean // 보관본이 1MB 를 넘어 올리지 못했다
}

export interface KeepStateStore {
  load: () => KeepState
  save: (state: KeepState) => void
}

export interface AutoKeeperOptions {
  server: KeepServer
  store: KeepStateStore
  now?: () => Date
  delayMs?: number // 저장을 모으는 시간 (기본 10초)
  appVersion?: string // 상태 신호에 넣는 앱 버전 (기본 빌드 때 넣은 package.json version)
}

const BATCH_DELAY_MS = 10_000

export class AutoKeeper {
  private readonly server: KeepServer
  private readonly store: KeepStateStore
  private readonly now: () => Date
  private readonly delayMs: number
  private readonly appVersion: string
  private state: KeepState
  private readonly listeners = new Set<() => void>()
  // 올릴 기록 (마지막으로 저장한 것)
  private latest: StoredData | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private uploading: Promise<void> | undefined
  // 올리는 동안 새로 저장한 때. 다 올린 뒤에도 그만큼은 밀린 채로 남는다
  private savedDuringUpload: string | undefined

  constructor({
    server,
    store,
    now = () => new Date(),
    delayMs = BATCH_DELAY_MS,
    appVersion = __APP_VERSION__,
  }: AutoKeeperOptions) {
    this.server = server
    this.store = store
    this.now = now
    this.delayMs = delayMs
    this.appVersion = appVersion
    this.state = store.load()
  }

  // useSyncExternalStore 용 (화면의 "켜짐 · 3분 전", 7일 안내)
  getState = (): KeepState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // 앱을 열 때: 밀린 것이 있거나 한 번도 보관하지 않았으면(이 버전을 처음 연 폰) 바로 올린다.
  // 올리기 시도가 끝나면(올릴 것이 없으면 바로) 상태 신호를 한 번 보낸다. 신호까지 끝나면 풀린다
  async start(data: StoredData): Promise<void> {
    this.latest = data
    if (this.needsUploadOnStart(data)) {
      this.markPending()
      await this.upload()
    }
    await this.reportStatus(data)
  }

  // 저장소가 저장에 성공했다 (기록 변경·백업 불러오기·복구 코드로 불러오기)
  saved(data: StoredData): void {
    this.latest = data
    if (!this.state.enabled) return
    this.markPending()
    if (this.uploading) this.savedDuringUpload ??= this.now().toISOString()
    // 첫 저장부터 10초: 계속 적어도 미뤄지지 않는다
    this.timer ??= setTimeout(() => {
      this.timer = undefined
      void this.upload()
    }, this.delayMs)
  }

  // 기다리지 않고 밀린 것을 올린다 (화면을 떠날 때, 연결 회복)
  flush(): Promise<void> {
    if (!this.state.enabled || this.state.pendingSince === undefined) return this.idle()
    return this.upload()
  }

  // 지금 기록을 10초 모으기 없이 바로 올린다 (SPEC-009 C 카톡 안 장부 옮기기). 다 올라갔는지.
  // 실패하면 밀린 채로 두고 혼자 다시 하지 않는다 — 부른 쪽이 연결 회복(online) 때 다시 부른다
  async keepNow(data: StoredData): Promise<boolean> {
    if (!this.state.enabled) return false
    this.latest = data
    this.markPending()
    // 올리는 중이던 것을 기다리기만 했으면 이 기록은 아직 밀려 있다 → 끝난 뒤 한 번 더
    const waitedOther = this.uploading !== undefined
    if (waitedOther) this.savedDuringUpload ??= this.now().toISOString()
    await this.upload()
    if (waitedOther && this.state.pendingSince !== undefined) await this.upload()
    return this.state.enabled && this.state.pendingSince === undefined
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.state.enabled) return
    if (!enabled) {
      this.cancelTimer()
      this.update({ enabled: false, lastKeptAt: this.state.lastKeptAt })
      return
    }
    this.update({ ...this.state, enabled: true })
    if (this.latest && this.latest.books.length > 0) {
      this.markPending()
      void this.upload()
    }
  }

  // 서버 사본을 지운다 (끌 때 [지우기]). 지웠는지
  async forget(): Promise<boolean> {
    const code = this.latest && recoveryCodeOf(this.latest)
    if (code === undefined) return false
    return this.server.remove(await keepIdOf(code))
  }

  // 화면을 떠날 때·연결이 돌아올 때 올린다. 떼는 함수를 돌려준다
  listen(win: EventTarget, doc: EventTarget, visibility: () => DocumentVisibilityState): () => void {
    const onVisibility = () => {
      if (visibility() === 'hidden') void this.flush()
    }
    const onOnline = () => void this.flush()
    doc.addEventListener('visibilitychange', onVisibility)
    win.addEventListener('online', onOnline)
    return () => {
      doc.removeEventListener('visibilitychange', onVisibility)
      win.removeEventListener('online', onOnline)
    }
  }

  // 올리는 중인 것이 끝날 때까지 (테스트·화면이 기다린다)
  async idle(): Promise<void> {
    while (this.uploading) await this.uploading
  }

  private needsUploadOnStart(data: StoredData): boolean {
    if (!this.state.enabled || data.books.length === 0) return false
    return this.state.pendingSince !== undefined || this.state.lastKeptAt === undefined
  }

  // 상태 신호 (SPEC-007): 켜짐·밀린 때·마지막 보관·너무 큼·앱 버전만. 장부 내용·복구 코드는 넣지 않는다
  private async reportStatus(data: StoredData): Promise<void> {
    const code = recoveryCodeOf(data)
    if (code === undefined) return
    const { enabled, pendingSince, lastKeptAt, tooLarge = false } = this.state
    const status: KeepStatus = {
      v: 1,
      enabled,
      ...(pendingSince !== undefined && { pendingSince }),
      ...(lastKeptAt !== undefined && { lastKeptAt }),
      tooLarge,
      appVersion: this.appVersion,
    }
    await this.server.sendStatus(await keepIdOf(code), status)
  }

  private markPending() {
    if (this.state.pendingSince === undefined) this.update({ ...this.state, pendingSince: this.now().toISOString() })
  }

  private cancelTimer() {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private update(next: KeepState) {
    this.state = next
    this.store.save(next)
    this.listeners.forEach((listener) => listener())
  }

  private upload(): Promise<void> {
    this.cancelTimer()
    // 올리는 중이면 끝난 뒤 다시 본다 (그 사이 저장은 savedDuringUpload 로 남는다)
    if (this.uploading) return this.idle()
    this.savedDuringUpload = undefined
    this.uploading = this.send().finally(() => {
      this.uploading = undefined
    })
    return this.uploading
  }

  private async send(): Promise<void> {
    const data = this.latest
    const code = data && recoveryCodeOf(data)
    // 코드가 아직 없으면(읽기 전용 등) 밀린 채로 둔다
    if (!data || code === undefined) return
    const savedAt = this.now()
    // 보관본 = 지금 백업 파일 내용 (모든 장부 + 복구 코드, 마지막 백업 시각은 보관한 때)
    const envelope = await sealKeep(code, createBackup(data, savedAt).text, savedAt.toISOString())
    const result = await this.server.put(await keepIdOf(code), envelope)
    if (!this.state.enabled) return
    if (result === 'ok') {
      this.update({
        enabled: true,
        lastKeptAt: this.now().toISOString(),
        ...(this.savedDuringUpload !== undefined && { pendingSince: this.savedDuringUpload }),
      })
    } else if (result === 'too-large') {
      this.update({ ...this.state, tooLarge: true })
    }
  }
}
