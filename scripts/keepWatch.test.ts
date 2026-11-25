import { describe, expect, it } from 'vitest'
import {
  annotations,
  formatKst,
  judgeReport,
  NAMES_BROKEN,
  NO_EXPORT,
  NO_SIGNAL,
  parseDeviceNames,
  parseReport,
  renderSummary,
  SERVER_DOWN,
  TOKEN_REJECTED,
} from '../ops/keep-backup/scripts/keepWatch.ts'
import type { DeviceReport, ExportReport, ReportResponse } from '../ops/keep-backup/scripts/keepWatch.ts'

// 보관 지켜보기는 비공개 백업 레포(crowwan/dongari-keep-backup)에서 돈다 (SPEC-012).
// 파일 원본은 이 레포 ops/keep-backup/ 에 있고, 리뷰·테스트는 여기서 한다

const NOW = '2026-10-15T00:00:00.000Z'
// 어제 아침(월요일 08:00 KST 무렵) 서버 밖 사본을 내보냄 — 문제 없는 상태
const RECENT_EXPORT: ExportReport = { lastAt: '2026-10-14T23:00:00.000Z', count: 2 }

// 기기 이름표 (devices.json, SPEC-012). SPEC-007·011 판정 시험은 요약의 기기에 모두 이름을 붙인 상태로 본다 — 이름 경고가 섞이지 않게
const MOM = parseDeviceNames('{ "ab12cd34": "엄마 폰" }')
const MOM_AND_AUNT = parseDeviceNames('{ "ab12cd34": "엄마 폰", "ef56ab78": "이모" }')
const NO_NAMES = parseDeviceNames('{}')

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

function ok(devices: unknown[], now: string = NOW, lastExport: ExportReport | null = RECENT_EXPORT): ReportResponse {
  return { kind: 'http', status: 200, body: { now, devices, export: lastExport } }
}

describe('SPEC-007 AC-6 보관 지켜보기 판정', () => {
  describe('실패', () => {
    it('서버에 연결하지 못하면 "보관 서버가 응답하지 않아요" 로 실패한다', () => {
      const verdict = judgeReport({ kind: 'unreachable' }, MOM)
      expect(verdict.failures).toEqual([`${SERVER_DOWN} (연결 실패)`])
      expect(verdict.report).toBeUndefined()
    })

    it('5xx 면 "보관 서버가 응답하지 않아요" 로 실패한다', () => {
      expect(judgeReport({ kind: 'http', status: 503, body: undefined }, MOM).failures).toEqual([`${SERVER_DOWN} (HTTP 503)`])
    })

    it('요약 경로가 없는 등(404) 200 이 아니면 같은 문구로 실패한다', () => {
      expect(judgeReport({ kind: 'http', status: 404, body: undefined }, MOM).failures).toEqual([`${SERVER_DOWN} (HTTP 404)`])
    })

    it('401 이면 토큰이 맞지 않음을 알 수 있는 문구로 실패한다', () => {
      const verdict = judgeReport({ kind: 'http', status: 401, body: undefined }, MOM)
      expect(verdict.failures).toEqual([TOKEN_REJECTED])
      expect(TOKEN_REJECTED).toContain('요약 토큰을 받지 않아요 (401)')
    })

    it.each([
      ['JSON 이 아님', undefined],
      ['devices 가 없음', { now: NOW }],
      ['now 가 시각이 아님', { now: 'yesterday', devices: [] }],
      ['기기 칸 타입이 틀림', { now: NOW, devices: [{ ...device(), enabled: 'yes' }] }],
      ['선택 칸이 null', { now: NOW, devices: [{ ...device(), pendingSince: null }] }],
    ])('요약 형식이 틀리면(%s) "보관 서버가 응답하지 않아요" 로 실패한다', (_case, body) => {
      expect(judgeReport({ kind: 'http', status: 200, body }, MOM).failures).toEqual([`${SERVER_DOWN} (요약 형식이 틀림)`])
    })

    it('pendingSince 가 신호 받은 때 기준 72시간을 넘으면 밀린 때와 함께 실패한다', () => {
      const late = device({ pendingSince: '2026-10-10T23:59:59.000Z', seenAt: '2026-10-14T00:00:00.000Z' })
      expect(judgeReport(ok([late]), MOM).failures).toEqual([
        '`엄마 폰 (ab12cd34)` 이 3일 넘게 보관하지 못했어요 (밀린 때 2026-10-11 08:59 KST)',
      ])
    })

    it('pendingSince 가 정확히 72시간이면 아직 실패가 아니다', () => {
      const edge = device({ pendingSince: '2026-10-11T00:00:00.000Z', seenAt: '2026-10-14T00:00:00.000Z' })
      expect(judgeReport(ok([edge]), MOM).failures).toEqual([])
    })

    it('신호 뒤 앱을 안 열어 now 기준으로만 72시간이 지났으면 실패가 아니다 (그 뒤 보관됐는지 알 수 없음)', () => {
      const quiet = device({ pendingSince: '2026-10-11T00:00:00.000Z', seenAt: '2026-10-11T01:00:00.000Z' })
      expect(judgeReport(ok([quiet]), MOM).failures).toEqual([])
    })

    it('tooLarge 면 1MB 문구로 실패한다', () => {
      expect(judgeReport(ok([device({ tooLarge: true })]), MOM).failures).toEqual([
        '`엄마 폰 (ab12cd34)` 의 기록이 1MB 를 넘어 보관하지 못했어요',
      ])
    })
  })

  describe('경고(성공)', () => {
    it('자동 보관이 꺼진 기기가 있으면 경고만 한다', () => {
      const verdict = judgeReport(ok([device({ enabled: false })]), MOM)
      expect(verdict.failures).toEqual([])
      expect(verdict.warnings).toEqual(['`엄마 폰 (ab12cd34)` 이 자동 보관을 껐어요'])
    })

    it('마지막 신호가 30일을 넘으면 경고한다', () => {
      const verdict = judgeReport(ok([device({ seenAt: '2026-09-14T23:59:59.000Z' })]), MOM)
      expect(verdict.failures).toEqual([])
      expect(verdict.warnings).toEqual(['`엄마 폰 (ab12cd34)` 이 30일 넘게 앱을 열지 않았어요'])
    })

    it('마지막 신호가 정확히 30일이면 아직 경고가 아니다', () => {
      expect(judgeReport(ok([device({ seenAt: '2026-09-15T00:00:00.000Z' })]), MOM).warnings).toEqual([])
    })

    it('신호가 하나도 없으면 "아직 상태 신호가 없어요" 경고', () => {
      const verdict = judgeReport(ok([]), NO_NAMES)
      expect(verdict.failures).toEqual([])
      expect(verdict.warnings).toEqual([NO_SIGNAL])
      expect(NO_SIGNAL).toBe('아직 상태 신호가 없어요')
    })
  })

  it('문제 없는 기기만 있으면 실패도 경고도 없다', () => {
    const verdict = judgeReport(ok([device(), device({ id: 'ef56ab78' })]), MOM_AND_AUNT)
    expect(verdict).toMatchObject({ failures: [], warnings: [] })
    expect(verdict.report?.devices).toHaveLength(2)
  })

  it('여러 기기의 문제를 기기마다 모두 모은다', () => {
    const verdict = judgeReport(
      ok([device({ tooLarge: true, enabled: false }), device({ id: 'ef56ab78', seenAt: '2026-08-01T00:00:00.000Z' })]),
      MOM_AND_AUNT,
    )
    expect(verdict.failures).toEqual(['`엄마 폰 (ab12cd34)` 의 기록이 1MB 를 넘어 보관하지 못했어요'])
    expect(verdict.warnings).toEqual([
      '`엄마 폰 (ab12cd34)` 이 자동 보관을 껐어요',
      '`이모 (ef56ab78)` 가 30일 넘게 앱을 열지 않았어요',
    ])
  })
})

describe('SPEC-011 AC-6 보관 지켜보기 서버 밖 사본 판정', () => {
  it('마지막 내보내기가 8일 넘었으면 "서버 밖 사본이 N일째 없어요" 로 마지막 때와 함께 실패한다', () => {
    const stale = { lastAt: '2026-10-06T23:59:59.000Z', count: 2 }
    const verdict = judgeReport(ok([device()], NOW, stale), MOM)
    expect(verdict.failures).toEqual(['서버 밖 사본이 8일째 없어요 (마지막 내보내기 2026-10-07 08:59 KST)'])
    expect(verdict.warnings).toEqual([])
  })

  it('마지막 내보내기가 정확히 8일이면 아직 실패가 아니다', () => {
    const edge = { lastAt: '2026-10-07T00:00:00.000Z', count: 2 }
    expect(judgeReport(ok([device()], NOW, edge), MOM)).toMatchObject({ failures: [], warnings: [] })
  })

  it('한 번도 내보내지 않았으면(export 가 null) "아직 서버 밖 사본이 없어요" 경고만 한다', () => {
    const verdict = judgeReport(ok([device()], NOW, null), MOM)
    expect(verdict.failures).toEqual([])
    expect(verdict.warnings).toEqual([NO_EXPORT])
    expect(NO_EXPORT).toBe('아직 서버 밖 사본이 없어요')
  })

  it('export 칸이 없는 예전 서버 답도 받아 내보낸 적 없음으로 보고 경고한다', () => {
    const verdict = judgeReport({ kind: 'http', status: 200, body: { now: NOW, devices: [device()] } }, MOM)
    expect(verdict.report?.export).toBeNull()
    expect(verdict.failures).toEqual([])
    expect(verdict.warnings).toEqual([NO_EXPORT])
  })

  it('상태 신호가 하나도 없어도 서버 밖 사본은 따로 판정한다', () => {
    const stale = { lastAt: '2026-10-01T00:00:00.000Z', count: 0 }
    expect(judgeReport(ok([], NOW, stale), NO_NAMES)).toMatchObject({
      failures: ['서버 밖 사본이 14일째 없어요 (마지막 내보내기 2026-10-01 09:00 KST)'],
      warnings: [NO_SIGNAL],
    })
    expect(judgeReport(ok([], NOW, null), NO_NAMES).warnings).toEqual([NO_SIGNAL, NO_EXPORT])
  })

  it.each([
    ['lastAt 이 시각이 아님', { lastAt: '지난주', count: 1 }],
    ['count 가 없음', { lastAt: NOW }],
    ['count 가 음수', { lastAt: NOW, count: -1 }],
    ['count 가 정수가 아님', { lastAt: NOW, count: 1.5 }],
    ['객체가 아님', '2026-10-14'],
  ])('export 칸 모양이 틀리면(%s) 요약 형식이 틀림으로 실패한다', (_case, lastExport) => {
    const body = { now: NOW, devices: [], export: lastExport }
    expect(parseReport(body)).toBeNull()
    expect(judgeReport({ kind: 'http', status: 200, body }, NO_NAMES).failures).toEqual([`${SERVER_DOWN} (요약 형식이 틀림)`])
  })

  it('실행 요약에 마지막 내보내기 때(KST)와 보관본 개수를 쓴다', () => {
    expect(renderSummary(judgeReport(ok([device()]), MOM))).toContain('마지막 내보내기: 2026-10-15 08:00 KST · 보관본 2개')
    expect(renderSummary(judgeReport(ok([device()], NOW, null), MOM))).toContain(`마지막 내보내기: ${NO_EXPORT}`)
  })
})

describe('SPEC-007 보관 지켜보기 실행 요약', () => {
  it('시각은 한국 시간으로 보여 준다', () => {
    expect(formatKst('2026-10-14T15:30:00.000Z')).toBe('2026-10-15 00:30')
  })

  it('기기별 표에 기기·마지막 신호·켜짐·밀린 때·마지막 보관·크기·앱 버전을 쓴다', () => {
    const summary = renderSummary(judgeReport(ok([device({ pendingSince: '2026-10-13T00:00:00.000Z' })]), MOM))
    expect(summary).toContain('결과: **문제 없음**')
    expect(summary).toContain('| 기기 | 마지막 신호 | 자동 보관 | 밀린 때 | 마지막 보관 | 크기 | 앱 버전 |')
    expect(summary).toContain('| `엄마 폰 (ab12cd34)` | 2026-10-14 09:00 | 켜짐 | 2026-10-13 09:00 | 2026-10-14 09:00 | - | 2.6.0 |')
  })

  it('실패가 있으면 결과 줄과 실패 목록을 쓴다', () => {
    const summary = renderSummary(judgeReport(ok([device({ tooLarge: true })]), MOM))
    expect(summary).toContain('결과: **실패**')
    expect(summary).toContain('- `엄마 폰 (ab12cd34)` 의 기록이 1MB 를 넘어 보관하지 못했어요')
    expect(summary).toContain('| 1MB 넘음 |')
  })

  it('서버가 응답하지 않으면 표 없이 실패만 쓴다', () => {
    const summary = renderSummary(judgeReport({ kind: 'unreachable' }, MOM))
    expect(summary).toContain(`- ${SERVER_DOWN} (연결 실패)`)
    expect(summary).not.toContain('| 기기 |')
  })

  it('신호가 없으면 표 대신 안내 문장을 쓴다', () => {
    const summary = renderSummary(judgeReport(ok([]), NO_NAMES))
    expect(summary).toContain('결과: **경고 있음(성공)**')
    expect(summary).not.toContain('| 기기 |')
  })

  it('실패는 ::error, 경고는 ::warning 작업 명령으로 만든다', () => {
    const verdict = judgeReport(ok([device({ tooLarge: true, enabled: false })]), MOM)
    expect(annotations(verdict)).toEqual([
      '::error title=보관 지켜보기::`엄마 폰 (ab12cd34)` 의 기록이 1MB 를 넘어 보관하지 못했어요',
      '::warning title=보관 지켜보기::`엄마 폰 (ab12cd34)` 이 자동 보관을 껐어요',
    ])
  })

  it('작업 명령 메시지의 % 와 줄바꿈은 이스케이프한다', () => {
    expect(annotations({ failures: ['100%\n끝'], warnings: [] })).toEqual(['::error title=보관 지켜보기::100%25%0A끝'])
  })
})

describe('SPEC-012 지켜보기를 비공개 레포로', () => {
  describe('AC-1 이름표에 이름이 있는 기기', () => {
    it('실패 문구에 `이름 (앞 8자)` 로 보인다', () => {
      const late = device({ pendingSince: '2026-10-10T00:00:00.000Z', tooLarge: true })
      expect(judgeReport(ok([late]), MOM).failures).toEqual([
        '`엄마 폰 (ab12cd34)` 이 3일 넘게 보관하지 못했어요 (밀린 때 2026-10-10 09:00 KST)',
        '`엄마 폰 (ab12cd34)` 의 기록이 1MB 를 넘어 보관하지 못했어요',
      ])
    })

    it('경고 문구에도 `이름 (앞 8자)` 로 보이고, 조사(이/가)는 이름 끝 글자의 받침을 따른다', () => {
      const verdict = judgeReport(
        ok([device({ enabled: false }), device({ id: 'ef56ab78', enabled: false, seenAt: '2026-08-01T00:00:00.000Z' })]),
        MOM_AND_AUNT,
      )
      expect(verdict.warnings).toEqual([
        '`엄마 폰 (ab12cd34)` 이 자동 보관을 껐어요',
        '`이모 (ef56ab78)` 가 자동 보관을 껐어요',
        '`이모 (ef56ab78)` 가 30일 넘게 앱을 열지 않았어요',
      ])
    })

    it('기기별 표의 기기 칸에 `이름 (앞 8자)` 를 쓴다', () => {
      const summary = renderSummary(judgeReport(ok([device(), device({ id: 'ef56ab78' })]), MOM_AND_AUNT))
      expect(summary).toContain('| `엄마 폰 (ab12cd34)` | 2026-10-14 09:00 |')
      expect(summary).toContain('| `이모 (ef56ab78)` | 2026-10-14 09:00 |')
    })

    it('이름이 없는 기기는 문구와 표에 예전처럼 기기 `앞 8자` 로 보인다', () => {
      const verdict = judgeReport(ok([device({ tooLarge: true, enabled: false })]), NO_NAMES)
      expect(verdict.failures).toEqual(['기기 `ab12cd34` 의 기록이 1MB 를 넘어 보관하지 못했어요'])
      expect(verdict.warnings).toContain('기기 `ab12cd34` 가 자동 보관을 껐어요')
      expect(renderSummary(verdict)).toContain('| `ab12cd34` | 2026-10-14 09:00 |')
    })

    it('이름표는 앞 8자 → 이름이고, 이름 앞뒤 빈칸은 지운다', () => {
      expect(parseDeviceNames('{ "ab12cd34": " 엄마 폰 ", "ef56ab78": "이모" }')).toEqual({
        ok: true,
        names: new Map([
          ['ab12cd34', '엄마 폰'],
          ['ef56ab78', '이모'],
        ]),
      })
    })
  })

  describe('AC-2 이름표 경고와 실패', () => {
    it('요약에 있는 기기가 이름표에 없으면 "이름 없는 기기" 경고(성공)다', () => {
      const verdict = judgeReport(ok([device(), device({ id: 'ef56ab78' })]), MOM)
      expect(verdict.failures).toEqual([])
      expect(verdict.warnings).toEqual(['이름 없는 기기 `ef56ab78` 가 있어요. `devices.json` 에 이름을 붙여 주세요'])
    })

    it('이름표에 있는 기기가 요약에 없으면 경고(성공)다', () => {
      const verdict = judgeReport(ok([device({ id: 'ef56ab78' })]), MOM_AND_AUNT)
      expect(verdict.failures).toEqual([])
      expect(verdict.warnings).toEqual(['이름표의 `엄마 폰 (ab12cd34)` 이 요약에 없어요 (보관을 지웠거나 복구 코드가 바뀜)'])
    })

    it('신호가 하나도 없으면 이름표의 기기마다 요약에 없다고 경고한다', () => {
      expect(judgeReport(ok([]), MOM_AND_AUNT).warnings).toEqual([
        NO_SIGNAL,
        '이름표의 `엄마 폰 (ab12cd34)` 이 요약에 없어요 (보관을 지웠거나 복구 코드가 바뀜)',
        '이름표의 `이모 (ef56ab78)` 가 요약에 없어요 (보관을 지웠거나 복구 코드가 바뀜)',
      ])
    })

    it('devices.json 이 없으면 모든 기기가 "이름 없는 기기" 경고이고 실패가 아니다', () => {
      const missing = parseDeviceNames(undefined)
      const verdict = judgeReport(ok([device(), device({ id: 'ef56ab78' })]), missing)
      expect(verdict.failures).toEqual([])
      expect(verdict.warnings).toEqual([
        '이름 없는 기기 `ab12cd34` 가 있어요. `devices.json` 에 이름을 붙여 주세요',
        '이름 없는 기기 `ef56ab78` 가 있어요. `devices.json` 에 이름을 붙여 주세요',
      ])
    })

    it.each([
      ['JSON 이 아님', '{ ab12cd34: 엄마 폰 }'],
      ['빈 파일', ''],
      ['객체가 아님(배열)', '["ab12cd34"]'],
      ['객체가 아님(null)', 'null'],
      ['값이 문자열이 아님', '{ "ab12cd34": 1 }'],
      ['값이 빈 글자', '{ "ab12cd34": "  " }'],
      ['키가 8자가 아님', '{ "ab12cd3": "엄마 폰" }'],
      ['키가 64자 전체', `{ "${'a'.repeat(64)}": "엄마 폰" }`],
      ['키가 16진수가 아님', '{ "ab12cdzz": "엄마 폰" }'],
      ['키가 대문자 (--which 는 소문자로 찍는다)', '{ "AB12CD34": "엄마 폰" }'],
    ])('devices.json 모양이 틀리면(%s) "기기 이름 파일 모양이 틀려요" 로 실패한다', (_case, text) => {
      const broken = parseDeviceNames(text)
      expect(broken.ok).toBe(false)
      const verdict = judgeReport(ok([device()]), broken)
      expect(verdict.failures).toEqual([NAMES_BROKEN])
      expect(NAMES_BROKEN).toContain('기기 이름 파일(`devices.json`) 모양이 틀려요')
    })

    it('이름 파일 모양이 틀려도 서버 판정과 표는 그대로 하고, 이름 경고 없이 기기는 앞 8자로 보인다', () => {
      const verdict = judgeReport(ok([device({ tooLarge: true })]), parseDeviceNames('[]'))
      expect(verdict.failures).toEqual(['기기 `ab12cd34` 의 기록이 1MB 를 넘어 보관하지 못했어요', NAMES_BROKEN])
      expect(verdict.warnings).toEqual([])
      expect(renderSummary(verdict)).toContain('| `ab12cd34` |')
    })

    it('서버에 닿지 못해도 이름 파일 모양이 틀렸으면 함께 실패로 알리고, 이름 경고는 하지 않는다', () => {
      expect(judgeReport({ kind: 'unreachable' }, parseDeviceNames('[]')).failures).toEqual([
        `${SERVER_DOWN} (연결 실패)`,
        NAMES_BROKEN,
      ])
      expect(judgeReport({ kind: 'unreachable' }, MOM).warnings).toEqual([])
    })

    it('이름표 경고도 ::warning 작업 명령으로 만든다', () => {
      expect(annotations(judgeReport(ok([device()]), NO_NAMES))).toEqual([
        '::warning title=보관 지켜보기::이름 없는 기기 `ab12cd34` 가 있어요. `devices.json` 에 이름을 붙여 주세요',
      ])
    })
  })

  it('401 문구는 비공개 레포 Secrets REPORT_TOKEN 과 dongari KEEP_REPORT_TOKEN 을 맞추고 "보관 서버" 를 다시 돌리라고 안내한다', () => {
    expect(TOKEN_REJECTED).toContain('이 레포 Secrets `REPORT_TOKEN`')
    expect(TOKEN_REJECTED).toContain('dongari 레포 Secrets `KEEP_REPORT_TOKEN`')
    expect(TOKEN_REJECTED).toContain('"보관 서버"')
  })
})
