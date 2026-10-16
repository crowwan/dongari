import { describe, expect, it } from 'vitest'
import { PRACTICE_EXAMPLES } from './practiceScript'
import { practiceCoach, START_PROGRESS, type PracticeProgress, type PracticeView } from './practiceSteps'

const CLUB = PRACTICE_EXAMPLES.club
const HOUSEHOLD = PRACTICE_EXAMPLES.household

const INCOME = { name: '회비', type: 'income' } as const
const EXPENSE = { name: '간식비', type: 'expense' } as const

function view(overrides: Partial<PracticeView> = {}): PracticeView {
  return { screen: 'ledger', covered: false, entries: [], canSend: true, ...overrides }
}

function progress(overrides: Partial<PracticeProgress> = {}): PracticeProgress {
  return { ...START_PROGRESS, ...overrides }
}

const adding = (step: 'day' | 'item' | 'amount', saved: number, amount = 0) =>
  view({ screen: 'add-entry', entry: { step, amount, saved } })

describe('SPEC-008 연습 단계 말풍선 (practiceCoach)', () => {
  it('AC-3 처음: 장부 [+ 내역 적기] 를 가리키고 "회비 10,000원을 적어 볼게요. 여기를 눌러요" (연습 1 / 4)', () => {
    expect(practiceCoach(view(), START_PROGRESS, CLUB)).toEqual({
      step: 'open-add',
      stage: 1,
      target: 'add-entry',
      alsoOpen: [],
      spotlight: [],
      message: '회비 10,000원을 적어 볼게요. 여기를 눌러요',
      later: false,
    })
  })

  it('AC-12 ① 적기: 오늘 날짜 → 회비 → +1만 → [저장] → 간식비 날짜 → 간식비 → 금액 칸 → [저장] → [다 적었어요] 순서로 옮겨 간다', () => {
    const steps = [
      adding('day', 0),
      adding('item', 0),
      adding('amount', 0),
      adding('amount', 0, 10_000),
      adding('day', 1),
      adding('item', 1),
      adding('amount', 1),
      adding('amount', 1, 5_000),
      adding('day', 2),
    ].map((current) => practiceCoach(current, START_PROGRESS, CLUB))

    expect(steps.map((coach) => [coach?.target, coach?.message])).toEqual([
      ['quick-day', '오늘 날짜를 눌러요'],
      ['item-income', '회비를 눌러요'],
      ['plus-10k', '+1만을 눌러 10,000원을 만들어요'],
      ['save', '10,000원이 됐으면 [저장]을 눌러요'],
      ['quick-day', '간식비 5,000원도 적어 볼까요? 날짜를 눌러요'],
      ['item-expense', '간식비를 눌러요'],
      ['amount-field', '5,000원을 적고 [저장]을 눌러요'],
      ['save', '5,000원을 적고 [저장]을 눌러요'],
      ['finish-add', '잘했어요! 다 적었으면 여기를 눌러 장부로 가요'],
    ])
    expect(new Set(steps.map((coach) => coach?.stage))).toEqual(new Set([1]))
  })

  it('날 칸·금액 칸은 [오늘 16일]·[+1만] 과 함께 밝게 보인다 (말풍선이 칸을 덮지 않게)', () => {
    expect(practiceCoach(adding('day', 0), START_PROGRESS, CLUB)?.spotlight).toEqual(['day-area'])
    expect(practiceCoach(adding('day', 1), START_PROGRESS, CLUB)?.spotlight).toEqual(['day-area'])
    expect(practiceCoach(adding('amount', 0), START_PROGRESS, CLUB)?.spotlight).toEqual(['amount-area'])
    expect(practiceCoach(adding('amount', 0, 10_000), START_PROGRESS, CLUB)?.spotlight).toEqual([])
  })

  it('AC-11 날 칸(1-a)·금액 칸(1-c, 1-d)은 같이 열어 둔다', () => {
    expect(practiceCoach(adding('day', 0), START_PROGRESS, CLUB)?.alsoOpen).toEqual(['day-field', 'next'])
    expect(practiceCoach(adding('amount', 0), START_PROGRESS, CLUB)?.alsoOpen).toEqual(['amount-field'])
    expect(practiceCoach(adding('amount', 0, 10_000), START_PROGRESS, CLUB)?.alsoOpen).toEqual(['amount-field'])
    expect(practiceCoach(adding('amount', 1, 5_000), START_PROGRESS, CLUB)?.alsoOpen).toEqual(['amount-field'])
  })

  it('AC-13 금액이 10,000원이 아니면 [+1만]·금액 칸에 머문다', () => {
    expect(practiceCoach(adding('amount', 0, 20_000), START_PROGRESS, CLUB)?.target).toBe('plus-10k')
    expect(practiceCoach(adding('amount', 0, 9_000), START_PROGRESS, CLUB)?.target).toBe('plus-10k')
    expect(practiceCoach(adding('amount', 1, 50_000), START_PROGRESS, CLUB)?.target).toBe('amount-field')
  })

  it('AC-14 ② 정리 보기: 두 줄을 적고 장부로 오면 [10월 정리 보기], 월 정리에서는 1초쯤 지난 뒤 [‹ 장부로]', () => {
    const ledger = view({ entries: [INCOME, EXPENSE] })
    expect(practiceCoach(ledger, START_PROGRESS, CLUB)).toMatchObject({
      stage: 2,
      target: 'month-summary',
      message: '이번 달에 얼마 쓰고 남았는지 여기서 봐요',
    })

    const month = view({ screen: 'month-summary', entries: [INCOME, EXPENSE] })
    expect(practiceCoach(month, progress({ monthSeen: true }), CLUB)).toBeUndefined()
    expect(practiceCoach(month, progress({ monthSeen: true, monthReady: true }), CLUB)).toMatchObject({
      stage: 2,
      target: 'back-to-ledger',
      message: '다 봤으면 여기를 눌러 장부로 돌아가요',
    })
  })

  it('AC-15 ③ 고치기·지우기: 정리를 보고 오면 간식비 줄, 고치기 화면에서는 [이 내역 지우기]', () => {
    const seen = progress({ monthSeen: true, monthReady: true })
    expect(practiceCoach(view({ entries: [INCOME, EXPENSE] }), seen, CLUB)).toMatchObject({
      stage: 3,
      target: 'expense-row',
      message: '잘못 적었으면 줄을 눌러 고칠 수 있어요. 간식비 줄을 눌러 봐요',
    })
    expect(practiceCoach(view({ screen: 'edit-entry', entries: [INCOME, EXPENSE] }), seen, CLUB)).toMatchObject({
      stage: 3,
      target: 'delete',
      message: '여기서 고치거나 지울 수 있어요. 연습이니 지워 봐요',
    })
  })

  it('AC-15 확인 창·선택 창이 떠 있는 동안에는 말풍선이 없다', () => {
    const seen = progress({ monthSeen: true, monthReady: true })
    expect(practiceCoach(view({ screen: 'edit-entry', covered: true, entries: [INCOME, EXPENSE] }), seen, CLUB)).toBeUndefined()
  })

  it('AC-16 ④ 결산: 간식비를 지우면 [결산], 결산 화면에서는 [사진 보내기] 와 나와의 채팅 안내', () => {
    const seen = progress({ monthSeen: true, monthReady: true })
    expect(practiceCoach(view({ entries: [INCOME] }), seen, CLUB)).toMatchObject({
      stage: 4,
      target: 'year-summary',
      message: '한 해가 끝나면 여기서 결산을 봐요. 눌러 봐요',
    })
    expect(practiceCoach(view({ screen: 'year-summary', entries: [INCOME] }), seen, CLUB)).toEqual({
      step: 'send',
      stage: 4,
      target: 'send',
      alsoOpen: [],
      spotlight: [],
      message: "결산은 사진으로 보낼 수 있어요. [사진 보내기]를 눌러 카톡 '나와의 채팅'에 보내 보세요",
      later: false,
    })
  })

  it('AC-19 공유 창을 그냥 닫고 오면 글이 바뀌고 [다음에 할게요] 가 생긴다', () => {
    const coach = practiceCoach(view({ screen: 'year-summary', entries: [INCOME] }), progress({ monthSeen: true, sendCancelled: true }), CLUB)
    expect(coach).toMatchObject({ target: 'send', message: '아직 안 보냈어요. 다시 눌러 보거나, 나중에 해도 돼요', later: true })
  })

  it('AC-20 공유를 못 쓰는 기기는 처음부터 [사진으로 저장] 을 가리키고 [다음에 할게요] 가 있다', () => {
    const coach = practiceCoach(view({ screen: 'year-summary', entries: [INCOME], canSend: false }), progress({ monthSeen: true }), CLUB)
    expect(coach).toMatchObject({
      target: 'save-picture',
      message: '이 기기에서는 바로 보낼 수 없어요. 사진으로 저장해 두었다가 보내요',
      later: true,
    })
  })

  it('AC-21 누른 순간이 지나 거부되면 [한 번 더 눌러 보내기] 를 가리킨 채 "사진이 준비됐어요. 한 번 더 눌러 주세요"', () => {
    const coach = practiceCoach(view({ screen: 'year-summary', entries: [INCOME] }), progress({ monthSeen: true, sendReady: true }), CLUB)
    expect(coach).toMatchObject({ target: 'send', message: '사진이 준비됐어요. 한 번 더 눌러 주세요', later: false })
  })

  it('AC-26 가계부 연습은 용돈 10,000원·장보기 5,000원으로 말한다', () => {
    expect(practiceCoach(view(), START_PROGRESS, HOUSEHOLD)?.message).toBe('용돈 10,000원을 적어 볼게요. 여기를 눌러요')
    expect(practiceCoach(adding('item', 0), START_PROGRESS, HOUSEHOLD)?.message).toBe('용돈을 눌러요')
    expect(practiceCoach(adding('day', 1), START_PROGRESS, HOUSEHOLD)?.message).toBe('장보기 5,000원도 적어 볼까요? 날짜를 눌러요')
    expect(practiceCoach(adding('item', 1), START_PROGRESS, HOUSEHOLD)?.message).toBe('장보기를 눌러요')
    const income = { name: '용돈', type: 'income' } as const
    const expense = { name: '장보기', type: 'expense' } as const
    expect(practiceCoach(view({ entries: [income, expense] }), progress({ monthSeen: true }), HOUSEHOLD)?.message).toBe(
      '잘못 적었으면 줄을 눌러 고칠 수 있어요. 장보기 줄을 눌러 봐요',
    )
  })

  it('연습 밖 화면(설정 등)에서는 말풍선이 없다', () => {
    expect(practiceCoach(view({ screen: 'settings' }), START_PROGRESS, CLUB)).toBeUndefined()
  })
})
