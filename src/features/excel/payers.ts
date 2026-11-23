// 엑셀 수입 줄의 내용 글로 낸 분 나누기 (SPEC-010 8절 "낸 분"). 예: "4월 -2명: 강민지(12만원),김도윤"
import { ENTRY_AMOUNT_MAX, type Payer } from '../../domain/types'
import { parseWonText } from './won'

// 쉼표로 나눈 조각 하나: 이름과 (있으면) 그분 고정 금액
export interface PayerPiece {
  name: string
  fixed?: number
}

// 명단과 맞춘 낸 분 한 분: 회원 번호와 (있으면) 고정 금액
export interface MatchedPayer {
  memberId: string
  fixed?: number
}

// - no-member: 회원이 하나도 없음 → 회비가 아닌 수입(이자·찬조·환불)
// - mixed: 회원이 섞였지만 모두 회원은 아님(또는 같은 분 두 번) → 낸 분 없는 회비
// - members: 모두 회원 → 금액이 맞으면 낸 분 있는 회비
export type PayerMatch = { kind: 'no-member' } | { kind: 'mixed' } | { kind: 'members'; members: MatchedPayer[] }

// 앞의 머리말: "4월 -2명:", "12월-2명 :", "1~3월 -3명:", "4월:", "2명："
const PAYER_HEADER = /^\s*(?:(?:\d{1,2}\s*월?\s*[~～∼-]\s*)?\d{1,2}\s*월[^:：,，、]*|\d+\s*명\s*)[:：]\s*/
const SEPARATORS = new Set([',', '，', '、'])
const PIECE_WITH_NOTE = /^(.*?)[(（]([^)）]*)[)）]$/

// 괄호 밖의 쉼표로만 나눈다 ("이서준(15,000원)"의 쉼표는 금액)
function splitTopLevel(text: string): string[] {
  const pieces: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(' || char === '（') depth += 1
    if (char === ')' || char === '）') depth = Math.max(0, depth - 1)
    if (depth === 0 && SEPARATORS.has(char)) {
      pieces.push(current)
      current = ''
    } else {
      current += char
    }
  }
  return [...pieces, current]
}

function pieceOf(text: string): PayerPiece {
  const match = PIECE_WITH_NOTE.exec(text)
  if (!match) return { name: text }
  const fixed = parseWonText(match[2], true)
  const name = match[1].trim()
  return fixed !== undefined && fixed >= 1 && fixed <= ENTRY_AMOUNT_MAX ? { name, fixed } : { name }
}

// 머리말을 떼고 쉼표(`,` `，` `、`)로 나눈 조각들. 조각마다 앞뒤 공백을 지우고 빈 조각은 뺀다
export function payerPieces(content: string): PayerPiece[] {
  return splitTopLevel(content.replace(PAYER_HEADER, ''))
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '')
    .map(pieceOf)
}

// 조각을 회원 명단(이름 → 회원 번호)과 맞춘다
export function matchPayers(content: string, roster: ReadonlyMap<string, string>): PayerMatch {
  const pieces = payerPieces(content)
  const ids = pieces.map((piece) => roster.get(piece.name))
  if (ids.every((id) => id === undefined)) return { kind: 'no-member' }
  const members: MatchedPayer[] = []
  for (const [index, memberId] of ids.entries()) {
    if (memberId === undefined || members.some((member) => member.memberId === memberId)) return { kind: 'mixed' }
    const { fixed } = pieces[index]
    members.push(fixed === undefined ? { memberId } : { memberId, fixed })
  }
  return { kind: 'members', members }
}

function fixedSum(members: readonly MatchedPayer[]): number {
  return members.reduce((sum, member) => sum + (member.fixed ?? 0), 0)
}

// 한 분 몫: 고정 금액을 뺀 남은 금액을 고정 금액이 없는 분 수로 똑같이 나눈 값. 1원 이상 정수가 아니면 없음.
// 월 회비를 정할 때(그 해 가장 흔한 한 분 몫, AC-26)와 낸 분을 나눌 때 같이 쓴다
export function equalShare(members: readonly MatchedPayer[], amount: number): number | undefined {
  const sharing = members.filter((member) => member.fixed === undefined).length
  if (sharing === 0) return undefined
  const share = (amount - fixedSum(members)) / sharing
  return Number.isInteger(share) && share >= 1 ? share : undefined
}

// 낸 분 (월 회비가 정해진 뒤): 한 분 몫이 월 회비의 배수일 때만. 모든 분 금액이 고정이면 합이 기록 금액과 같을 때만
export function splitPayers(members: readonly MatchedPayer[], amount: number, monthlyFee: number | undefined): Payer[] | undefined {
  const allFixed = members.every((member) => member.fixed !== undefined)
  if (allFixed) {
    return fixedSum(members) === amount ? members.map((member) => ({ memberId: member.memberId, amount: member.fixed ?? 0 })) : undefined
  }
  const share = equalShare(members, amount)
  if (share === undefined || monthlyFee === undefined || share % monthlyFee !== 0) return undefined
  return members.map((member) => ({ memberId: member.memberId, amount: member.fixed ?? share }))
}
