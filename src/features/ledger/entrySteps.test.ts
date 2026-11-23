import { describe, expect, it } from 'vitest'
import type { FrequentChoice } from '../../domain/ledger'
import {
  answerRows,
  entryToSave,
  isStepDirty,
  offersFinish,
  quickDays,
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
    it('AC-3 처음에는 보던 달만 정해져 있고(날은 아직 없음) "며칠인가요?" 단계다. 날 숫자 칸은 빈칸, [다음] 은 "며칠인지 적어 주세요"', () => {
      expect(START.step).toBe('day')
      expect(START.draft).toEqual({ month: 10, day: undefined, type: undefined, name: '', amount: 0 })
      expect(START.dayText).toBe('')
      expect(answerRows(START)).toEqual([{ kind: 'date', month: 10, day: undefined }])
      expect(stepButton(START)).toEqual({ label: '다음', missing: '며칠인지 적어 주세요' })
    })

    it('날을 치면 숫자만 두 자리까지 칸에 남고, 날짜 줄은 [다음] 을 누르기 전까지 달만 보인다', () => {
      const state = run({ kind: 'type-day', text: '7일' })

      expect(state.dayText).toBe('7')
      expect(state.step).toBe('day')
      expect(answerRows(state)).toEqual([{ kind: 'date', month: 10, day: undefined }])
      expect(stepButton(state)).toEqual({ label: '다음', missing: undefined })
      expect(run({ kind: 'type-day', text: '123' }).dayText).toBe('12')
    })

    it('[다음] 을 누르면 날짜 줄이 "10월 7일" 이 되고 "무엇인가요?" 로 넘어간다', () => {
      const state = run({ kind: 'type-day', text: '7' }, { kind: 'submit-day' })

      expect(state.step).toBe('item')
      expect(state.draft.day).toBe(7)
      expect(answerRows(state)).toEqual([{ kind: 'date', month: 10, day: 7 }])
    })

    it.each([
      ['', '며칠인지 적어 주세요'],
      ['0', '10월은 31일까지 있어요'],
      ['32', '10월은 31일까지 있어요'],
    ])('"%s" 이면 [다음] 비활성 + "%s", 눌러도 넘어가지 않는다', (text, missing) => {
      const state = run({ kind: 'type-day', text })

      expect(stepButton(state)).toEqual({ label: '다음', missing })
      expect(stepReducer(state, { kind: 'submit-day' })).toBe(state)
    })

    it('그 달에 없는 날은 넘어가지 않는다: 2026년 2월 29·30일, 4월 31일 (윤년 2028년 2월 29일은 된다)', () => {
      const february = from(startSteps({ year: 2026, month: 2 }), { kind: 'type-day', text: '29' })
      expect(stepButton(february)).toEqual({ label: '다음', missing: '2월은 28일까지 있어요' })
      expect(stepReducer(february, { kind: 'submit-day' })).toBe(february)
      expect(stepReducer(february, { kind: 'pick-day', day: 30 })).toBe(february)
      expect(from(startSteps({ year: 2028, month: 2 }), { kind: 'type-day', text: '29' }, { kind: 'submit-day' }).draft.day).toBe(29)
      const april = from(startSteps({ year: 2026, month: 4 }), { kind: 'type-day', text: '31' })
      expect(stepButton(april)).toEqual({ label: '다음', missing: '4월은 30일까지 있어요' })
    })

    it('빠른 칩([오늘 7일]·[방금 5일])을 누르면 그 날로 정해지고 바로 "무엇인가요?" 로 넘어간다', () => {
      const state = run({ kind: 'pick-day', day: 5 })

      expect(state.step).toBe('item')
      expect(state.draft.day).toBe(5)
    })

    it('날을 정하기 전에는 저장할 내역이 아니다 (날짜는 꼭 적는다)', () => {
      expect(stepInput(START)).toEqual({ ok: false, missing: '며칠인지 적어 주세요' })
    })
  })

  describe('AC-24 빠른 칩', () => {
    const OCTOBER = { year: 2026, month: 10 }

    it('올해 장부의 이번 달이면 [오늘 N일]', () => {
      expect(quickDays(OCTOBER, { today: { month: 10, day: 7 } })).toEqual([{ kind: 'today', day: 7 }])
    })

    it('방금 저장한 내역이 같은 달이면 [방금 N일] (오늘 다음)', () => {
      expect(quickDays(OCTOBER, { today: { month: 10, day: 7 }, recent: { month: 10, day: 5 } })).toEqual([
        { kind: 'today', day: 7 },
        { kind: 'recent', day: 5 },
      ])
    })

    it('두 날이 같으면 [방금 N일] 하나만', () => {
      expect(quickDays(OCTOBER, { today: { month: 10, day: 7 }, recent: { month: 10, day: 7 } })).toEqual([{ kind: 'recent', day: 7 }])
    })

    it('다른 달이거나 날짜 없는 내역이면 칩이 없다', () => {
      expect(quickDays({ year: 2026, month: 9 }, { today: { month: 10, day: 7 }, recent: { month: 10, day: 5 } })).toEqual([])
      expect(quickDays(OCTOBER, { recent: { month: 10, day: undefined } })).toEqual([])
      expect(quickDays(OCTOBER, {})).toEqual([])
    })

    it('지금 달에 없는 날은 칩으로 내지 않는다', () => {
      expect(quickDays({ year: 2026, month: 2 }, { recent: { month: 2, day: 30 } })).toEqual([])
    })
  })

  describe('AC-21 [다 적었어요] 자리', () => {
    it('항목 고르기, 또는 날 숫자 칸이 빈 "며칠인가요?" 에서만 둘 수 있다 (날을 치면 [다음])', () => {
      expect(offersFinish(START)).toBe(true)
      expect(offersFinish(run({ kind: 'type-day', text: '3' }))).toBe(false)
      expect(offersFinish(afterDay())).toBe(true)
      expect(offersFinish(afterDay({ kind: 'pick-item', choice: RENT }))).toBe(false)
      expect(offersFinish(afterDay({ kind: 'start-custom' }))).toBe(false)
    })
  })

  describe('AC-25 날짜 바꾸기', () => {
    it('날짜 줄 [바꾸기] 를 누르면 "며칠인가요?" 로 돌아가고(칸에 지금 날) 항목·금액은 그대로, 날을 고쳐 [다음] 을 누르면 하던 질문으로 돌아온다', () => {
      const state = afterDay(
        { kind: 'pick-item', choice: RENT },
        { kind: 'change-amount', amount: 40_000 },
        { kind: 'revisit-day' },
      )

      expect(state.step).toBe('day')
      expect(state.dayText).toBe('7')
      expect(state.draft).toEqual({ month: 10, day: 7, type: 'expense', name: '대관료', amount: 40_000 })

      const changed = from(state, { kind: 'type-day', text: '9' }, { kind: 'submit-day' })
      expect(changed.step).toBe('amount')
      expect(changed.draft).toEqual({ month: 10, day: 9, type: 'expense', name: '대관료', amount: 40_000 })
    })

    it('직접 적기 중에 날짜를 바꾸러 가도 날을 정하면 적던 이름 칸으로 돌아온다', () => {
      const state = afterDay(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: '꽃' },
        { kind: 'revisit-day' },
        { kind: 'pick-day', day: 3 },
      )

      expect(state.step).toBe('custom-name')
      expect(state.customName).toBe('꽃')
    })

    it('"며칠인가요?" 에서 달을 바꿔도 그 달에 있는 날이면 칸과 날짜 줄에 그대로 둔다', () => {
      const state = afterDay({ kind: 'revisit-day' }, { kind: 'change-month', month: 11 })

      expect(state.step).toBe('day')
      expect(state.dayText).toBe('7')
      expect(answerRows(state)).toEqual([{ kind: 'date', month: 11, day: 7 }])
    })

    it('달을 바꿔 그 날이 그 달에 없으면(31일 → 2월) 칸과 날을 비우고 다시 묻는다', () => {
      const state = run({ kind: 'pick-day', day: 31 }, { kind: 'revisit-day' }, { kind: 'change-month', month: 2 })

      expect(state.step).toBe('day')
      expect(state.dayText).toBe('')
      expect(state.draft.day).toBeUndefined()
      expect(answerRows(state)).toEqual([{ kind: 'date', month: 2, day: undefined }])
    })

    it('[다음] 을 누르기 전 친 날도 바꾼 달에 없으면 비운다', () => {
      const state = run({ kind: 'type-day', text: '30' }, { kind: 'change-month', month: 2 })

      expect(state.dayText).toBe('')
    })

    it('2월 29일은 장부 연도가 윤년이면 달을 바꿔도 남는다', () => {
      const leap = from(startSteps({ year: 2028, month: 1 }), { kind: 'pick-day', day: 29 }, { kind: 'revisit-day' })

      const changed = stepReducer(leap, { kind: 'change-month', month: 2 })
      expect(changed.draft.day).toBe(29)
      expect(changed.dayText).toBe('29')
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
      // 항목 고르기처럼 누르면 바로 넘어가서 아래 [다음] 이 없다 (#111)
      expect(stepButton(state)).toBeNull()
      // 묻는 동안 항목 줄은 이름만 (종류는 지금 묻는 값이라 카드에 올리지 않는다)
      expect(answerRows(state)).toEqual([
        { kind: 'date', month: 10, day: 7 },
        { kind: 'item', name: '꽃값', type: undefined },
      ])
    })

    it('AC-4 이름을 적는 동안에는 항목 줄을 올리지 않는다 (고른 항목을 바꾸러 와 직접 적기로 가도)', () => {
      const state = afterDay({ kind: 'pick-item', choice: RENT }, { kind: 'revisit-item' }, { kind: 'start-custom' })

      expect(answerRows(state)).toEqual([{ kind: 'date', month: 10, day: 7 }])
    })

    it('AC-15 새 이름의 수입/지출을 고르면 [다음] 없이 바로 금액 단계로 가고, 카드 항목 줄에 종류가 붙는다 (#111)', () => {
      const state = afterDay(
        { kind: 'start-custom' },
        { kind: 'type-custom-name', name: '꽃값' },
        { kind: 'submit-custom-name', knownType: undefined },
        { kind: 'pick-type', entryType: 'expense' },
      )

      expect(state.step).toBe('amount')
      expect(state.draft).toMatchObject({ name: '꽃값', type: 'expense' })
      expect(answerRows(state)).toEqual([
        { kind: 'date', month: 10, day: 7 },
        { kind: 'item', name: '꽃값', type: 'expense' },
      ])
    })

    it('이름이 비어 있으면 수입/지출을 골라도 넘어가지 않는다 (#111)', () => {
      const naming = afterDay({ kind: 'start-custom' })

      expect(stepReducer(naming, { kind: 'pick-type', entryType: 'income' })).toBe(naming)
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

    it('날 숫자 칸에 글자만 쳐도 적던 내용이 있다 ([다음] 을 누르기 전, 없는 날이어도)', () => {
      expect(isStepDirty(run({ kind: 'type-day', text: '3' }), 10)).toBe(true)
      expect(isStepDirty(run({ kind: 'type-day', text: '45' }), 10)).toBe(true)
      expect(isStepDirty(run({ kind: 'type-day', text: '3' }, { kind: 'type-day', text: '' }), 10)).toBe(false)
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

describe('SPEC-010 회비 적기 단계 (3절)', () => {
  // 명단이 있는 동아리 장부, 2026년 월 회비 20,000원
  const DUES_START = startSteps({ year: 2026, month: 10, dues: { fee: 20_000 } })
  const DUES: FrequentChoice = { name: '회비', type: 'income' }

  function dues(...actions: StepAction[]): StepState {
    return from(DUES_START, { kind: 'pick-day', day: 17 }, ...actions)
  }

  // 회비를 골라 "누가 냈어요?" 에서 네 분을 고른 상태
  const FOUR: StepAction[] = [{ kind: 'pick-item', choice: DUES }, { kind: 'pick-payers', memberIds: ['m1', 'm2', 'm3', 'm4'] }]

  describe('AC-10 "누가 냈어요?" 를 묻는 조건', () => {
    it.each<[string, FrequentChoice]>([
      ['수입 "회비"', DUES],
      ['수입 "회비(14인)"', { name: '회비(14인)', type: 'income' }],
    ])('명단이 있는 장부에서 %s 를 고르면 "누가 냈어요?" 단계로 간다', (_label, choice) => {
      expect(dues({ kind: 'pick-item', choice }).step).toBe('payers')
    })

    it('직접 적은 이름이 회비 기록이어도 묻는다 (예전에 쓴 이름·처음 쓰는 이름의 수입)', () => {
      expect(dues({ kind: 'start-custom' }, { kind: 'type-custom-name', name: '회비(5월분)' }, { kind: 'submit-custom-name', knownType: 'income' }).step).toBe('payers')
      expect(
        dues({ kind: 'start-custom' }, { kind: 'type-custom-name', name: '회비 추가' }, { kind: 'submit-custom-name', knownType: undefined }, { kind: 'pick-type', entryType: 'income' })
          .step,
      ).toBe('payers')
    })

    it.each<[string, StepState]>([
      ['지출 "회비"', dues({ kind: 'pick-item', choice: { name: '회비', type: 'expense' } })],
      ['수입 "찬조금"', dues({ kind: 'pick-item', choice: { name: '찬조금', type: 'income' } })],
      ['명단이 빈 장부·개인 가계부 (dues 없음)', run({ kind: 'pick-day', day: 7 }, { kind: 'pick-item', choice: DUES })],
    ])('묻지 않고 바로 "얼마인가요?" 로 간다: %s', (_label, state) => {
      expect(state.step).toBe('amount')
      expect(answerRows(state).map((row) => row.kind)).toEqual(['date', 'item'])
    })
  })

  describe('AC-11 고르기와 금액 채우기', () => {
    it('아무도 안 고르면 [다음] 이 비활성이고 "누가 냈는지 골라 주세요"', () => {
      const state = dues({ kind: 'pick-item', choice: DUES })

      expect(stepButton(state)).toEqual({ label: '다음', missing: '누가 냈는지 골라 주세요' })
      expect(stepReducer(state, { kind: 'submit-payers' })).toBe(state)
    })

    it('고르면 아래 안내가 "N명 · M원 (한 분 F원)" 이다', () => {
      expect(stepButton(dues(...FOUR))).toEqual({ label: '다음', missing: undefined, note: '4명 · 80,000원 (한 분 20,000원)' })
    })

    it('월 회비가 없으면 안내는 금액 없이 "N명" 이고 [다음] 뒤 금액은 빈칸이다', () => {
      const state = from(startSteps({ year: 2026, month: 10, dues: { fee: undefined } }), { kind: 'pick-day', day: 17 }, ...FOUR)

      expect(stepButton(state)?.note).toBe('4명')
      expect(stepReducer(state, { kind: 'submit-payers' }).draft.amount).toBe(0)
    })

    it('체크를 누를 때마다 고르고 풀고, 빠른 고르기는 그 분들로 바꾼다', () => {
      const state = dues(
        { kind: 'pick-item', choice: DUES },
        { kind: 'toggle-payer', memberId: 'm1' },
        { kind: 'toggle-payer', memberId: 'm2' },
        { kind: 'toggle-payer', memberId: 'm1' },
      )
      expect(state.payers.memberIds).toEqual(['m2'])
      expect(stepReducer(state, { kind: 'pick-payers', memberIds: ['m3', 'm4'] }).payers.memberIds).toEqual(['m3', 'm4'])
    })

    it('[다음] 을 누르면 금액이 고른 사람 수 × 월 회비로 채워지고, 카드에 낸 분 줄이 생긴다', () => {
      const state = dues(...FOUR, { kind: 'submit-payers' })

      expect(state.step).toBe('amount')
      expect(state.draft.amount).toBe(80_000)
      expect(answerRows(state)).toEqual([
        { kind: 'date', month: 10, day: 17 },
        { kind: 'item', name: '회비', type: 'income' },
        { kind: 'payers', memberIds: ['m1', 'm2', 'm3', 'm4'], nameless: false },
      ])
    })

    it('사람 수로 나눠떨어지는 금액이면 똑같이 나눠 저장한다', () => {
      const state = dues(...FOUR, { kind: 'submit-payers' }, { kind: 'change-amount', amount: 100_000 })

      expect(entryToSave(state)).toEqual({
        kind: 'save',
        input: {
          month: 10,
          day: 17,
          type: 'income',
          name: '회비',
          amount: 100_000,
          payers: ['m1', 'm2', 'm3', 'm4'].map((memberId) => ({ memberId, amount: 25_000 })),
        },
      })
    })

    it('낸 분 줄 [바꾸기] 로 돌아가면 고른 분이 그대로 체크돼 있다', () => {
      const state = dues(...FOUR, { kind: 'submit-payers' }, { kind: 'revisit-payers' })

      expect(state.step).toBe('payers')
      expect(state.payers.memberIds).toEqual(['m1', 'm2', 'm3', 'm4'])
      expect(answerRows(state).map((row) => row.kind)).toEqual(['date', 'item'])
    })
  })

  describe('AC-12 한 분씩 금액', () => {
    it('금액이 사람 수로 안 나눠떨어지면 [저장] 은 저장하지 않고 "한 분씩 금액" 으로 보낸다', () => {
      const state = dues(...FOUR, { kind: 'submit-payers' }, { kind: 'change-amount', amount: 90_001 })

      expect(stepButton(state)).toEqual({ label: '저장', missing: undefined })
      expect(entryToSave(state)).toEqual({ kind: 'shares' })
    })

    it('"한 분씩 금액" 에서 정한 몫의 합이 기록 금액이 되고 그 몫으로 저장한다', () => {
      const shares = [...['m1', 'm2', 'm3'].map((memberId) => ({ memberId, amount: 20_000 })), { memberId: 'm4', amount: 120_000 }]
      const state = dues(...FOUR, { kind: 'submit-payers' }, { kind: 'change-amount', amount: 90_001 }, { kind: 'set-shares', shares })

      expect(state.step).toBe('amount')
      expect(state.draft.amount).toBe(180_000)
      const save = entryToSave(state)
      expect(save.kind === 'save' && save.input.payers).toEqual(shares)
    })
  })

  describe('AC-13 이름 없이 적기', () => {
    it('[이름 없이 적기] 는 금액을 채우지 않고 "얼마인가요?" 로 가고, 낸 분 없이 저장한다', () => {
      const state = dues({ kind: 'pick-item', choice: DUES }, { kind: 'toggle-payer', memberId: 'm1' }, { kind: 'skip-payers' })

      expect(state.step).toBe('amount')
      expect(state.draft.amount).toBe(0)
      expect(answerRows(state).at(-1)).toEqual({ kind: 'payers', memberIds: [], nameless: true })
      const save = entryToSave(stepReducer(state, { kind: 'change-amount', amount: 30_000 }))
      expect(save.kind === 'save' && save.input).not.toHaveProperty('payers')
    })
  })

  it('항목을 회비가 아닌 것으로 바꾸면 고른 분을 버리고 낸 분 없이 저장한다 (금액 유지)', () => {
    const state = dues(...FOUR, { kind: 'submit-payers' }, { kind: 'revisit-item' }, { kind: 'pick-item', choice: RENT })

    expect(state.step).toBe('amount')
    expect(state.draft.amount).toBe(80_000)
    expect(state.payers.memberIds).toEqual([])
    const save = entryToSave(state)
    expect(save.kind === 'save' && save.input).not.toHaveProperty('payers')
  })

  describe('AC-16 항목 줄 [바꾸기] 는 금액 유지 — 회비 항목끼리 바꿀 때', () => {
    const DUES_14: FrequentChoice = { name: '회비(14인)', type: 'income' }
    const shares = [...['m1', 'm2', 'm3'].map((memberId) => ({ memberId, amount: 20_000 })), { memberId: 'm4', amount: 120_000 }]

    it('낸 분·한 분씩 금액·금액을 그대로 두고 바로 "얼마인가요?" 로 간다', () => {
      const before = dues(...FOUR, { kind: 'submit-payers' }, { kind: 'set-shares', shares })
      const state = stepReducer(stepReducer(before, { kind: 'revisit-item' }), { kind: 'pick-item', choice: DUES_14 })

      expect(state.step).toBe('amount')
      expect(state.draft).toMatchObject({ name: '회비(14인)', amount: 180_000 })
      expect(state.payers).toEqual(before.payers)
      const save = entryToSave(state)
      expect(save.kind === 'save' && save.input.payers).toEqual(shares)
    })

    it('손으로 고친 금액도 그대로이고, [이름 없이 적기] 로 답했으면 이름 없이 그대로다', () => {
      const typed = dues(...FOUR, { kind: 'submit-payers' }, { kind: 'change-amount', amount: 100_000 }, { kind: 'revisit-item' }, { kind: 'pick-item', choice: DUES_14 })
      expect(typed.draft.amount).toBe(100_000)

      const nameless = dues({ kind: 'pick-item', choice: DUES }, { kind: 'skip-payers' }, { kind: 'change-amount', amount: 30_000 }, { kind: 'revisit-item' }, { kind: 'pick-item', choice: DUES_14 })
      expect(nameless.step).toBe('amount')
      expect(nameless.draft.amount).toBe(30_000)
      expect(answerRows(nameless).at(-1)).toEqual({ kind: 'payers', memberIds: [], nameless: true })
    })

    it('아직 답하지 않았으면(누가 냈어요? 에서 항목 바꾸기) 다시 "누가 냈어요?" 로', () => {
      const state = dues({ kind: 'pick-item', choice: DUES }, { kind: 'toggle-payer', memberId: 'm1' }, { kind: 'revisit-item' }, { kind: 'pick-item', choice: DUES_14 })

      expect(state.step).toBe('payers')
      expect(state.payers.memberIds).toEqual(['m1'])
    })
  })

  describe('월 회비 × 사람 수가 상한(999,999,999원)을 넘을 때', () => {
    const big = () => from(startSteps({ year: 2026, month: 10, dues: { fee: 300_000_000 } }), { kind: 'pick-day', day: 17 }, ...FOUR)

    it('안내에 합계를 쓰지 않고, [다음] 은 금액을 채우지 않는다', () => {
      expect(stepButton(big())?.note).toBe('4명 (한 분 300,000,000원)')
      expect(stepReducer(big(), { kind: 'submit-payers' }).draft.amount).toBe(0)
    })
  })

  it('"누가 냈어요?" 에서 날짜 줄 [바꾸기] 로 갔다 오면 다시 "누가 냈어요?" 로 돌아온다', () => {
    const state = dues(...FOUR, { kind: 'revisit-day' }, { kind: 'pick-day', day: 18 })

    expect(state.step).toBe('payers')
    expect(state.payers.memberIds).toHaveLength(4)
  })
})
