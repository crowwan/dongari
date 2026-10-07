import { describe, expect, it } from 'vitest'
import {
  addEntry,
  calculateTotals,
  createLedger,
  deleteEntry,
  FREQUENT_CHOICES_LIMIT,
  frequentChoices,
  firstVisibleMonth,
  InvalidLedgerInputError,
  lastUsedType,
  monthGroup,
  newLedgerDefaults,
  updateEntry,
  updateLedgerInfo,
  type EntryInput,
} from './ledger'
import type { Entry, Ledger } from './types'

const NOW = new Date('2026-10-03T09:00:00.000Z')

function entry(overrides: Partial<Entry> & Pick<Entry, 'id'>): Entry {
  return {
    month: 1,
    type: 'expense',
    name: '간식비',
    amount: 10_000,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function ledger(overrides: Partial<Ledger> = {}): Ledger {
  return { year: 2026, clubName: '꽃동산 동아리', carryover: 100_000, entries: [], ...overrides }
}

// id·시각을 고정해 결과를 예측할 수 있게 한다
function fixedDeps(ids: string[] = ['new-1', 'new-2', 'new-3']) {
  const queue = [...ids]
  return {
    createId: () => queue.shift() ?? 'exhausted',
    now: () => NOW,
  }
}

const expenseInput: EntryInput = { month: 10, day: 7, type: 'expense', name: '대관료', amount: 40_000 }

describe('SPEC-001 장부 계산', () => {
  describe('잔액', () => {
    it('잔액 = 이월금 + 수입 합 − 지출 합 이다', () => {
      const target = ledger({
        carryover: 100_000,
        entries: [
          entry({ id: 'a', type: 'income', name: '회비', amount: 150_000 }),
          entry({ id: 'b', type: 'expense', amount: 40_000 }),
          entry({ id: 'c', type: 'expense', amount: 28_340 }),
        ],
      })

      expect(calculateTotals(target)).toEqual({ income: 150_000, expense: 68_340, balance: 181_660 })
    })

    it('기록이 없으면 잔액은 이월금이다 (적자 이월금 포함)', () => {
      expect(calculateTotals(ledger({ carryover: -5_000 }))).toEqual({ income: 0, expense: 0, balance: -5_000 })
    })

    it('AC-2 기록을 추가하면 잔액이 다시 계산된다', () => {
      const next = addEntry(ledger({ carryover: 100_000 }), expenseInput, fixedDeps())

      expect(calculateTotals(next).balance).toBe(60_000)
    })

    it('AC-2 기록을 수정하면 잔액이 다시 계산된다', () => {
      const before = ledger({ carryover: 100_000, entries: [entry({ id: 'a', amount: 40_000 })] })

      const next = updateEntry(before, 'a', { month: 1, type: 'expense', name: '간식비', amount: 25_000 })

      expect(calculateTotals(next).balance).toBe(75_000)
    })

    it('AC-2 기록을 지우면 잔액이 다시 계산된다', () => {
      const before = ledger({ carryover: 100_000, entries: [entry({ id: 'a', amount: 40_000 })] })

      expect(calculateTotals(deleteEntry(before, 'a')).balance).toBe(100_000)
    })
  })

  describe('한 달 보기', () => {
    it('AC-9 그 달의 수입·지출 소계와 기록을 날짜순으로 모은다 (같은 날은 적은 순, 날짜 없는 예전 기록은 맨 뒤)', () => {
      const entries = [
        entry({ id: 'old', month: 10, createdAt: '2026-10-01T00:00:00.000Z' }),
        entry({ id: '7th-late', month: 10, day: 7, createdAt: '2026-10-09T00:00:00.000Z' }),
        entry({ id: '3rd', month: 10, day: 3, createdAt: '2026-10-08T00:00:00.000Z' }),
        entry({ id: '7th-early', month: 10, day: 7, createdAt: '2026-10-02T00:00:00.000Z' }),
      ]

      expect(monthGroup(entries, 10).entries.map((item) => item.id)).toEqual(['3rd', '7th-early', '7th-late', 'old'])
    })

    it('AC-9 그 달의 수입·지출 소계와 기록을 모은다 (날짜 없는 예전 기록끼리는 적은 순)', () => {
      const entries = [
        entry({ id: 'sep-income', month: 9, type: 'income', name: '회비', amount: 140_806 }),
        entry({ id: 'oct-rent', month: 10, name: '대관료', amount: 40_000 }),
        entry({ id: 'sep-snack', month: 9, name: '간식비', amount: 6_000 }),
        entry({ id: 'oct-snack', month: 10, name: '간식비', amount: 28_340 }),
      ]

      const october = monthGroup(entries, 10)
      expect(october).toMatchObject({ month: 10, income: 0, expense: 68_340 })
      expect(october.entries.map((item) => item.id)).toEqual(['oct-rent', 'oct-snack'])
      const september = monthGroup(entries, 9)
      expect(september).toMatchObject({ month: 9, income: 140_806, expense: 6_000 })
      expect(september.entries.map((item) => item.id)).toEqual(['sep-income', 'sep-snack'])
    })

    it('그 달 기록이 없으면 소계 0, 빈 목록이다', () => {
      expect(monthGroup([entry({ id: 'a', month: 3 })], 4)).toEqual({ month: 4, income: 0, expense: 0, entries: [] })
    })

    it('AC-3 처음 보이는 달은 올해 장부면 이번 달이다', () => {
      expect(firstVisibleMonth(2026, new Date(2026, 9, 3))).toBe(10)
      expect(firstVisibleMonth(2026, new Date(2026, 0, 1))).toBe(1)
    })

    it('처음 보이는 달은 지난 연도 장부면 12월이다', () => {
      expect(firstVisibleMonth(2025, new Date(2026, 9, 3))).toBe(12)
    })
  })

  describe('기록 추가·수정·삭제', () => {
    it('추가하면 주입한 id·시각으로 맨 뒤에 붙고 원래 장부는 바뀌지 않는다', () => {
      const before = ledger({ entries: [entry({ id: 'a' })] })

      const next = addEntry(before, { ...expenseInput, name: '  대관료 ' }, fixedDeps(['new-1']))

      expect(next.entries).toHaveLength(2)
      expect(next.entries[1]).toEqual({
        id: 'new-1',
        month: 10,
        day: 7,
        type: 'expense',
        name: '대관료',
        amount: 40_000,
        createdAt: NOW.toISOString(),
      })
      expect(before.entries).toHaveLength(1)
    })

    it('묶음 id 를 함께 넣으면 기록에 남는다', () => {
      const next = addEntry(ledger(), { ...expenseInput, batchId: 'photo-1' }, fixedDeps())

      expect(next.entries[0].batchId).toBe('photo-1')
    })

    it('수정해도 사진으로 함께 넣은 묶음(batchId)은 그대로 둔다', () => {
      const before = ledger({ entries: [entry({ id: 'a', batchId: 'photo-1' })] })

      const next = updateEntry(before, 'a', { month: 3, type: 'income', name: '회비', amount: 50_000 })

      expect(next.entries[0].batchId).toBe('photo-1')
    })

    it('수정하면 id·입력 시각·순서는 그대로 두고 내용만 바꾼다', () => {
      const before = ledger({
        entries: [entry({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }), entry({ id: 'b' })],
      })

      const next = updateEntry(before, 'a', { month: 3, type: 'income', name: '회비', amount: 50_000 })

      expect(next.entries.map((item) => item.id)).toEqual(['a', 'b'])
      expect(next.entries[0]).toEqual({
        id: 'a',
        month: 3,
        type: 'income',
        name: '회비',
        amount: 50_000,
        createdAt: '2026-01-01T00:00:00.000Z',
      })
      expect(before.entries[0].amount).toBe(10_000)
    })

    it('지우면 그 기록만 빠지고 원래 장부는 바뀌지 않는다', () => {
      const before = ledger({ entries: [entry({ id: 'a' }), entry({ id: 'b' })] })

      const next = deleteEntry(before, 'a')

      expect(next.entries.map((item) => item.id)).toEqual(['b'])
      expect(before.entries).toHaveLength(2)
    })

    it('없는 id 를 수정·삭제하면 장부가 그대로다', () => {
      const before = ledger({ entries: [entry({ id: 'a' })] })

      expect(updateEntry(before, 'zzz', expenseInput)).toEqual(before)
      expect(deleteEntry(before, 'zzz')).toEqual(before)
    })

    it.each<[string, EntryInput]>([
      ['금액 0', { ...expenseInput, amount: 0 }],
      ['금액 음수', { ...expenseInput, amount: -1 }],
      ['금액 소수', { ...expenseInput, amount: 1.5 }],
      ['금액 상한 초과', { ...expenseInput, amount: 1_000_000_000 }],
      ['이름 빈칸', { ...expenseInput, name: '   ' }],
      ['월 0', { ...expenseInput, month: 0 }],
      ['월 13', { ...expenseInput, month: 13 }],
      ['날 0', { ...expenseInput, day: 0 }],
      ['날 32', { ...expenseInput, day: 32 }],
      ['날 소수', { ...expenseInput, day: 1.5 }],
      ['그 달에 없는 날 (4월 31일)', { ...expenseInput, month: 4, day: 31 }],
      ['윤년이 아닌 해 2월 29일', { ...expenseInput, month: 2, day: 29 }],
    ])('%s 이면 저장할 수 없는 기록이라 거부한다', (_label, input) => {
      expect(() => addEntry(ledger(), input, fixedDeps())).toThrow(InvalidLedgerInputError)
      expect(() => updateEntry(ledger({ entries: [entry({ id: 'a' })] }), 'a', input)).toThrow(InvalidLedgerInputError)
    })

    it('AC-24 새로 적는 내역은 날짜(일)가 꼭 있어야 한다', () => {
      const withoutDay: EntryInput = { month: 10, type: 'expense', name: '대관료', amount: 40_000 }

      expect(() => addEntry(ledger(), withoutDay, fixedDeps())).toThrow(InvalidLedgerInputError)
    })

    it('AC-24 2월 마지막 날은 장부 연도의 윤년을 따른다', () => {
      const leap = addEntry(ledger({ year: 2028 }), { ...expenseInput, month: 2, day: 29 }, fixedDeps())

      expect(leap.entries[0]).toMatchObject({ month: 2, day: 29 })
      expect(() => addEntry(ledger({ year: 2026 }), { ...expenseInput, month: 2, day: 29 }, fixedDeps())).toThrow(
        InvalidLedgerInputError,
      )
    })

    it('AC-25 날짜 없는 예전 기록은 날짜 없이 그대로 고쳐 저장할 수 있다', () => {
      const before = ledger({ entries: [entry({ id: 'a', month: 3 })] })

      const next = updateEntry(before, 'a', { month: 3, type: 'expense', name: '간식비', amount: 5_000 })

      expect(next.entries[0]).not.toHaveProperty('day')
      expect(next.entries[0].amount).toBe(5_000)
    })

    it('AC-25 고치기에서 날짜를 바꾸면 그 날짜로 저장된다 (예전 기록에 날짜를 붙여도 된다)', () => {
      const before = ledger({ entries: [entry({ id: 'a', month: 3 }), entry({ id: 'b', month: 3, day: 5 })] })

      const next = updateEntry(updateEntry(before, 'a', { ...expenseInput, month: 3, day: 9 }), 'b', { ...expenseInput, month: 4, day: 30 })

      expect(next.entries.map(({ month, day }) => ({ month, day }))).toEqual([
        { month: 3, day: 9 },
        { month: 4, day: 30 },
      ])
    })

    it('금액 상한 999,999,999원은 허용한다', () => {
      const next = addEntry(ledger(), { ...expenseInput, amount: 999_999_999 }, fixedDeps())

      expect(next.entries[0].amount).toBe(999_999_999)
    })
  })

  describe('자주 쓴 항목', () => {
    // 이름만 뽑아 보기 쉽게
    const names = (choices: { name: string }[]) => choices.map((choice) => choice.name)

    describe('종류를 고른 뒤', () => {
      it('AC-4 같은 종류로 쓴 이름이 최근 사용 순, 중복 없이 나온다', () => {
        const entries = [
          entry({ id: '1', type: 'expense', name: '대관료' }),
          entry({ id: '2', type: 'income', name: '회비' }),
          entry({ id: '3', type: 'expense', name: '꽃값' }),
          entry({ id: '4', type: 'expense', name: '대관료' }),
        ]

        expect(names(frequentChoices(entries, 'expense')).slice(0, 2)).toEqual(['대관료', '꽃값'])
        expect(names(frequentChoices(entries, 'income'))[0]).toBe('회비')
      })

      it('고른 종류의 항목만, 그 종류로 나온다', () => {
        const entries = [entry({ id: '1', type: 'income', name: '찬조금' }), entry({ id: '2', type: 'expense', name: '꽃값' })]

        expect(frequentChoices(entries, 'income')).toEqual([
          { name: '찬조금', type: 'income' },
          { name: '회비', type: 'income' },
        ])
      })

      it('기록이 없으면 기본 항목(지출: 대관료·간식비 / 수입: 회비)을 보여준다', () => {
        expect(frequentChoices([], 'expense')).toEqual([
          { name: '대관료', type: 'expense' },
          { name: '간식비', type: 'expense' },
        ])
        expect(frequentChoices([], 'income')).toEqual([{ name: '회비', type: 'income' }])
      })

      it('쓴 이름 뒤에 아직 안 나온 기본 항목을 채운다', () => {
        const entries = [entry({ id: '1', type: 'expense', name: '꽃값' }), entry({ id: '2', type: 'expense', name: '간식비' })]

        expect(names(frequentChoices(entries, 'expense'))).toEqual(['간식비', '꽃값', '대관료'])
      })

      it(`최대 ${FREQUENT_CHOICES_LIMIT}개까지만 보여준다`, () => {
        const entries = ['가', '나', '다', '라', '마', '바', '사'].map((name, index) =>
          entry({ id: String(index), type: 'expense', name }),
        )

        expect(FREQUENT_CHOICES_LIMIT).toBe(6)
        expect(names(frequentChoices(entries, 'expense'))).toEqual(['사', '바', '마', '라', '다', '나'])
      })
    })

    describe('종류를 고르기 전', () => {
      it('두 종류를 최근 사용 순으로 섞고, 각 이름에 마지막으로 쓴 종류를 붙인다', () => {
        const entries = [
          entry({ id: '1', type: 'expense', name: '대관료' }),
          entry({ id: '2', type: 'income', name: '찬조금' }),
          // 같은 이름을 다른 종류로 쓴 적이 있으면 마지막 기록의 종류를 따른다
          entry({ id: '3', type: 'expense', name: '회비' }),
          entry({ id: '4', type: 'income', name: '회비' }),
        ]

        expect(frequentChoices(entries).slice(0, 3)).toEqual([
          { name: '회비', type: 'income' },
          { name: '찬조금', type: 'income' },
          { name: '대관료', type: 'expense' },
        ])
      })

      it('기록이 없으면 기본 항목을 종류와 함께 보여준다 (대관료·간식비 = 지출, 회비 = 수입)', () => {
        expect(frequentChoices([])).toEqual([
          { name: '대관료', type: 'expense' },
          { name: '간식비', type: 'expense' },
          { name: '회비', type: 'income' },
        ])
      })

      it('이미 쓴 이름의 기본 항목은 다시 넣지 않는다', () => {
        const entries = [entry({ id: '1', type: 'income', name: '간식비' })]

        expect(frequentChoices(entries)).toEqual([
          { name: '간식비', type: 'income' },
          { name: '대관료', type: 'expense' },
          { name: '회비', type: 'income' },
        ])
      })

      it(`섞어도 최대 ${FREQUENT_CHOICES_LIMIT}개까지만 보여준다`, () => {
        const entries = ['가', '나', '다', '라', '마', '바', '사'].map((name, index) =>
          entry({ id: String(index), type: index % 2 === 0 ? 'income' : 'expense', name }),
        )

        expect(names(frequentChoices(entries))).toEqual(['사', '바', '마', '라', '다', '나'])
      })
    })

    it('개수를 따로 정할 수 있다', () => {
      expect(frequentChoices([], 'expense', 1)).toEqual([{ name: '대관료', type: 'expense' }])
    })
  })

  describe('예전에 쓴 이름의 종류 (직접 적기)', () => {
    it('AC-15 예전에 쓴 이름이면 그 이름을 마지막으로 쓴 기록의 종류를 돌려준다', () => {
      const entries = [entry({ id: '1', type: 'expense', name: '꽃값' }), entry({ id: '2', type: 'income', name: '꽃값' })]

      expect(lastUsedType(entries, '꽃값')).toBe('income')
    })

    it('AC-15 처음 쓰는 이름이면 종류가 없다 (기본 항목도 써 본 적이 없으면 처음이다)', () => {
      expect(lastUsedType([entry({ id: '1', name: '간식비' })], '찬조금')).toBeUndefined()
      expect(lastUsedType([], '회비')).toBeUndefined()
    })

    it('앞뒤 공백은 지우고 비교한다', () => {
      expect(lastUsedType([entry({ id: '1', type: 'expense', name: '꽃값' })], ' 꽃값 ')).toBe('expense')
    })
  })

  describe('장부 만들기', () => {
    it('동아리 이름과 이월금으로 빈 장부를 만든다', () => {
      expect(createLedger(2026, { clubName: ' 꽃동산 ', carryover: -3_000 })).toEqual({
        year: 2026,
        clubName: '꽃동산',
        carryover: -3_000,
        entries: [],
      })
    })

    it.each([
      ['이월금 소수', { clubName: '꽃동산', carryover: 0.5 }],
      ['이월금 숫자 아님', { clubName: '꽃동산', carryover: Number.NaN }],
      ['이월금 상한 초과', { clubName: '꽃동산', carryover: 1_000_000_000 }],
      ['이월금 하한 초과', { clubName: '꽃동산', carryover: -1_000_000_000 }],
    ])('%s 이면 거부한다', (_label, info) => {
      expect(() => createLedger(2026, info)).toThrow(InvalidLedgerInputError)
      expect(() => updateLedgerInfo(ledger(), info)).toThrow(InvalidLedgerInputError)
    })

    it('동아리 정보를 고치면 기록은 그대로 두고 이름·이월금만 바뀐다', () => {
      const before = ledger({ entries: [entry({ id: 'a' })] })

      const next = updateLedgerInfo(before, { clubName: '한랑드림', carryover: 5_000 })

      expect(next).toEqual({ ...before, clubName: '한랑드림', carryover: 5_000 })
      expect(before.clubName).toBe('꽃동산 동아리')
    })

    it('AC-8 새 연도 장부의 이월금 기본값은 전년도 잔액이고 동아리 이름도 이어받는다', () => {
      const lastYear = ledger({
        year: 2025,
        clubName: '한랑드림',
        carryover: 10_000,
        entries: [
          entry({ id: 'a', type: 'income', name: '회비', amount: 200_000 }),
          entry({ id: 'b', type: 'expense', amount: 57_095 }),
        ],
      })

      expect(newLedgerDefaults({ '2025': lastYear }, 2026)).toEqual({ clubName: '한랑드림', carryover: 152_905 })
    })

    it('전년도 장부가 없으면 이월금은 0, 이름은 가장 가까운 연도 장부에서 가져온다', () => {
      const ledgers = { '2023': ledger({ year: 2023, clubName: '옛이름' }), '2024': ledger({ year: 2024, clubName: '한랑드림' }) }

      expect(newLedgerDefaults(ledgers, 2026)).toEqual({ clubName: '한랑드림', carryover: 0 })
    })

    it('장부가 하나도 없으면 빈 이름과 이월금 0 이다', () => {
      expect(newLedgerDefaults({}, 2026)).toEqual({ clubName: '', carryover: 0 })
    })
  })
})
