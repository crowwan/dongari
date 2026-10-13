// 보관본 암호화 (SPEC-006 기술 메모): 복구 코드 하나에서 WebCrypto HKDF(SHA-256)로 두 가지를 따로 만든다.
// (a) 서버 이름: 64자 16진수 — 서버는 이 이름만 알고 복구 코드는 모른다
// (b) AES-GCM 256 키 — 폰에서 암호화해 서버·Cloudflare 도 내용을 모른다 (ADR 005)
import { normalizeRecoveryCode } from './recoveryCode'

// 서버에 올리고 받는 본문 (Worker API 계약 v1)
export interface KeepEnvelope {
  v: 1
  savedAt: string // 보관한 때 (ISO 8601). 불러오기 확인 창에 보여 준다
  iv: string // base64, 12바이트
  data: string // base64 암호문
}

// 같은 코드라도 다른 앱·다른 용도의 값과 겹치지 않게 고정 소금과 용도 이름을 붙인다
const SALT = new TextEncoder().encode('dongari-keep-v1')
const ID_INFO = new TextEncoder().encode('keep-id')
const KEY_INFO = new TextEncoder().encode('keep-key')
const IV_BYTES = 12

// 한 번에 글자로 바꾸는 바이트 수. 배열 전체를 인자로 펼치면 수만~십여만 개에서 인자 수 한도(RangeError)에 걸린다
const CHUNK_BYTES = 0x8000

export function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let start = 0; start < bytes.length; start += CHUNK_BYTES) {
    chunks.push(String.fromCharCode(...bytes.subarray(start, start + CHUNK_BYTES)))
  }
  return btoa(chunks.join(''))
}

// 글자를 하나씩 도는 Uint8Array.from 이라 큰 입력도 인자 수 한도에 걸리지 않는다
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// 코드 글자 → HKDF 원재료. 띄어쓰기·소문자·줄표 차이는 같은 코드로 본다
async function codeMaterial(code: string): Promise<CryptoKey> {
  const normalized = normalizeRecoveryCode(code) ?? code
  return crypto.subtle.importKey('raw', new TextEncoder().encode(normalized), 'HKDF', false, ['deriveBits', 'deriveKey'])
}

function hkdf(info: Uint8Array<ArrayBuffer>): HkdfParams {
  return { name: 'HKDF', hash: 'SHA-256', salt: SALT, info }
}

// 서버 주소에 쓰는 이름 (복구 코드가 아니라 코드에서 만든 값, AC-3)
export async function keepIdOf(code: string): Promise<string> {
  const bits = await crypto.subtle.deriveBits(hkdf(ID_INFO), await codeMaterial(code), 256)
  return toHex(bits)
}

async function keepKeyOf(code: string): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(hkdf(KEY_INFO), await codeMaterial(code), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

// 평문(백업 파일 내용)을 암호화한 본문. iv 는 매번 새로 뽑는다
export async function sealKeep(code: string, plain: string, savedAt: string): Promise<KeepEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keepKeyOf(code), new TextEncoder().encode(plain))
  return { v: 1, savedAt, iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) }
}

// 본문을 푼다. 코드가 틀렸거나(키가 다름) 본문이 망가졌으면 undefined
export async function openKeep(code: string, envelope: KeepEnvelope): Promise<string | undefined> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
      await keepKeyOf(code),
      fromBase64(envelope.data),
    )
    return new TextDecoder().decode(plain)
  } catch {
    return undefined
  }
}
