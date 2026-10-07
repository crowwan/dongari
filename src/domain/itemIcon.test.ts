import { describe, expect, it } from 'vitest'
import { itemIcon } from './itemIcon'

describe('SPEC-001 항목 아이콘', () => {
  it('AC-18 장부·내역 적기의 항목 아이콘은 이름으로 정해진다(회비 → 사람들, 대관료 → 건물, 간식비 → 컵, 모르는 이름 → 영수증)', () => {
    expect(itemIcon('회비')).toBe('users')
    expect(itemIcon('대관료')).toBe('building')
    expect(itemIcon('간식비')).toBe('cup')
    expect(itemIcon('행사비')).toBe('receipt')
  })

  it('비슷한 말도 같은 아이콘이다 (회원·장소·임대·음료·커피·다과)', () => {
    expect(itemIcon('신입 회원 가입비')).toBe('users')
    expect(itemIcon('장소 사용료')).toBe('building')
    expect(itemIcon('임대료')).toBe('building')
    expect(itemIcon('음료')).toBe('cup')
    expect(itemIcon('커피값')).toBe('cup')
    expect(itemIcon('다과비')).toBe('cup')
  })

  it('지원금·후원은 선물, 이자·은행은 은행, 꽃은 꽃 아이콘이다', () => {
    expect(itemIcon('행사지원금')).toBe('gift')
    expect(itemIcon('후원금')).toBe('gift')
    expect(itemIcon('예금 이자')).toBe('bank')
    expect(itemIcon('은행 수수료')).toBe('bank')
    expect(itemIcon('꽃값')).toBe('flower')
  })

  it('앞뒤 공백이 있어도 같은 아이콘이고, 빈 이름은 영수증이다', () => {
    expect(itemIcon('  회비 ')).toBe('users')
    expect(itemIcon('')).toBe('receipt')
  })
})
