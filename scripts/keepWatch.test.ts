import { describe, expect, it } from 'vitest'
import {
  annotations,
  formatKst,
  judgeReport,
  NAMES_BROKEN,
  NO_APP_ERRORS,
  NO_EXPORT,
  NO_SIGNAL,
  parseDeviceNames,
  parseReport,
  readDeviceNames,
  renderSummary,
  SERVER_DOWN,
  TOKEN_REJECTED,
} from '../ops/keep-backup/scripts/keepWatch.ts'
import type { AppErrorReport, DeviceReport, ExportReport, ReportResponse } from '../ops/keep-backup/scripts/keepWatch.ts'
import type { Screen } from '../src/features/useScreenHistory'

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
    errors: [],
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
      ['이름에 줄바꿈', '{ "ab12cd34": "엄마\\n폰" }'],
      ['이름에 탭', '{ "ab12cd34": "엄마\\t폰" }'],
      ['이름에 | (표가 깨짐)', '{ "ab12cd34": "엄마 | 폰" }'],
      ['이름에 백틱', '{ "ab12cd34": "엄마 `폰`" }'],
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

  describe('이름표 읽기 (#207 리뷰)', () => {
    it('파일 앞에 UTF-8 BOM 이 붙어 있어도 읽는다', () => {
      expect(parseDeviceNames('\uFEFF{ "ab12cd34": "엄마 폰" }')).toEqual({ ok: true, names: new Map([['ab12cd34', '엄마 폰']]) })
    })

    it('BOM 은 맨 앞 하나만 지운다 (가운데 BOM 은 JSON 이 아니라 모양이 틀림)', () => {
      expect(parseDeviceNames('{ \uFEFF"ab12cd34": "엄마 폰" }').ok).toBe(false)
    })

    it('파일이 폴더이거나 읽을 수 없으면 모양이 틀림으로 보고, 서버 판정과 표는 그대로 남긴다', () => {
      const unreadable = readDeviceNames(() => {
        throw new Error('EISDIR: illegal operation on a directory, read')
      })
      expect(unreadable).toEqual({ ok: false })

      const verdict = judgeReport(ok([device({ tooLarge: true })]), unreadable)
      expect(verdict.failures).toEqual(['기기 `ab12cd34` 의 기록이 1MB 를 넘어 보관하지 못했어요', NAMES_BROKEN])
      expect(renderSummary(verdict)).toContain('| `ab12cd34` |')
    })

    it('파일이 없으면(undefined) 빈 이름표, 있으면 그 글자를 읽는다', () => {
      expect(readDeviceNames(() => undefined)).toEqual({ ok: true, names: new Map() })
      expect(readDeviceNames(() => '{ "ab12cd34": "엄마 폰" }')).toEqual(MOM)
    })

    it('모양 틀림 문구는 이름에 넣지 못하는 글자를 알려 준다', () => {
      expect(NAMES_BROKEN).toContain('줄바꿈')
      expect(NAMES_BROKEN).toContain('`|`')
      expect(NAMES_BROKEN).toContain('백틱')
    })
  })

  it('401 문구는 비공개 레포 Secrets REPORT_TOKEN 과 dongari KEEP_REPORT_TOKEN 을 맞추고 "보관 서버" 를 다시 돌리라고 안내한다', () => {
    expect(TOKEN_REJECTED).toContain('이 레포 Secrets `REPORT_TOKEN`')
    expect(TOKEN_REJECTED).toContain('dongari 레포 Secrets `KEEP_REPORT_TOKEN`')
    expect(TOKEN_REJECTED).toContain('"보관 서버"')
  })
})

// 앱 오류 한 줄 (SPEC-012 2절). 마지막 때는 NOW(2026-10-15 09:00 KST) 의 19시간 앞 — 36시간 안
function appError(overrides: Partial<AppErrorReport> = {}): AppErrorReport {
  return {
    kind: 'render',
    name: 'TypeError',
    message: "Cannot read properties of undefined (reading '…')",
    screen: 'dues',
    where: 'index-abc123.js:1:23456',
    count: 3,
    firstAt: '2026-10-14T05:00:00.000Z',
    lastAt: '2026-10-14T05:02:00.000Z',
    ...overrides,
  }
}

// NOW 에서 36시간 앞
const APP_ERROR_EDGE = '2026-10-13T12:00:00.000Z'

// 앱 화면 이름(src/features/useScreenHistory.ts 의 Screen)과 판정이 보이는 사람 말.
// 앱에 화면이 늘면 여기서 타입 오류가 나서 판정(keepWatch.ts)의 화면 표도 같이 고치게 한다
const APP_SCREENS = {
  ledger: '장부',
  settings: '설정',
  'month-summary': '월 정리',
  'year-summary': '올해 결산',
  'add-entry': '내역 적기',
  'edit-entry': '내역 고치기',
  'new-book': '새 장부 만들기',
  'keep-restore': '복구 코드로 불러오기',
  dues: '회비 표',
  'excel-import': '엑셀 불러오기',
} satisfies Record<Screen['name'], string>

describe('SPEC-012 AC-10 앱 오류 판정', () => {
  describe('36시간 안 오류는 실패', () => {
    it('스펙 예시 모양 문구로 실패한다: 기기·화면·종류·이름 "글"·횟수·마지막 때(KST)', () => {
      const verdict = judgeReport(ok([device({ errors: [appError()] })]), MOM)
      expect(verdict.failures).toEqual([
        "`엄마 폰 (ab12cd34)` 에서 앱 오류가 났어요: 회비 표(`dues`) · render · TypeError \"Cannot read properties of undefined (reading '…')\" · 3번 · 마지막 2026-10-14 14:02 KST",
      ])
      expect(verdict.warnings).toEqual([])
    })

    it('이름표에 없는 기기는 기기 `앞 8자` 로 보인다', () => {
      expect(judgeReport(ok([device({ errors: [appError()] })]), NO_NAMES).failures).toEqual([
        "기기 `ab12cd34` 에서 앱 오류가 났어요: 회비 표(`dues`) · render · TypeError \"Cannot read properties of undefined (reading '…')\" · 3번 · 마지막 2026-10-14 14:02 KST",
      ])
    })

    it('36시간에서 1초 모자라면 실패다', () => {
      const verdict = judgeReport(ok([device({ errors: [appError({ lastAt: '2026-10-13T12:00:01.000Z' })] })]), MOM)
      expect(verdict.failures).toHaveLength(1)
    })

    it('마지막 때가 요약 now 보다 뒤여도(폰 시계가 앞섬) 36시간 안으로 보고 실패한다', () => {
      const verdict = judgeReport(ok([device({ errors: [appError({ lastAt: '2026-10-15T03:00:00.000Z' })] })]), MOM)
      expect(verdict.failures).toEqual([expect.stringContaining('마지막 2026-10-15 12:00 KST')])
    })

    it('오류 줄마다, 기기마다 실패를 모으고 기기의 다른 실패와 함께 둔다', () => {
      const verdict = judgeReport(
        ok([
          device({ tooLarge: true, errors: [appError(), appError({ kind: 'save', name: 'QuotaExceededError', message: '', screen: 'ledger', count: 1 })] }),
          device({ id: 'ef56ab78', errors: [appError({ kind: 'rejection', name: 'Error', message: 'Load failed', screen: 'excel-import' })] }),
        ]),
        MOM_AND_AUNT,
      )
      expect(verdict.failures).toEqual([
        '`엄마 폰 (ab12cd34)` 의 기록이 1MB 를 넘어 보관하지 못했어요',
        expect.stringContaining('`엄마 폰 (ab12cd34)` 에서 앱 오류가 났어요: 회비 표(`dues`) · render ·'),
        '`엄마 폰 (ab12cd34)` 에서 앱 오류가 났어요: 장부(`ledger`) · save · QuotaExceededError · 1번 · 마지막 2026-10-14 14:02 KST',
        '`이모 (ef56ab78)` 에서 앱 오류가 났어요: 엑셀 불러오기(`excel-import`) · rejection · Error "Load failed" · 3번 · 마지막 2026-10-14 14:02 KST',
      ])
    })

    it('글이 빈 오류는 이름만 쓴다', () => {
      const verdict = judgeReport(ok([device({ errors: [appError({ message: '' })] })]), MOM)
      expect(verdict.failures).toEqual([expect.stringContaining('· render · TypeError · 3번 ·')])
    })

    it('모르는 화면 이름은 사람 말 없이 그대로 쓴다 (앱이 모르면 unknown)', () => {
      const verdict = judgeReport(ok([device({ errors: [appError({ screen: 'unknown' })] })]), MOM)
      expect(verdict.failures).toEqual([expect.stringContaining('앱 오류가 났어요: `unknown` · render ·')])
    })

    it.each(Object.entries(APP_SCREENS))('앱 화면 %s 는 "%s" 로 보인다', (screen, label) => {
      const verdict = judgeReport(ok([device({ errors: [appError({ screen })] })]), MOM)
      expect(verdict.failures).toEqual([expect.stringContaining(`앱 오류가 났어요: ${label}(\`${screen}\`) · render ·`)])
    })

    it('앱 오류 실패도 ::error 작업 명령으로 만든다', () => {
      expect(annotations(judgeReport(ok([device({ errors: [appError()] })]), MOM))).toEqual([
        expect.stringMatching(/^::error title=보관 지켜보기::`엄마 폰 \(ab12cd34\)` 에서 앱 오류가 났어요: /),
      ])
    })
  })

  describe('36시간이 지난 오류는 표에만', () => {
    it('정확히 36시간이면 실패도 경고도 아니다', () => {
      const verdict = judgeReport(ok([device({ errors: [appError({ lastAt: APP_ERROR_EDGE })] })]), MOM)
      expect(verdict).toMatchObject({ failures: [], warnings: [] })
      expect(renderSummary(verdict)).toContain('결과: **문제 없음**')
    })

    it('그보다 오래된 오류는 실패도 경고도 아니고 실행 요약 "앱 오류" 표에만 남는다', () => {
      const old = appError({ firstAt: '2026-10-08T00:00:00.000Z', lastAt: '2026-10-10T00:00:00.000Z' })
      const verdict = judgeReport(ok([device({ errors: [old] })]), MOM)
      expect(verdict).toMatchObject({ failures: [], warnings: [] })
      expect(renderSummary(verdict)).toContain(
        "| `엄마 폰 (ab12cd34)` | 회비 표(`dues`) | render | TypeError | Cannot read properties of undefined (reading '…') | 3 | 2026-10-08 09:00 | 2026-10-10 09:00 |",
      )
    })
  })

  describe('실행 요약 "앱 오류" 표', () => {
    it('칸은 기기·화면·종류·이름·글·횟수·처음·마지막(KST)이고, 36시간 안 오류도 표에 있다', () => {
      const summary = renderSummary(
        judgeReport(
          ok([
            device({ errors: [appError(), appError({ kind: 'save', name: 'QuotaExceededError', message: '', screen: 'unknown', count: 1 })] }),
            device({ id: 'ef56ab78' }),
          ]),
          MOM_AND_AUNT,
        ),
      )
      expect(summary).toContain('### 앱 오류 (폰 시각, KST)')
      expect(summary).toContain('| 기기 | 화면 | 종류 | 이름 | 글 | 횟수 | 처음 | 마지막 |\n|---|---|---|---|---|---|---|---|')
      expect(summary).toContain(
        "| `엄마 폰 (ab12cd34)` | 회비 표(`dues`) | render | TypeError | Cannot read properties of undefined (reading '…') | 3 | 2026-10-14 14:00 | 2026-10-14 14:02 |",
      )
      expect(summary).toContain('| `엄마 폰 (ab12cd34)` | `unknown` | save | QuotaExceededError | - | 1 | 2026-10-14 14:00 | 2026-10-14 14:02 |')
      expect(summary).not.toContain('| `이모 (ef56ab78)` | `')
    })

    it('기기별 상태 표 뒤, 서버 밖 사본 앞에 둔다', () => {
      const summary = renderSummary(judgeReport(ok([device({ errors: [appError()] })]), MOM))
      const devices = summary.indexOf('### 기기별 상태')
      const errors = summary.indexOf('### 앱 오류')
      const offsite = summary.indexOf('### 서버 밖 사본')
      expect(devices).toBeGreaterThanOrEqual(0)
      expect(errors).toBeGreaterThan(devices)
      expect(offsite).toBeGreaterThan(errors)
    })

    it('오류가 하나도 없으면 표 대신 "앱 오류가 없어요" 를 쓴다', () => {
      const summary = renderSummary(judgeReport(ok([device()]), MOM))
      expect(summary).toContain(`### 앱 오류 (폰 시각, KST)\n\n${NO_APP_ERRORS}\n`)
      expect(NO_APP_ERRORS).toBe('앱 오류가 없어요')
      expect(summary).not.toContain('| 기기 | 화면 |')
    })

    it('서버에 닿지 못하면 앱 오류 표도 쓰지 않는다', () => {
      expect(renderSummary(judgeReport({ kind: 'unreachable' }, MOM))).not.toContain('### 앱 오류')
    })
  })

  describe('글 다듬기 (마크다운이 깨지지 않게)', () => {
    const messy = appError({
      name: 'Type|Error',
      message: 'a || b `x`\n## 제목\r\n\tend',
      screen: 'du`es|',
    })

    it("표의 칸 수가 그대로이고 한 줄이다 (| 는 ¦, 백틱은 ', 줄바꿈·제어 문자는 빈칸)", () => {
      const summary = renderSummary(judgeReport(ok([device({ errors: [messy] })]), MOM))
      const row = summary.split('\n').find((line) => line.startsWith("| `엄마 폰 (ab12cd34)` | `du'"))
      expect(row).toBe("| `엄마 폰 (ab12cd34)` | `du'es¦` | render | Type¦Error | a ¦¦ b 'x' ## 제목 end | 3 | 2026-10-14 14:00 | 2026-10-14 14:02 |")
    })

    it('실패 문구도 한 줄이고 백틱은 기기·화면 표시만 감싼다', () => {
      const [failure] = judgeReport(ok([device({ errors: [messy] })]), MOM).failures
      expect(failure).toBe(
        "`엄마 폰 (ab12cd34)` 에서 앱 오류가 났어요: `du'es¦` · render · Type¦Error \"a ¦¦ b 'x' ## 제목 end\" · 3번 · 마지막 2026-10-14 14:02 KST",
      )
    })
  })

  describe('요약 형식', () => {
    it('errors 칸이 없는 예전 서버 답은 빈 오류 목록으로 본다', () => {
      const oldDevice: Record<string, unknown> = { ...device() }
      delete oldDevice.errors
      const verdict = judgeReport(ok([oldDevice]), MOM)
      expect(verdict.report?.devices[0].errors).toEqual([])
      expect(verdict).toMatchObject({ failures: [], warnings: [] })
    })

    it('위치(where)가 없는 오류 줄도 받는다', () => {
      const noWhere = appError()
      delete noWhere.where
      expect(parseReport({ now: NOW, devices: [device({ errors: [noWhere] })] })?.devices[0].errors).toEqual([noWhere])
    })

    it.each([
      ['errors 가 null', null],
      ['errors 가 배열이 아님', appError()],
      ['오류 줄이 객체가 아님', ['TypeError']],
      ['종류가 글자가 아님', [{ ...appError(), kind: 1 }]],
      ['이름이 없음', [{ ...appError(), name: undefined }]],
      ['글이 글자가 아님', [{ ...appError(), message: null }]],
      ['화면이 없음', [{ ...appError(), screen: undefined }]],
      ['위치가 null', [{ ...appError(), where: null }]],
      ['횟수가 0', [{ ...appError(), count: 0 }]],
      ['횟수가 정수가 아님', [{ ...appError(), count: 2.5 }]],
      ['처음 때가 시각이 아님', [{ ...appError(), firstAt: '어제' }]],
      ['마지막 때가 없음', [{ ...appError(), lastAt: undefined }]],
    ])('오류 칸 모양이 틀리면(%s) "요약 형식이 틀림" 으로 실패한다', (_case, errors) => {
      const body = { now: NOW, devices: [{ ...device(), errors }], export: RECENT_EXPORT }
      expect(parseReport(body)).toBeNull()
      expect(judgeReport({ kind: 'http', status: 200, body }, MOM).failures).toEqual([`${SERVER_DOWN} (요약 형식이 틀림)`])
    })
  })
})
