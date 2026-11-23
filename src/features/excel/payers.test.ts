import { describe, expect, it } from 'vitest'
import { equalShare, matchPayers, payerPieces, splitPayers, type MatchedPayer, type PayerPiece } from './payers'

// 지어낸 회원 명단: 이름 → 회원 번호
const roster = new Map([
  ['강민지', 'm1'],
  ['김도윤', 'm2'],
  ['이서준', 'm3'],
])

function members(content: string): MatchedPayer[] {
  const match = matchPayers(content, roster)
  if (match.kind !== 'members') throw new Error(`회원으로 나누지 못했다: ${match.kind}`)
  return match.members
}

// 조각의 이름·고정 금액만 (조각 전체 글 text 는 회원 맞추기에서 본다)
function nameAndFixed({ name, fixed }: PayerPiece) {
  return fixed === undefined ? { name } : { name, fixed }
}

describe('SPEC-010 엑셀 낸 분 조각 읽기 (8절 "낸 분")', () => {
  it.each([
    ['쉼표', '강민지,김도윤', ['강민지', '김도윤']],
    ['전각 쉼표', '강민지，김도윤', ['강민지', '김도윤']],
    ['모점', '강민지、김도윤', ['강민지', '김도윤']],
    ['앞뒤 공백', ' 강민지 , 김도윤 ', ['강민지', '김도윤']],
    ['끝 쉼표', '강민지,김도윤,', ['강민지', '김도윤']],
    ['머리말 "N월 -N명:"', '4월 -2명: 강민지,김도윤', ['강민지', '김도윤']],
    ['머리말 "N월-N명 :"', '12월-2명 : 강민지,김도윤', ['강민지', '김도윤']],
    ['머리말 "N월:"', '4월:강민지', ['강민지']],
    ['머리말 "N명："', '2명：강민지,김도윤', ['강민지', '김도윤']],
    ['머리말 "1~3월 -2명:"', '1~3월 -2명: 강민지,김도윤', ['강민지', '김도윤']],
  ])('머리말을 떼고 쉼표로 나눈 조각마다 앞뒤 공백을 지운다: %s', (_label, content, names) => {
    expect(payerPieces(content).map((piece) => piece.name)).toEqual(names)
  })

  it('"이름(…)"은 괄호 앞 이름만 보고, "이름(N만원)"·"이름(N원)"은 그분 금액을 고정한다', () => {
    expect(payerPieces('강민지(3개월),김도윤(12만원),이서준(15,000원),박하늘(2만),최유나（5000원）').map(nameAndFixed)).toEqual([
      { name: '강민지' },
      { name: '김도윤', fixed: 120_000 },
      { name: '이서준', fixed: 15_000 },
      { name: '박하늘', fixed: 20_000 },
      { name: '최유나', fixed: 5_000 },
    ])
  })

  it('괄호 안이 만·원 없는 숫자(달 수 같은 것)면 금액이 아니라 이름만 본다', () => {
    expect(payerPieces('강민지(3),김도윤(2)').map(nameAndFixed)).toEqual([{ name: '강민지' }, { name: '김도윤' }])
  })

  it('머리말 모양이 아닌 쌍점 앞 글은 떼지 않는다', () => {
    expect(payerPieces('찬조: 강민지').map((piece) => piece.name)).toEqual(['찬조: 강민지'])
  })
})

describe('SPEC-010 엑셀 낸 분 회원과 맞추기 (8절 "낸 분")', () => {
  it('AC-25 이름만 이어진 입금은 모두 회원이다', () => {
    expect(matchPayers('4월 -2명: 강민지,김도윤', roster)).toEqual({
      kind: 'members',
      members: [{ memberId: 'm1' }, { memberId: 'm2' }],
    })
  })

  it('AC-25 "이름(12만원)"은 그분 고정 금액이다', () => {
    expect(members('강민지(12만원),김도윤')).toEqual([{ memberId: 'm1', fixed: 120_000 }, { memberId: 'm2' }])
  })

  it('AC-25 회원이 섞였지만 회원 아닌 조각이 있으면 나누지 못한 입금이다', () => {
    expect(matchPayers('강민지,외부 손님', roster)).toEqual({ kind: 'mixed' })
  })

  it('같은 회원이 두 번 나오면 나누지 못한 입금이다 (낸 분에 같은 회원 두 번 없음)', () => {
    expect(matchPayers('강민지,강민지(1만원)', roster)).toEqual({ kind: 'mixed' })
  })

  it('조각 전체가 명단 이름과 같으면(괄호가 든 이름 "김민지(91)") 괄호를 떼기 전에 그 회원으로 본다 (#180 리뷰)', () => {
    // 같은 이름 두 분을 괄호로 구분한 명단
    const twins = new Map([
      ['김민지', 'k1'],
      ['김민지(91)', 'k2'],
    ])

    expect(matchPayers('김민지(91)', twins)).toEqual({ kind: 'members', members: [{ memberId: 'k2' }] })
    expect(matchPayers('김민지,김민지(91)', twins)).toEqual({ kind: 'members', members: [{ memberId: 'k1' }, { memberId: 'k2' }] })
    // 괄호가 든 이름 뒤 금액: 마지막 괄호가 금액
    expect(matchPayers('김민지(91)(2만원)', twins)).toEqual({ kind: 'members', members: [{ memberId: 'k2', fixed: 20_000 }] })
  })

  it.each([
    ['이자', '이자'],
    ['찬조', '박하늘 찬조'],
    ['빈칸', ''],
  ])('AC-25 회원이 하나도 없는 입금(%s)은 회비가 아니다', (_label, content) => {
    expect(matchPayers(content, roster)).toEqual({ kind: 'no-member' })
  })
})

describe('SPEC-010 엑셀 낸 분 나누기 (8절 "낸 분")', () => {
  it('한 분 몫: 고정 금액을 뺀 남은 금액을 나머지 분 수로 똑같이 나눈다', () => {
    expect(equalShare(members('강민지,김도윤,이서준'), 30_000)).toBe(10_000)
    expect(equalShare(members('강민지(12만원),김도윤,이서준'), 140_000)).toBe(10_000)
  })

  it.each([
    ['나눠떨어지지 않음', '강민지,김도윤,이서준', 10_000],
    ['고정 금액 합이 기록 금액과 같음', '강민지(1만원),김도윤', 10_000],
    ['고정 금액 합이 기록 금액보다 큼', '강민지(2만원),김도윤', 10_000],
    ['나눌 분 없음(모두 고정)', '강민지(1만원),김도윤(1만원)', 20_000],
  ])('한 분 몫이 1원 이상 정수가 아니면 없다: %s', (_label, content, amount) => {
    expect(equalShare(members(content), amount)).toBeUndefined()
  })

  it('AC-25 한 분 몫이 그 해 월 회비의 배수면 낸 분이 된다 (고정 금액 분은 그 금액)', () => {
    expect(splitPayers(members('강민지,김도윤'), 60_000, 10_000)).toEqual([
      { memberId: 'm1', amount: 30_000 },
      { memberId: 'm2', amount: 30_000 },
    ])
    expect(splitPayers(members('강민지(12만원),김도윤'), 130_000, 10_000)).toEqual([
      { memberId: 'm1', amount: 120_000 },
      { memberId: 'm2', amount: 10_000 },
    ])
  })

  it('AC-26 한 분 몫이 월 회비의 배수가 아니면 낸 분이 없다', () => {
    expect(splitPayers(members('강민지,김도윤'), 30_000, 10_000)).toBeUndefined()
  })

  it('월 회비가 정해지지 않은 해에는 똑같이 나눌 몫을 판정할 수 없어 낸 분이 없다', () => {
    expect(splitPayers(members('강민지,김도윤'), 20_000, undefined)).toBeUndefined()
  })

  it('모든 분 금액이 고정이고 합이 기록 금액과 같으면 그대로 낸 분이 된다 (앱이 내보낸 엑셀 다시 읽기)', () => {
    expect(splitPayers(members('강민지(2만원),김도윤(4만원)'), 60_000, undefined)).toEqual([
      { memberId: 'm1', amount: 20_000 },
      { memberId: 'm2', amount: 40_000 },
    ])
    expect(splitPayers(members('강민지(2만원),김도윤(4만원)'), 70_000, 10_000)).toBeUndefined()
  })
})
