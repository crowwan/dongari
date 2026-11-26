import { describe, expect, it } from 'vitest'
import {
  addError,
  cleanText,
  ERROR_KEEP_MS,
  isAppError,
  MAX_ERRORS,
  rawErrorOf,
  recentErrors,
  seenError,
  type AppError,
  type SeenError,
} from './appErrors'

const ORIGIN = 'https://uri-jangbu-preview.pages.dev'
const AT = new Date('2026-11-26T05:00:00.000Z')

function seen(overrides: Partial<SeenError> = {}): SeenError {
  return { kind: 'render', name: 'TypeError', message: "Cannot read properties of undefined (reading 'x')", screen: 'dues', ...overrides }
}

function line(overrides: Partial<AppError> = {}): AppError {
  return { ...seen(), count: 1, firstAt: '2026-11-25T00:00:00.000Z', lastAt: '2026-11-25T00:00:00.000Z', ...overrides }
}

// 크롬 모양 스택: 맨 위 줄이 앱 파일
const APP_STACK = [
  "TypeError: Cannot read properties of undefined (reading 'x')",
  `    at DuesScreen (${ORIGIN}/assets/index-abc123.js:1:23456)`,
  `    at renderWithHooks (${ORIGIN}/assets/index-abc123.js:1:9999)`,
].join('\n')

describe('SPEC-012 AC-7 오류 글 정리', () => {
  it('숫자 덩어리는 #, 영문·숫자·기호가 아닌 글자 덩어리는 … 로 바꾼다', () => {
    expect(cleanText('Cannot read properties of undefined (reading 12)', 120)).toBe('Cannot read properties of undefined (reading #)')
    expect(cleanText('회비 낸 분이 없어요 at row 3', 120)).toBe('… at row #')
    expect(cleanText('index 0 out of 1.5', 120)).toBe('index # out of #.#')
  })

  it('이름·금액이 든 오류 글을 넣어도 보내는 글에 이름·금액이 남지 않는다', () => {
    const cleaned = cleanText('Invalid payer 김민지 amount 12,000원 for 회비 (book 7f3a)', 120)
    expect(cleaned).toBe('Invalid payer … amount #,#… for … (book #f#a)')
    expect(cleaned).not.toMatch(/김민지|회비|12|000/)
  })

  it('한글 낱말 사이 빈칸은 한 덩어리로 본다 (낱말 수가 드러나지 않게)', () => {
    expect(cleanText('Missing 김 민 지 here', 120)).toBe('Missing … here')
  })

  it('줄바꿈·탭은 빈칸 하나로, 앞뒤 빈칸은 지운다', () => {
    expect(cleanText('  first line\n\tsecond   line  ', 120)).toBe('first line second line')
  })

  it('주소는 파일 이름만 남긴다 (주소·경로는 빼고, 파일 이름의 숫자도 #)', () => {
    expect(cleanText(`Failed to fetch dynamically imported module: ${ORIGIN}/assets/ExcelImportScreen-B2xQ.js?v=3`, 120)).toBe(
      'Failed to fetch dynamically imported module: ExcelImportScreen-B#xQ.js',
    )
    expect(cleanText('Load failed https://example.com/ ok', 120)).toBe('Load failed … ok')
  })

  it('끝에 :줄:칸 이 붙은 주소(스택 모양)도 파일 이름만 남긴다', () => {
    expect(cleanText(`boom at ${ORIGIN}/assets/index-Bx.js:1:234 end`, 120)).toBe('boom at index-Bx.js end')
    expect(cleanText(`boom at ${ORIGIN}/assets/index-Bx.js:17`, 120)).toBe('boom at index-Bx.js')
  })

  it('복구 코드 모양(4자 × 4 묶음)은 … 로 바꾼다', () => {
    expect(cleanText('bad code HK7M-29QF-MX4P-8R2D given', 120)).toBe('bad code … given')
    expect(cleanText('bad code hk7m-29qf-mx4p-8r2d', 120)).toBe('bad code …')
  })

  it('정한 길이를 넘으면 잘라 끝에 … 를 붙인다', () => {
    const cleaned = cleanText('a'.repeat(200), 120)
    expect(cleaned).toHaveLength(120)
    expect(cleaned.endsWith('a…')).toBe(true)
    expect(cleanText('a'.repeat(120), 120)).toBe('a'.repeat(120))
  })

  it('정리한 글에는 영문·숫자·기호(ASCII)와 … 만 남는다', () => {
    const cleaned = cleanText('Ünïcödé 😀 emoji ｆｕｌｌ\u0000ctl 中文 漢字', 120)
    expect(cleaned).toMatch(/^[\x20-\x7e…]*$/)
  })
})

describe('SPEC-012 AC-6 오류 하나 정리 (종류·이름·글·화면·위치)', () => {
  it('이름 40자·글 120자·화면 32자까지, 위치는 스택 첫 앱 파일의 파일이름:줄:칸 (주소·경로 없이)', () => {
    const error = seenError('render', { name: `Type${'E'.repeat(60)}`, message: 'x'.repeat(300), stack: APP_STACK }, 's'.repeat(50), ORIGIN)
    expect(error?.name).toHaveLength(40)
    expect(error?.message).toHaveLength(120)
    expect(error?.screen).toHaveLength(32)
    expect(error?.where).toBe('index-abc123.js:1:23456')
  })

  it('이름이 비면 Error, 화면을 모르면 unknown', () => {
    expect(seenError('render', { name: '', message: 'boom' }, '', ORIGIN)).toEqual({ kind: 'render', name: 'Error', message: 'boom', screen: 'unknown' })
  })

  it('스택이 앱 파일이 아닌 곳에서 시작하면 그 아래 첫 앱 파일 줄을 위치로 쓴다', () => {
    const stack = ['Error: x', '    at foo (chrome-extension://abcdef/content.js:2:10)', `    at bar (${ORIGIN}/assets/ledger-9Fk2.js:4:120)`].join('\n')
    expect(seenError('render', { name: 'Error', message: 'x', stack }, 'ledger', ORIGIN)?.where).toBe('ledger-9Fk2.js:4:120')
  })

  it('사파리·파이어폭스 모양 스택(함수@주소:줄:칸)도 읽는다', () => {
    const stack = `render@${ORIGIN}/assets/index-abc123.js:1:777\nfoo@${ORIGIN}/assets/index-abc123.js:1:888`
    expect(seenError('render', { name: 'Error', message: 'x', stack }, 'ledger', ORIGIN)?.where).toBe('index-abc123.js:1:777')
  })

  it('스택이 없으면 오류 이벤트의 파일 이름:줄:칸, 그것도 없으면 위치를 뺀다', () => {
    expect(
      seenError('uncaught', { name: 'Error', message: 'x', filename: `${ORIGIN}/assets/index-abc123.js`, line: 1, column: 42 }, 'ledger', ORIGIN)?.where,
    ).toBe('index-abc123.js:1:42')
    expect(seenError('render', { name: 'Error', message: 'x' }, 'ledger', ORIGIN)).not.toHaveProperty('where')
  })

  it('개발 서버 주소(쿼리 붙은 소스 파일)도 파일 이름만 남긴다', () => {
    const stack = 'Error: x\n    at App (http://localhost:7777/dongari/src/App.tsx?t=1764000000000:120:9)'
    expect(seenError('render', { name: 'Error', message: 'x', stack }, 'ledger', 'http://localhost:7777')?.where).toBe('App.tsx:120:9')
  })

  describe('세지 않는 것', () => {
    it('사용자 취소(AbortError)는 세지 않는다', () => {
      expect(seenError('rejection', { name: 'AbortError', message: 'Share canceled' }, 'year-summary', ORIGIN)).toBeUndefined()
      expect(seenError('uncaught', { name: 'AbortError', message: 'The user aborted a request.' }, 'ledger', ORIGIN)).toBeUndefined()
    })

    it('내용 없는 Script error.(다른 출처 스크립트)는 세지 않는다', () => {
      expect(seenError('uncaught', { name: 'Error', message: 'Script error.' }, 'ledger', ORIGIN)).toBeUndefined()
    })

    it('파일 이름이 다른 출처(확장·카톡 안 브라우저가 넣은 스크립트)면 세지 않는다', () => {
      expect(
        seenError('uncaught', { name: 'TypeError', message: 'x is not a function', filename: 'https://t1.kakaocdn.net/inject.js', line: 1, column: 5 }, 'ledger', ORIGIN),
      ).toBeUndefined()
    })

    it('스택에 주소가 있는데 앱 파일이 하나도 없으면 세지 않는다', () => {
      const stack = 'TypeError: x\n    at inject (chrome-extension://abcdef/content.js:2:10)'
      expect(seenError('rejection', { name: 'TypeError', message: 'x', stack }, 'ledger', ORIGIN)).toBeUndefined()
    })

    it('앱 파일 흔적이 있거나 위치를 알 수 없으면 센다 (다른 출처라는 증거가 없음)', () => {
      expect(seenError('rejection', { name: 'TypeError', message: 'Failed to fetch', stack: APP_STACK }, 'ledger', ORIGIN)).toBeDefined()
      expect(seenError('rejection', { name: 'NonError', message: 'oops' }, 'ledger', ORIGIN)).toBeDefined()
    })

    it('주소가 앱 출처로 시작하기만 하는 다른 사이트(…pages.dev.evil.com)는 앱 파일이 아니다', () => {
      expect(
        seenError('uncaught', { name: 'Error', message: 'x', filename: `${ORIGIN}.evil.com/a.js`, line: 1, column: 1 }, 'ledger', ORIGIN),
      ).toBeUndefined()
    })
  })

  it('저장 실패(save)는 이름을 실패 이유로 그대로 둔다', () => {
    expect(seenError('save', { name: 'quota-exceeded', message: '' }, 'ledger', ORIGIN)).toEqual({
      kind: 'save',
      name: 'quota-exceeded',
      message: '',
      screen: 'ledger',
    })
  })
})

describe('SPEC-012 오류 값 읽기', () => {
  it('Error·DOMException 은 이름·글·스택을, 글자는 NonError 와 그 글을, 그 밖은 NonError 만', () => {
    const error = new TypeError('boom')
    expect(rawErrorOf(error)).toEqual({ name: 'TypeError', message: 'boom', stack: error.stack })
    expect(rawErrorOf(new DOMException('canceled', 'AbortError'))).toMatchObject({ name: 'AbortError', message: 'canceled' })
    expect(rawErrorOf('잘못됨')).toEqual({ name: 'NonError', message: '잘못됨' })
    expect(rawErrorOf(undefined)).toEqual({ name: 'NonError', message: '' })
    expect(rawErrorOf({ name: 42 })).toEqual({ name: 'NonError', message: '' })
  })
})

describe('SPEC-012 AC-6 같은 오류 묶기·7일·5줄', () => {
  it('처음 난 오류는 횟수 1, 처음·마지막 때가 지금이다', () => {
    expect(addError([], seen(), AT)).toEqual([{ ...seen(), count: 1, firstAt: AT.toISOString(), lastAt: AT.toISOString() }])
  })

  it('같은 오류(종류·이름·정리한 글·화면이 같음)는 한 줄로 묶어 횟수와 마지막 때만 올린다', () => {
    const first = addError([], seen(), new Date('2026-11-26T01:00:00.000Z'))
    const again = addError(first, seen({ where: 'index-abc123.js:1:2' }), AT)
    expect(again).toEqual([{ ...seen(), where: 'index-abc123.js:1:2', count: 2, firstAt: '2026-11-26T01:00:00.000Z', lastAt: AT.toISOString() }])
  })

  it.each([
    ['종류', { kind: 'uncaught' as const }],
    ['이름', { name: 'RangeError' }],
    ['글', { message: 'other' }],
    ['화면', { screen: 'ledger' }],
  ])('%s 이 다르면 다른 줄이다', (_label, change) => {
    expect(addError(addError([], seen(), AT), seen(change), AT)).toHaveLength(2)
  })

  it('마지막 때가 7일 지난 줄은 버린다 (정확히 7일은 남긴다)', () => {
    const exactly = line({ name: 'Exactly', lastAt: new Date(AT.getTime() - ERROR_KEEP_MS).toISOString() })
    const older = line({ name: 'Older', lastAt: new Date(AT.getTime() - ERROR_KEEP_MS - 1).toISOString() })
    expect(recentErrors([older, exactly], AT).map((error) => error.name)).toEqual(['Exactly'])
    expect(addError([older], seen(), AT).map((error) => error.name)).toEqual(['TypeError'])
  })

  it('5줄을 넘으면 마지막 때가 오래된 줄부터 버린다', () => {
    const lines = ['A', 'B', 'C', 'D', 'E'].map((name, index) => line({ name, lastAt: `2026-11-2${index}T00:00:00.000Z` }))
    const added = addError([lines[3], lines[0], lines[4], lines[2], lines[1]], seen({ name: 'F' }), AT)
    expect(added).toHaveLength(MAX_ERRORS)
    expect(added.map((error) => error.name)).toEqual(['B', 'C', 'D', 'E', 'F'])
  })

  it('목록은 마지막 때 순(오래된 것 먼저)이다', () => {
    const later = line({ name: 'Later', lastAt: '2026-11-25T10:00:00.000Z' })
    const earlier = line({ name: 'Earlier', lastAt: '2026-11-25T09:00:00.000Z' })
    expect(recentErrors([later, earlier], AT).map((error) => error.name)).toEqual(['Earlier', 'Later'])
  })
})

describe('SPEC-012 폰에 둔 오류 줄 모양 검사', () => {
  it('서버가 받는 모양(칸 길이·종류·횟수·때)이면 참', () => {
    expect(isAppError(line())).toBe(true)
    expect(isAppError(line({ where: 'index.js:1:2' }))).toBe(true)
  })

  it.each([
    ['종류 모름', { kind: 'crash' }],
    ['이름 빔', { name: '' }],
    ['이름 41자', { name: 'n'.repeat(41) }],
    ['글 121자', { message: 'm'.repeat(121) }],
    ['화면 빔', { screen: '' }],
    ['위치 81자', { where: 'w'.repeat(81) }],
    ['횟수 0', { count: 0 }],
    ['때가 시각이 아님', { lastAt: '어제' }],
    ['다른 칸', { stack: 'x' }],
  ])('%s 이면 거짓 (보내면 서버가 400 으로 신호를 통째로 버린다)', (_label, change) => {
    expect(isAppError({ ...line(), ...change })).toBe(false)
  })
})
