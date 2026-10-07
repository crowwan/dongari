import { describe, expect, it } from 'vitest'
import type { FrequentChoice } from '../../domain/ledger'
import {
  answerRows,
  isStepDirty,
  startSteps,
  stepButton,
  stepInput,
  stepReducer,
  type StepAction,
  type StepState,
} from './entrySteps'

// 2026년 10월 장부에서 시작한다
const START = startSteps({ year: 2026, month: 10 })

// 처음 상태에서 동작을 차례로 적용한다
function from(start: StepState, ...actions: StepAction[]): StepState {
  return actions.reduce(stepReducer, start)
}

function run(...actions: StepAction[]): StepState {
  return from(START, ...actions)
}

// 날을 고른 뒤("무엇인가요?")부터 동작을 적용한다
function afterDay(...actions: StepAction[]): StepState {
  return run({ kind: 'pick-day', day: 7 }, ...actions)
}

const RENT: FrequentChoice = { name: '대관료', type: 'expense' }

describe('SPEC-001 하나씩 채우기 단계', () => {
  describe('AC-24 며칠인가요? (0단계)', () => {
    it('AC-3 처음에는 보던 달만 정해져 있고(날은 아직 없음) "며칠인가요?" 단계다. 버튼은 없다', () => {
      expect(START.step).toBe('day')
      expect(START.draft).toEqual({ month: 10, day: undefined, type: undefined, name: '', amount: 0 })
      expect(answerRows(START)).toEqual([{ kind: 'date', month: 10, day: undefined }])
      expect(stepButton(START)).toBeNull()
    })

    it('날을 고르면 날짜 줄이 "10월 7일" 이 되고 "무엇인가요?" 로 넘어간다', () => {
      const state = run({ kind: 'pick-day', day: 7 })

      expect(state.step).toBe('item')
      expect(state.draft.day).toBe(7)
      expect(answerRows(state)).toEqual([{ kind: 'date', month: 10, day: 7 }])
    })

    it('그 달에 없는 날은 고를 수 없다 (2026년 2월 29일, 4월 31일)', () => {
      const february = startSteps({ year: 2026, month: 2 })
      expect(stepReducer(february, { kind: 'pick-day', day: 29 })).toBe(february)
      expect(from(startSteps({ year: 2028, month: 2 }), { kind: 'pick-day', day: 29 }).draft.day).toBe(29)
      const april = startSteps({ year: 2026, month: 4 })
      expect(stepReducer(april, { kind: 'pick-day', day: 31 })).toBe(april)
    })

    it('날을 고르기 전에는 저장할 내역이 아니다 (날짜는 꼭 적는다)', () => {
      expect(stepInput(START)).toEqual({ ok: false, missing: '며칠인지 골라 주세요' })
    })
  })

  describe('AC-25 날짜 바꾸기', () => {
    it('날짜 줄 [바꾸기] 를 누르면 "며칠인가요?" 로 돌아가고 항목·금액은 그대로, 날을 다시 고르면 하던 질문으로 돌아온다', () => {
      const state = afterDay(
        { kind: 'pick-item', choice: RENT },
        { kind: 'change-amount', amount: 40_000 },
        { kind: 'revisit-day' },
      )

      expect(state.step).toBe('day')
      expect(state.draft).toEqual({ month: 10, day: 7, type: 'expense', name: '대관료', amount: 40_000 })

      const changed = stepReducer(state, { kind: 'pick-day', day: 9 })
      expect(changed.step).toBe('amount')
      expect(changed.draft).toEqual({ month: 10, day: 9, type: 'expense', name: '대관료', amount: 40_000 })
    })

    it('직접 적기 중에 날짜를 바꾸러 가도 날을 고르면 적던 이름 칸으로 돌아온다', () => {
      const state = afterDay(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: '꽃' },
        { kind: 'revisit-day' },
        { kind: 'pick-day', day: 3 },
      )

      expect(state.step).toBe('custom-name')
      expect(state.customName).toBe('꽃')
    })

    it('"며칠인가요?" 에서 달을 바꾸면 그 달의 날 격자로, 고른 날이 그 달에도 있으면 그대로 둔다', () => {
      const state = afterDay({ kind: 'revisit-day' }, { kind: 'change-month', month: 11 })

      expect(state.step).toBe('day')
      expect(answerRows(state)).toEqual([{ kind: 'date', month: 11, day: 7 }])
    })

    it('달을 바꿔 고른 날이 그 달에 없으면(31일 → 2월) 날을 비우고 다시 묻는다', () => {
      const state = run({ kind: 'pick-day', day: 31 }, { kind: 'revisit-day' }, { kind: 'change-month', month: 2 })

      expect(state.step).toBe('day')
      expect(state.draft.day).toBeUndefined()
      expect(answerRows(state)).toEqual([{ kind: 'date', month: 2, day: undefined }])
    })

    it('2월 29일은 장부 연도가 윤년이면 달을 바꿔도 남는다', () => {
      const leap = from(startSteps({ year: 2028, month: 1 }), { kind: 'pick-day', day: 29 }, { kind: 'revisit-day' })

      expect(stepReducer(leap, { kind: 'change-month', month: 2 }).draft.day).toBe(29)
    })
  })

  it('AC-4 항목을 고르면 이름과 그 항목의 종류가 정해지고 금액 단계로 넘어간다', () => {
    const state = afterDay({ kind: 'pick-item', choice: RENT })

    expect(state.step).toBe('amount')
    expect(state.draft).toMatchObject({ name: '대관료', type: 'expense' })
    // "지금 적는 내역" 카드: 달 줄 + 항목 줄(이름과 종류를 한 줄에)
    expect(answerRows(state)).toEqual([
      { kind: 'date', month: 10, day: 7 },
      { kind: 'item', name: '대관료', type: 'expense' },
    ])
  })

  describe('직접 적기', () => {
    it('[직접 적기] 를 누르면 이름 적기 단계이고, 이름이 비면 [다음] 을 누를 수 없다', () => {
      const state = afterDay({ kind: 'start-custom' }, { kind: 'type-custom-name', name: '   ' })

      expect(state.step).toBe('custom-name')
      expect(stepButton(state)).toEqual({ label: '다음', missing: '무엇인지 적어 주세요' })
      expect(stepReducer(state, { kind: 'submit-custom-name', knownType: undefined })).toBe(state)
    })

    it('AC-15 처음 쓰는 이름이면 이름만 정하고 "수입인가요, 지출인가요?" 단계로 간다 (종류 기본값 없음)', () => {
      const state = afterDay(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: ' 꽃값 ' },
        { kind: 'submit-custom-name', knownType: undefined },
      )

      expect(state.step).toBe('custom-type')
      expect(state.draft).toMatchObject({ name: '꽃값', type: undefined })
      expect(stepButton(state)).toEqual({ label: '다음', missing: '수입인지 지출인지 골라 주세요' })
      // 묻는 동안 항목 줄은 이름만 (종류는 지금 묻는 값이라 카드에 올리지 않는다)
      expect(answerRows(state)).toEqual([
        { kind: 'date', month: 10, day: 7 },
        { kind: 'item', name: '꽃값', type: undefined },
      ])
    })

    it('AC-4 새 이름의 종류를 골라도 [다음] 을 누르기 전에는 카드 항목 줄에 종류를 올리지 않는다', () => {
      const state = afterDay(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: '꽃값' },
        { kind: 'submit-custom-name', knownType: undefined },
        { kind: 'pick-type', entryType: 'expense' },
      )

      expect(answerRows(state)).toEqual([
        { kind: 'date', month: 10, day: 7 },
        { kind: 'item', name: '꽃값', type: undefined },
      ])
      expect(answerRows(stepReducer(state, { kind: 'submit-type' }))).toEqual([
        { kind: 'date', month: 10, day: 7 },
        { kind: 'item', name: '꽃값', type: 'expense' },
      ])
    })

    it('AC-4 이름을 적는 동안에는 항목 줄을 올리지 않는다 (고른 항목을 바꾸러 와 직접 적기로 가도)', () => {
      const state = afterDay({ kind: 'pick-item', choice: RENT }, { kind: 'revisit-item' }, { kind: 'start-custom' })

      expect(answerRows(state)).toEqual([{ kind: 'date', month: 10, day: 7 }])
    })

    it('AC-15 새 이름의 종류를 고르고 [다음] 을 누르면 금액 단계로 간다', () => {
      const asking = afterDay(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: '꽃값' },
        { kind: 'submit-custom-name', knownType: undefined },
      )
      expect(stepReducer(asking, { kind: 'submit-type' })).toBe(asking)

      const state = afterDay(
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
      const state = afterDay(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: '찬조금' },
        { kind: 'submit-custom-name', knownType: 'income' },
      )

      expect(state.step).toBe('amount')
      expect(state.draft).toMatchObject({ name: '찬조금', type: 'income' })
    })

    it('적던 이름에서 목록으로 돌아갈 수 있다', () => {
      const state = afterDay({ kind: 'start-custom' }, { kind: 'revisit-item' })

      expect(state.step).toBe('item')
      expect(stepButton(state)).toBeNull()
    })
  })

  describe('AC-5 금액', () => {
    it('금액이 0 이면 [저장] 을 누를 수 없고 "얼마인지 적어 주세요"', () => {
      const state = afterDay({ kind: 'pick-item', choice: RENT })

      expect(stepButton(state)).toEqual({ label: '저장', missing: '얼마인지 적어 주세요' })
    })

    it('금액을 적으면 [저장] 을 누를 수 있다', () => {
      const state = afterDay({ kind: 'pick-item', choice: RENT }, { kind: 'change-amount', amount: 40_000 })

      expect(stepButton(state)).toEqual({ label: '저장', missing: undefined })
      expect(stepInput(state)).toEqual({ ok: true, input: { month: 10, day: 7, type: 'expense', name: '대관료', amount: 40_000 } })
    })
  })

  describe('AC-16 항목 줄 [바꾸기]', () => {
    it('항목 줄 [바꾸기] 를 누르면 항목 고르기로 돌아가고 금액은 그대로다', () => {
      const state = afterDay(
        { kind: 'pick-item', choice: RENT },
        { kind: 'change-amount', amount: 40_000 },
        { kind: 'revisit-item' },
      )

      expect(state.step).toBe('item')
      expect(state.draft.amount).toBe(40_000)

      const changed = stepReducer(state, { kind: 'pick-item', choice: { name: '회비', type: 'income' } })
      expect(changed.step).toBe('amount')
      expect(changed.draft).toEqual({ month: 10, day: 7, type: 'income', name: '회비', amount: 40_000 })
    })
  })

  describe('버릴까요 (적던 내용)', () => {
    it('처음 상태(달만 있음)면 적던 내용이 없다', () => {
      expect(isStepDirty(START, 10)).toBe(false)
    })

    it('날만 골라도 적던 내용이 있다 (연달아 적기에서 다음 내역의 날을 고른 뒤 나가면 묻는다)', () => {
      expect(isStepDirty(run({ kind: 'pick-day', day: 7 }), 10)).toBe(true)
    })

    it('답한 것이 하나라도 있으면 적던 내용이 있다', () => {
      expect(isStepDirty(afterDay({ kind: 'pick-item', choice: RENT }), 10)).toBe(true)
      expect(isStepDirty(run({ kind: 'change-month', month: 3 }), 10)).toBe(true)
      // 직접 적기 칸에 글자만 적었어도
      expect(isStepDirty({ ...START, customName: '꽃' }, 10)).toBe(true)
    })

    it('달을 바꿨다가 처음 달로 되돌리면 적던 내용이 없다', () => {
      expect(isStepDirty(run({ kind: 'change-month', month: 3 }, { kind: 'change-month', month: 10 }), 10)).toBe(false)
    })
  })
})
