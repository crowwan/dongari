import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type StoredData } from '../../domain/types'
import { book } from '../../test/ledgerFixtures'
import {
  createRecoveryCode,
  formatCodeInput,
  normalizeRecoveryCode,
  RECOVERY_CODE_ALPHABET,
  recoveryCodeOf,
  withRecoveryCode,
} from './recoveryCode'

const CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/

function stored(settings: StoredData['settings'] = {}, withBook = true): StoredData {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, books: withBook ? [book([])] : [], settings }
}

describe('SPEC-006 복구 코드 만들기', () => {
  it('AC-1 16자를 4자씩 줄표로 끊은 대문자·숫자다', () => {
    const code = createRecoveryCode()
    expect(code).toMatch(CODE_PATTERN)
    expect(code.replaceAll('-', '')).toHaveLength(16)
  })

  it('AC-1 헷갈리는 글자(0/O, 1/I/L)는 쓰지 않는다', () => {
    for (const confusing of ['0', 'O', '1', 'I', 'L']) expect(RECOVERY_CODE_ALPHABET).not.toContain(confusing)
    // 31자: 숫자 2~9 여덟 + 영문 대문자 스물셋
    expect(RECOVERY_CODE_ALPHABET).toHaveLength(31)
    for (let index = 0; index < 50; index += 1) expect(createRecoveryCode()).not.toMatch(/[01OIL]/)
  })

  it('무작위 값으로 만든다 (만들 때마다 다르다)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => createRecoveryCode()))
    expect(codes.size).toBe(20)
  })

  it('무작위 바이트를 글자 수에 고르게 나누려고 248 이상은 버리고 다시 뽑는다', () => {
    // 첫 바이트들은 버려지고(255, 248) 그다음부터 0 → '2', 30 → 마지막 글자, 31 → 다시 '2'
    const bytes = [255, 248, 0, 30, 31, ...Array.from({ length: 13 }, () => 1)]
    const random = (target: Uint8Array<ArrayBuffer>) => {
      target.forEach((_, index) => {
        target[index] = bytes.shift() ?? 1
      })
      return target
    }
    const code = createRecoveryCode(random)
    expect(code.slice(0, 3)).toBe(`2${RECOVERY_CODE_ALPHABET.at(-1)}2`)
  })
})

describe('SPEC-006 복구 코드 읽기', () => {
  it('소문자·띄어쓰기·줄표를 무시하고 16자면 4자씩 끊은 코드가 된다', () => {
    expect(normalizeRecoveryCode('hk7m 29qf-mx4p8r2d')).toBe('HK7M-29QF-MX4P-8R2D')
  })

  it('16자가 아니거나 쓰지 않는 글자가 있으면 코드가 아니다', () => {
    expect(normalizeRecoveryCode('HK7M-29QF-MX4P')).toBeUndefined()
    expect(normalizeRecoveryCode('HK7M-29QF-MX4P-8R2DX')).toBeUndefined()
    expect(normalizeRecoveryCode('HK7M-29QF-MX4P-8R20')).toBeUndefined()
  })

  it('글 칸에 넣는 동안 4자마다 줄표를 저절로 넣고 16자에서 자른다', () => {
    expect(formatCodeInput('hk7m29')).toBe('HK7M-29')
    expect(formatCodeInput('HK7M')).toBe('HK7M')
    expect(formatCodeInput('hk7m-29qf mx4p 8r2d 99')).toBe('HK7M-29QF-MX4P-8R2D')
    // 쓰지 않는 글자(기호 등)는 빼고, 헷갈리는 글자도 그대로 보여 준다 (불러올 때 틀린 코드로 알린다)
    expect(formatCodeInput('a!b@c#d0')).toBe('ABCD-0')
  })
})

describe('SPEC-006 저장 데이터의 복구 코드', () => {
  it('저장 데이터에 든 코드를 읽는다. 없거나 형식이 틀리면 없다', () => {
    expect(recoveryCodeOf(stored({ recoveryCode: 'HK7M-29QF-MX4P-8R2D' }))).toBe('HK7M-29QF-MX4P-8R2D')
    expect(recoveryCodeOf(stored())).toBeUndefined()
    expect(recoveryCodeOf(stored({ recoveryCode: '틀린 코드' }))).toBeUndefined()
  })

  it('장부가 있고 코드가 없으면 새 코드를 넣는다', () => {
    const data = withRecoveryCode(stored(), () => 'AAAA-BBBB-CCCC-DDDD')
    expect(data.settings.recoveryCode).toBe('AAAA-BBBB-CCCC-DDDD')
  })

  it('이미 코드가 있으면 그대로 둔다 (같은 객체)', () => {
    const data = stored({ recoveryCode: 'HK7M-29QF-MX4P-8R2D' })
    expect(withRecoveryCode(data, () => 'AAAA-BBBB-CCCC-DDDD')).toBe(data)
  })

  it('장부가 없으면(첫 실행) 만들지 않는다', () => {
    const data = stored({}, false)
    expect(withRecoveryCode(data, () => 'AAAA-BBBB-CCCC-DDDD')).toBe(data)
  })
})
