import { describe, expect, it } from 'vitest'
import type { FrequentChoice } from '../../domain/ledger'
import { answerRows, isStepDirty, startSteps, stepButton, stepReducer, type StepAction, type StepState } from './entrySteps'

// 처음 상태에서 동작을 차례로 적용한다
function run(...actions: StepAction[]): StepState {
  return actions.reduce(stepReducer, startSteps(10))
}

const RENT: FrequentChoice = { name: '대관료', type: 'expense' }

describe('SPEC-001 하나씩 채우기 단계', () => {
  it('AC-3 처음에는 보던 달만 정해져 있고 "무엇인가요?"(항목 고르기) 단계다', () => {
    const state = startSteps(10)

    expect(state.step).toBe('item')
    expect(state.draft).toEqual({ month: 10, type: undefined, name: '', amount: 0 })
    expect(answerRows(state)).toEqual([{ kind: 'month', month: 10 }])
  })

  it('AC-4 항목을 고르면 이름과 그 항목의 종류가 정해지고 금액 단계로 넘어간다', () => {
    const state = run({ kind: 'pick-item', choice: RENT })

    expect(state.step).toBe('amount')
    expect(state.draft).toMatchObject({ name: '대관료', type: 'expense' })
    // "적은 내용" 카드: 달 줄 + 항목 줄(이름과 종류를 한 줄에)
    expect(answerRows(state)).toEqual([
      { kind: 'month', month: 10 },
      { kind: 'item', name: '대관료', type: 'expense' },
    ])
  })

  describe('직접 적기', () => {
    it('[직접 적기] 를 누르면 이름 적기 단계이고, 이름이 비면 [다음] 을 누를 수 없다', () => {
      const state = run({ kind: 'start-custom' }, { kind: 'type-custom-name', name: '   ' })

      expect(state.step).toBe('custom-name')
      expect(stepButton(state)).toEqual({ label: '다음', missing: '무엇인지 적어 주세요' })
      expect(stepReducer(state, { kind: 'submit-custom-name', knownType: undefined })).toBe(state)
    })

    it('AC-15 처음 쓰는 이름이면 이름만 정하고 "수입인가요, 지출인가요?" 단계로 간다 (종류 기본값 없음)', () => {
      const state = run(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: ' 꽃값 ' },
        { kind: 'submit-custom-name', knownType: undefined },
      )

      expect(state.step).toBe('custom-type')
      expect(state.draft).toMatchObject({ name: '꽃값', type: undefined })
      expect(stepButton(state)).toEqual({ label: '다음', missing: '수입인지 지출인지 골라 주세요' })
      // 묻는 동안 항목 줄은 이름만 (종류는 지금 묻는 값이라 카드에 올리지 않는다)
      expect(answerRows(state)).toEqual([
        { kind: 'month', month: 10 },
        { kind: 'item', name: '꽃값', type: undefined },
      ])
    })

    it('AC-4 새 이름의 종류를 골라도 [다음] 을 누르기 전에는 카드 항목 줄에 종류를 올리지 않는다', () => {
      const state = run(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: '꽃값' },
        { kind: 'submit-custom-name', knownType: undefined },
        { kind: 'pick-type', entryType: 'expense' },
      )

      expect(answerRows(state)).toEqual([
        { kind: 'month', month: 10 },
        { kind: 'item', name: '꽃값', type: undefined },
      ])
      expect(answerRows(stepReducer(state, { kind: 'submit-type' }))).toEqual([
        { kind: 'month', month: 10 },
        { kind: 'item', name: '꽃값', type: 'expense' },
      ])
    })

    it('AC-4 이름을 적는 동안에는 항목 줄을 올리지 않는다 (고른 항목을 바꾸러 와 직접 적기로 가도)', () => {
      const state = run({ kind: 'pick-item', choice: RENT }, { kind: 'revisit-item' }, { kind: 'start-custom' })

      expect(answerRows(state)).toEqual([{ kind: 'month', month: 10 }])
    })

    it('AC-15 새 이름의 종류를 고르고 [다음] 을 누르면 금액 단계로 간다', () => {
      const asking = run(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: '꽃값' },
        { kind: 'submit-custom-name', knownType: undefined },
      )
      expect(stepReducer(asking, { kind: 'submit-type' })).toBe(asking)

      const state = run(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: '꽃값' },
        { kind: 'submit-custom-name', knownType: undefined },
        { kind: 'pick-type', entryType: 'expense' },
        { kind: 'submit-type' },
      )

      expect(state.step).toBe('amount')
      expect(state.draft).toMatchObject({ name: '꽃값', type: 'expense' })
    })

    it('AC-15 예전에 쓴 이름이면 묻지 않고 그때 종류로 정해 금액 단계로 간다', () => {
      const state = run(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: '찬조금' },
        { kind: 'submit-custom-name', knownType: 'income' },
      )

      expect(state.step).toBe('amount')
      expect(state.draft).toMatchObject({ name: '찬조금', type: 'income' })
    })

    it('적던 이름에서 목록으로 돌아갈 수 있다', () => {
      const state = run({ kind: 'start-custom' }, { kind: 'revisit-item' })

      expect(state.step).toBe('item')
      expect(stepButton(state)).toBeNull()
    })
  })

  describe('AC-5 금액', () => {
    it('금액이 0 이면 [저장] 을 누를 수 없고 "얼마인지 적어 주세요"', () => {
      const state = run({ kind: 'pick-item', choice: RENT })

      expect(stepButton(state)).toEqual({ label: '저장', missing: '얼마인지 적어 주세요' })
    })

    it('금액을 적으면 [저장] 을 누를 수 있다', () => {
      const state = run({ kind: 'pick-item', choice: RENT }, { kind: 'change-amount', amount: 40_000 })

      expect(stepButton(state)).toEqual({ label: '저장', missing: undefined })
    })
  })

  describe('AC-16 알약 눌러 고치기', () => {
    it('종류·항목 알약을 누르면 항목 고르기로 돌아가고 금액은 그대로다', () => {
      const state = run(
        { kind: 'pick-item', choice: RENT },
        { kind: 'change-amount', amount: 40_000 },
        { kind: 'revisit-item' },
      )

      expect(state.step).toBe('item')
      expect(state.draft.amount).toBe(40_000)

      const changed = stepReducer(state, { kind: 'pick-item', choice: { name: '회비', type: 'income' } })
      expect(changed.step).toBe('amount')
      expect(changed.draft).toEqual({ month: 10, type: 'income', name: '회비', amount: 40_000 })
    })

    it('달을 바꿔도 지금 단계는 그대로다', () => {
      const state = run({ kind: 'pick-item', choice: RENT }, { kind: 'change-month', month: 3 })

      expect(state.step).toBe('amount')
      expect(state.draft.month).toBe(3)
    })
  })

  describe('버릴까요 (적던 내용)', () => {
    it('처음 상태(달만 있음)면 적던 내용이 없다', () => {
      expect(isStepDirty(startSteps(10), 10)).toBe(false)
      // 직접 적기를 눌렀을 뿐 아직 적지 않았다
      expect(isStepDirty(run({ kind: 'start-custom' }), 10)).toBe(false)
    })

    it('답한 것이 하나라도 있으면 적던 내용이 있다', () => {
      expect(isStepDirty(run({ kind: 'pick-item', choice: RENT }), 10)).toBe(true)
      expect(isStepDirty(run({ kind: 'change-month', month: 3 }), 10)).toBe(true)
      expect(isStepDirty(run({ kind: 'start-custom' }, { kind: 'type-custom-name', name: '꽃' }), 10)).toBe(true)
    })

    it('달을 바꿨다가 처음 달로 되돌리면 적던 내용이 없다', () => {
      expect(isStepDirty(run({ kind: 'change-month', month: 3 }, { kind: 'change-month', month: 10 }), 10)).toBe(false)
    })
  })
})
