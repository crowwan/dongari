import { describe, expect, it } from 'vitest'
import { annotations, formatKst, judgeReport, NO_SIGNAL, renderSummary, SERVER_DOWN, TOKEN_REJECTED } from './keepWatch.ts'
import type { DeviceReport, ReportResponse } from './keepWatch.ts'

const NOW = '2026-10-15T00:00:00.000Z'

// 문제 없는 기기 하나 (어제 앱을 열었고 다 보관됨)
function device(overrides: Partial<DeviceReport> = {}): DeviceReport {
  return {
    id: 'ab12cd34',
    seenAt: '2026-10-14T00:00:00.000Z',
    enabled: true,
    lastKeptAt: '2026-10-14T00:00:00.000Z',
    tooLarge: false,
    appVersion: '2.6.0',
    ...overrides,
  }
}

function ok(devices: unknown[], now: string = NOW): ReportResponse {
  return { kind: 'http', status: 200, body: { now, devices } }
}

describe('SPEC-007 AC-6 보관 지켜보기 판정', () => {
  describe('실패', () => {
    it('서버에 연결하지 못하면 "보관 서버가 응답하지 않아요" 로 실패한다', () => {
      const verdict = judgeReport({ kind: 'unreachable' })
      expect(verdict.failures).toEqual([`${SERVER_DOWN} (연결 실패)`])
      expect(verdict.report).toBeUndefined()
    })

    it('5xx 면 "보관 서버가 응답하지 않아요" 로 실패한다', () => {
      expect(judgeReport({ kind: 'http', status: 503, body: undefined }).failures).toEqual([`${SERVER_DOWN} (HTTP 503)`])
    })

    it('요약 경로가 없는 등(404) 200 이 아니면 같은 문구로 실패한다', () => {
      expect(judgeReport({ kind: 'http', status: 404, body: undefined }).failures).toEqual([`${SERVER_DOWN} (HTTP 404)`])
    })

    it('401 이면 토큰이 맞지 않음을 알 수 있는 문구로 실패한다', () => {
      const verdict = judgeReport({ kind: 'http', status: 401, body: undefined })
      expect(verdict.failures).toEqual([TOKEN_REJECTED])
      expect(TOKEN_REJECTED).toContain('KEEP_REPORT_TOKEN')
    })

    it.each([
      ['JSON 이 아님', undefined],
      ['devices 가 없음', { now: NOW }],
      ['now 가 시각이 아님', { now: 'yesterday', devices: [] }],
      ['기기 칸 타입이 틀림', { now: NOW, devices: [{ ...device(), enabled: 'yes' }] }],
      ['선택 칸이 null', { now: NOW, devices: [{ ...device(), pendingSince: null }] }],
    ])('요약 형식이 틀리면(%s) "보관 서버가 응답하지 않아요" 로 실패한다', (_case, body) => {
      expect(judgeReport({ kind: 'http', status: 200, body }).failures).toEqual([`${SERVER_DOWN} (요약 형식이 틀림)`])
    })

    it('pendingSince 가 신호 받은 때 기준 72시간을 넘으면 밀린 때와 함께 실패한다', () => {
      const late = device({ pendingSince: '2026-10-10T23:59:59.000Z', seenAt: '2026-10-14T00:00:00.000Z' })
      expect(judgeReport(ok([late])).failures).toEqual([
        '기기 `ab12cd34` 가 3일 넘게 보관하지 못했어요 (밀린 때 2026-10-11 08:59 KST)',
      ])
    })

    it('pendingSince 가 정확히 72시간이면 아직 실패가 아니다', () => {
      const edge = device({ pendingSince: '2026-10-11T00:00:00.000Z', seenAt: '2026-10-14T00:00:00.000Z' })
      expect(judgeReport(ok([edge])).failures).toEqual([])
    })

    it('신호 뒤 앱을 안 열어 now 기준으로만 72시간이 지났으면 실패가 아니다 (그 뒤 보관됐는지 알 수 없음)', () => {
      const quiet = device({ pendingSince: '2026-10-11T00:00:00.000Z', seenAt: '2026-10-11T01:00:00.000Z' })
      expect(judgeReport(ok([quiet])).failures).toEqual([])
    })

    it('tooLarge 면 1MB 문구로 실패한다', () => {
      expect(judgeReport(ok([device({ tooLarge: true })])).failures).toEqual([
        '기기 `ab12cd34` 의 기록이 1MB 를 넘어 보관하지 못했어요',
      ])
    })
  })

  describe('경고(성공)', () => {
    it('자동 보관이 꺼진 기기가 있으면 경고만 한다', () => {
      const verdict = judgeReport(ok([device({ enabled: false })]))
      expect(verdict.failures).toEqual([])
      expect(verdict.warnings).toEqual(['기기 `ab12cd34` 가 자동 보관을 껐어요'])
    })

    it('마지막 신호가 30일을 넘으면 경고한다', () => {
      const verdict = judgeReport(ok([device({ seenAt: '2026-09-14T23:59:59.000Z' })]))
      expect(verdict.failures).toEqual([])
      expect(verdict.warnings).toEqual(['기기 `ab12cd34` 가 30일 넘게 앱을 열지 않았어요'])
    })

    it('마지막 신호가 정확히 30일이면 아직 경고가 아니다', () => {
      expect(judgeReport(ok([device({ seenAt: '2026-09-15T00:00:00.000Z' })])).warnings).toEqual([])
    })

    it('신호가 하나도 없으면 "아직 상태 신호가 없어요" 경고', () => {
      const verdict = judgeReport(ok([]))
      expect(verdict.failures).toEqual([])
      expect(verdict.warnings).toEqual([NO_SIGNAL])
      expect(NO_SIGNAL).toBe('아직 상태 신호가 없어요')
    })
  })

  it('문제 없는 기기만 있으면 실패도 경고도 없다', () => {
    const verdict = judgeReport(ok([device(), device({ id: 'ef56ab78' })]))
    expect(verdict).toMatchObject({ failures: [], warnings: [] })
    expect(verdict.report?.devices).toHaveLength(2)
  })

  it('여러 기기의 문제를 기기마다 모두 모은다', () => {
    const verdict = judgeReport(
      ok([device({ tooLarge: true, enabled: false }), device({ id: 'ef56ab78', seenAt: '2026-08-01T00:00:00.000Z' })]),
    )
    expect(verdict.failures).toEqual(['기기 `ab12cd34` 의 기록이 1MB 를 넘어 보관하지 못했어요'])
    expect(verdict.warnings).toEqual([
      '기기 `ab12cd34` 가 자동 보관을 껐어요',
      '기기 `ef56ab78` 가 30일 넘게 앱을 열지 않았어요',
    ])
  })
})

describe('SPEC-007 보관 지켜보기 실행 요약', () => {
  it('시각은 한국 시간으로 보여 준다', () => {
    expect(formatKst('2026-10-14T15:30:00.000Z')).toBe('2026-10-15 00:30')
  })

  it('기기별 표에 기기·마지막 신호·켜짐·밀린 때·마지막 보관·크기·앱 버전을 쓴다', () => {
    const summary = renderSummary(judgeReport(ok([device({ pendingSince: '2026-10-13T00:00:00.000Z' })])))
    expect(summary).toContain('결과: **문제 없음**')
    expect(summary).toContain('| 기기 | 마지막 신호 | 자동 보관 | 밀린 때 | 마지막 보관 | 크기 | 앱 버전 |')
    expect(summary).toContain('| `ab12cd34` | 2026-10-14 09:00 | 켜짐 | 2026-10-13 09:00 | 2026-10-14 09:00 | - | 2.6.0 |')
  })

  it('실패가 있으면 결과 줄과 실패 목록을 쓴다', () => {
    const summary = renderSummary(judgeReport(ok([device({ tooLarge: true })])))
    expect(summary).toContain('결과: **실패**')
    expect(summary).toContain('- 기기 `ab12cd34` 의 기록이 1MB 를 넘어 보관하지 못했어요')
    expect(summary).toContain('| 1MB 넘음 |')
  })

  it('서버가 응답하지 않으면 표 없이 실패만 쓴다', () => {
    const summary = renderSummary(judgeReport({ kind: 'unreachable' }))
    expect(summary).toContain(`- ${SERVER_DOWN} (연결 실패)`)
    expect(summary).not.toContain('| 기기 |')
  })

  it('신호가 없으면 표 대신 안내 문장을 쓴다', () => {
    const summary = renderSummary(judgeReport(ok([])))
    expect(summary).toContain('결과: **경고 있음(성공)**')
    expect(summary).not.toContain('| 기기 |')
  })

  it('실패는 ::error, 경고는 ::warning 작업 명령으로 만든다', () => {
    const verdict = judgeReport(ok([device({ tooLarge: true, enabled: false })]))
    expect(annotations(verdict)).toEqual([
      '::error title=보관 지켜보기::기기 `ab12cd34` 의 기록이 1MB 를 넘어 보관하지 못했어요',
      '::warning title=보관 지켜보기::기기 `ab12cd34` 가 자동 보관을 껐어요',
    ])
  })

  it('작업 명령 메시지의 % 와 줄바꿈은 이스케이프한다', () => {
    expect(annotations({ failures: ['100%\n끝'], warnings: [] })).toEqual(['::error title=보관 지켜보기::100%25%0A끝'])
  })
})
