// 복구 코드 (SPEC-006): 폰이 바뀌어도 기록을 되찾는 열쇠. 로그인 대신 이 16자 하나만 있으면 된다 (ADR 005)
import type { StoredData } from '../../domain/types'

// 헷갈리는 글자(0/O, 1/I/L)를 뺀 대문자·숫자 31자. 16자면 약 79비트
export const RECOVERY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

const CODE_LENGTH = 16
const GROUP_LENGTH = 4
// 0~255 바이트를 31자에 고르게 나누려고 31의 배수(248) 아래만 쓴다
const UNBIASED_LIMIT = Math.floor(256 / RECOVERY_CODE_ALPHABET.length) * RECOVERY_CODE_ALPHABET.length

type FillRandom = (target: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>

// 4자씩 줄표로 끊는다 ("HK7M29QF" → "HK7M-29QF")
function grouped(chars: string): string {
  return (chars.match(new RegExp(`.{1,${GROUP_LENGTH}}`, 'g')) ?? []).join('-')
}

// 무작위로 새 코드를 만든다. 무작위 바이트는 테스트에서 바꿔 넣는다
export function createRecoveryCode(fillRandom: FillRandom = (target) => crypto.getRandomValues(target)): string {
  let chars = ''
  while (chars.length < CODE_LENGTH) {
    for (const byte of fillRandom(new Uint8Array(CODE_LENGTH))) {
      if (byte < UNBIASED_LIMIT && chars.length < CODE_LENGTH) chars += RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length]
    }
  }
  return grouped(chars)
}

// 사람이 넣은 글자에서 띄어쓰기·줄표 등을 빼고 대문자로
function compact(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// 넣은 글자를 코드로 읽는다: 소문자·띄어쓰기·줄표는 무시. 16자가 아니거나 쓰지 않는 글자가 있으면 undefined
export function normalizeRecoveryCode(input: string): string | undefined {
  const chars = compact(input)
  if (chars.length !== CODE_LENGTH) return undefined
  if ([...chars].some((char) => !RECOVERY_CODE_ALPHABET.includes(char))) return undefined
  return grouped(chars)
}

// 글 칸에 넣는 동안 보여 줄 모양: 대문자, 4자마다 줄표, 16자까지
export function formatCodeInput(input: string): string {
  return grouped(compact(input).slice(0, CODE_LENGTH))
}

// 저장 데이터의 복구 코드. 없거나 형식이 틀리면 undefined
export function recoveryCodeOf(data: StoredData): string | undefined {
  const code = data.settings.recoveryCode
  return code === undefined ? undefined : normalizeRecoveryCode(code)
}

// 장부가 있는데 코드가 없으면(이 기능 전 데이터, 코드 없는 옛 백업 파일) 새 코드를 넣는다.
// 장부가 없으면(첫 실행) 첫 장부를 만들 때 생긴다
export function withRecoveryCode(data: StoredData, createCode: () => string = createRecoveryCode): StoredData {
  if (data.books.length === 0 || recoveryCodeOf(data) !== undefined) return data
  return { ...data, settings: { ...data.settings, recoveryCode: createCode() } }
}
