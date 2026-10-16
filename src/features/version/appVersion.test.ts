import { describe, expect, it, vi } from 'vitest'
import { createUpdateWatcher, versionLabel } from './appVersion'

// 서비스 워커 쪽 흉내: 지금 화면을 다루는 워커(controller)와 바뀜 알림(controllerchange)만
function fakeWorkers(controlled: boolean) {
  const events = new EventTarget()
  return Object.assign(events, { controller: controlled ? {} : null })
}

describe('SPEC-002 설정 버전 줄 (#135)', () => {
  it('본 주소 빌드는 버전만 보인다', () => {
    expect(versionLabel('2.6.0', undefined)).toBe('2.6.0')
    expect(versionLabel('2.6.0', '')).toBe('2.6.0')
  })

  it('미리보기 빌드는 버전 뒤에 커밋 번호 7자를 붙인다', () => {
    expect(versionLabel('2.6.0', 'abc1234')).toBe('2.6.0 · 미리보기 abc1234')
    expect(versionLabel('2.6.0', 'abc1234def5678')).toBe('2.6.0 · 미리보기 abc1234')
  })
})

describe('SPEC-002 새 버전 받음 알기 (#135)', () => {
  it('옛 워커가 다루던 화면에서 워커가 바뀌면 새 버전을 받은 것이다', () => {
    const workers = fakeWorkers(true)
    const watcher = createUpdateWatcher(workers)
    const listener = vi.fn()
    watcher.subscribe(listener)
    expect(watcher.getSnapshot()).toBe(false)

    workers.dispatchEvent(new Event('controllerchange'))

    expect(watcher.getSnapshot()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('처음 연 화면(다루는 워커 없음)에 워커가 처음 붙는 것은 새 버전이 아니다', () => {
    const workers = fakeWorkers(false)
    const watcher = createUpdateWatcher(workers)

    workers.dispatchEvent(new Event('controllerchange'))

    expect(watcher.getSnapshot()).toBe(false)
  })

  it('서비스 워커가 없는 브라우저에서는 늘 받지 않은 상태다', () => {
    expect(createUpdateWatcher(undefined).getSnapshot()).toBe(false)
  })
})
