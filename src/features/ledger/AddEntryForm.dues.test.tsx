import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { frequentChoices, lastUsedType, olderChoices, type EntryInput } from '../../domain/ledger'
import { addMember } from '../../domain/members'
import { payerChoices } from '../../domain/payers'
import type { Book, Entry, EntryType, Member } from '../../domain/types'
import { book } from '../../test/ledgerFixtures'
import { useScreenHistory } from '../useScreenHistory'
import { AddEntryForm } from './AddEntryForm'

// 지어낸 회원 (2026년 월 회비 20,000원). 강민지는 10월에 쉰다
const MEMBERS: Member[] = [
  { id: 'm-jung', name: '정하늘', joined: '2026-01', off: [] },
  { id: 'm-kang', name: '강민지', joined: '2026-01', off: ['2026-10'] },
  { id: 'm-kim', name: '김도윤', joined: '2026-01', off: [] },
  { id: 'm-lee', name: '이준호', joined: '2026-01', off: [] },
  { id: 'm-park', name: '박서연', joined: '2026-01', off: [] },
]

// 지난번(9월 3일에 저장) 김도윤·이준호가 낸 회비
const LAST_DUES: Entry = {
  id: 'e1',
  month: 9,
  day: 3,
  type: 'income',
  name: '회비',
  amount: 40_000,
  createdAt: '2026-09-03T00:00:00.000Z',
  payers: [
    { memberId: 'm-kim', amount: 20_000 },
    { memberId: 'm-lee', amount: 20_000 },
  ],
}

// monthlyFee null: 어느 해에도 월 회비를 정하지 않은 장부
function clubBook(members: Member[] = MEMBERS, monthlyFee: number | null = 20_000): Book {
  const ledger = monthlyFee === null ? { year: 2026, carryover: 0, entries: [LAST_DUES] } : { year: 2026, carryover: 0, monthlyFee, entries: [LAST_DUES] }
  return book([ledger], { members, dues: { startMonth: '2026-01' } })
}

// App 처럼 회원 넣기는 장부를 바꾸고(번호는 차례로) 목록을 다시 그린다
function Harness({ start, onSave }: { start: Book; onSave: (input: EntryInput) => void }) {
  const sheets = useScreenHistory()
  const [target, setTarget] = useState(start)
  const entries = target.ledgers['2026']?.entries ?? []
  return (
    <AddEntryForm
      year={2026}
      month={10}
      saved={[]}
      currentMonth={10}
      currentDay={17}
      frequentChoices={(type?: EntryType) => frequentChoices(entries, type)}
      olderChoices={() => olderChoices(entries)}
      lastUsedType={(name) => lastUsedType(entries, name)}
      sheets={sheets}
      onSave={onSave}
      onBack={vi.fn()}
      dues={{
        choices: (month, keep) => payerChoices(target, 2026, month, keep),
        members: target.members ?? [],
        onAddMember: (name, month) => {
          const id = `new-${(target.members ?? []).length}`
          setTarget(addMember(target, { name, joined: `2026-${String(month).padStart(2, '0')}` }, { createId: () => id, year: 2026 }))
          return id
        },
      }}
    />
  )
}

function renderDues(start: Book = clubBook()) {
  const onSave = vi.fn<(input: EntryInput) => void>()
  render(<Harness start={start} onSave={onSave} />)
  return onSave
}

const actionButton = () => within(screen.getByTestId('bottom-action-bar')).getByRole('button')
const actionNote = () => screen.getByTestId('bottom-action-bar')
const answers = () => screen.queryAllByTestId('entry-card-value').map((value) => value.textContent)
const box = (name: string) => screen.getByRole('checkbox', { name })

// 17일 → 회비를 골라 "누가 냈어요?" 로
async function toPayers(item = '회비') {
  await userEvent.click(screen.getByRole('button', { name: '오늘 17일' }))
  await userEvent.click(within(screen.getByRole('group', { name: '자주 쓴 항목' })).getByRole('button', { name: new RegExp(`^${item.replace(/[()]/g, '\\$&')} `) }))
}

describe('SPEC-010 회비 적기 (3절)', () => {
  it('AC-10 명단이 있는 동아리 장부에서 수입 "회비"를 고르면 "누가 냈어요?" 가 나온다', async () => {
    renderDues()
    await toPayers()

    expect(screen.getByRole('heading', { level: 2, name: '누가 냈어요?' })).toBeInTheDocument()
    // 가나다, 10월에 쉬는 강민지는 맨 아래 "쉬는 분" 묶음
    expect(screen.getAllByRole('checkbox').map((item) => item.textContent)).toEqual(['김도윤', '박서연', '이준호', '정하늘', '강민지'])
    expect(within(screen.getByRole('group', { name: '쉬는 분' })).getByRole('checkbox', { name: '강민지' })).toBeInTheDocument()
  })

  it('AC-10 수입 "회비(14인)" 도 회비 기록이라 묻는다', async () => {
    renderDues(book([{ year: 2026, carryover: 0, monthlyFee: 20_000, entries: [{ ...LAST_DUES, name: '회비(14인)' }] }], { members: MEMBERS }))
    await toPayers('회비(14인)')

    expect(screen.getByRole('heading', { level: 2, name: '누가 냈어요?' })).toBeInTheDocument()
  })

  it('AC-11 아무도 안 고르면 [다음] 이 비활성 + "누가 냈는지 골라 주세요", 고르면 "N명 · M원 (한 분 F원)"', async () => {
    renderDues()
    await toPayers()

    expect(actionButton()).toBeDisabled()
    expect(actionNote()).toHaveTextContent('누가 냈는지 골라 주세요')

    await userEvent.click(box('박서연'))
    expect(actionButton()).toBeEnabled()
    expect(actionNote()).toHaveTextContent('1명 · 20,000원 (한 분 20,000원)')
  })

  it('AC-11 [지난번 낸 분 2명] 으로 고르고 [다음] 을 누르면 금액이 2 × 20,000원으로 채워지고 카드에 낸 분 줄이 생긴다', async () => {
    const onSave = renderDues()
    await toPayers()

    await userEvent.click(screen.getByRole('button', { name: '지난번 낸 분 2명' }))
    expect(box('김도윤')).toBeChecked()
    expect(box('이준호')).toBeChecked()
    await userEvent.click(actionButton())

    expect(screen.getByRole('heading', { level: 2, name: '얼마인가요?' })).toBeInTheDocument()
    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('40,000')
    expect(screen.getByText('2명 × 20,000원으로 채웠어요. 고쳐도 돼요.')).toBeInTheDocument()
    expect(answers()).toEqual(['10월 17일', '회비 · 수입', '김도윤, 이준호 2명'])

    await userEvent.click(actionButton())
    expect(onSave).toHaveBeenCalledWith({
      month: 10,
      day: 17,
      type: 'income',
      name: '회비',
      amount: 40_000,
      payers: [
        { memberId: 'm-kim', amount: 20_000 },
        { memberId: 'm-lee', amount: 20_000 },
      ],
    })
  })

  it('AC-11 [모두 N명] 은 쉬는 분을 뺀 지금 회원을 모두 고른다', async () => {
    renderDues()
    await toPayers()

    await userEvent.click(screen.getByRole('button', { name: '모두 4명' }))

    expect(box('강민지')).not.toBeChecked()
    expect(actionNote()).toHaveTextContent('4명 · 80,000원 (한 분 20,000원)')
    await userEvent.click(actionButton())
    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('80,000')
  })

  it('AC-11 월 회비가 없는 해면 안내는 "N명" 이고 금액 칸은 빈칸에서 시작한다', async () => {
    renderDues(clubBook(MEMBERS, null))
    await toPayers()

    await userEvent.click(box('김도윤'))
    expect(actionNote()).toHaveTextContent('1명')
    expect(actionNote()).not.toHaveTextContent('원')
    await userEvent.click(actionButton())
    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('')
  })

  it('월 회비 × 사람 수가 상한을 넘어 금액을 못 채우면 "채웠어요" 안내가 없다', async () => {
    renderDues(clubBook(MEMBERS, 300_000_000))
    await toPayers()
    await userEvent.click(screen.getByRole('button', { name: '모두 4명' }))
    expect(actionNote()).toHaveTextContent('4명 (한 분 300,000,000원)')

    await userEvent.click(actionButton())

    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('')
    expect(screen.queryByText(/으로 채웠어요/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '한 분만 금액이 달라요' })).toBeInTheDocument()
  })

  it('AC-14 [+ 회원 넣기] 로 넣은 분이 가나다로 접힌 자리(8번째 뒤)에 가도 목록이 펼쳐져 체크된 채 보인다', async () => {
    const many: Member[] = ['가', '나', '다', '라', '마', '바', '사', '아', '자'].map((name, index) => ({
      id: `m${index}`,
      name: `${name}예시`,
      joined: '2026-01',
      off: [],
    }))
    renderDues(clubBook(many))
    await toPayers()
    expect(screen.getAllByRole('checkbox')).toHaveLength(7)

    await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
    await userEvent.type(within(screen.getByRole('dialog', { name: '회원 넣기' })).getByLabelText('이름'), '하예시')
    await userEvent.click(within(screen.getByRole('dialog', { name: '회원 넣기' })).getByRole('button', { name: '넣기' }))

    expect(screen.getAllByRole('checkbox')).toHaveLength(10)
    expect(box('하예시')).toBeChecked()
  })

  it('AC-11 낸 분 줄 [바꾸기] 로 돌아가면 고른 분이 체크된 채다', async () => {
    renderDues()
    await toPayers()
    await userEvent.click(box('정하늘'))
    await userEvent.click(actionButton())

    await userEvent.click(screen.getByRole('button', { name: '낸 분 바꾸기' }))

    expect(screen.getByRole('heading', { level: 2, name: '누가 냈어요?' })).toBeInTheDocument()
    expect(box('정하늘')).toBeChecked()
  })

  it('AC-12 금액을 사람 수로 안 나눠지게 바꾸고 [저장] 하면 "한 분씩 금액" 으로 가고, [이대로 할게요] 의 합계가 기록 금액이 되어 저장된다', async () => {
    const onSave = renderDues()
    await toPayers()
    await userEvent.click(screen.getByRole('button', { name: '지난번 낸 분 2명' }))
    await userEvent.click(actionButton())
    const amount = screen.getByLabelText('얼마인가요?')
    await userEvent.clear(amount)
    await userEvent.type(amount, '50001')

    await userEvent.click(actionButton())

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: '한 분씩 금액' })).toBeInTheDocument()
    expect(screen.getByText('달라진 분만 고치면 돼요. 합계가 이 기록의 금액이 돼요.')).toBeInTheDocument()
    // 처음엔 월 회비 (나눠떨어지지 않으므로)
    expect(screen.getByLabelText('김도윤')).toHaveValue('20,000')
    const lee = screen.getByLabelText('이준호')
    await userEvent.clear(lee)
    await userEvent.type(lee, '120000')
    expect(screen.getByText('합계 140,000원 (2명)')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '이대로 할게요' }))

    expect(screen.getByRole('heading', { level: 1, name: '내역 적기' })).toBeInTheDocument()
    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('140,000')
    await userEvent.click(actionButton())
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 140_000,
        payers: [
          { memberId: 'm-kim', amount: 20_000 },
          { memberId: 'm-lee', amount: 120_000 },
        ],
      }),
    )
  })

  it('AC-12 "한 분씩 금액" 에 빈칸·0원이 있으면 [이대로 할게요] 비활성 + "모든 분 금액을 적어 주세요"', async () => {
    renderDues()
    await toPayers()
    await userEvent.click(box('김도윤'))
    await userEvent.click(box('이준호'))
    await userEvent.click(actionButton())
    await userEvent.click(screen.getByRole('button', { name: '한 분만 금액이 달라요' }))

    await userEvent.clear(screen.getByLabelText('김도윤'))

    expect(screen.getByRole('button', { name: '이대로 할게요' })).toBeDisabled()
    expect(actionNote()).toHaveTextContent('모든 분 금액을 적어 주세요')
  })

  it('AC-13 [이름 없이 적기] 로 저장한 기록은 낸 분이 없다', async () => {
    const onSave = renderDues()
    await toPayers()

    await userEvent.click(screen.getByRole('button', { name: '이름 없이 적기' }))
    expect(answers()).toEqual(['10월 17일', '회비 · 수입', '이름 없이'])
    expect(screen.queryByRole('button', { name: '한 분만 금액이 달라요' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('얼마인가요?'), '30000')
    await userEvent.click(actionButton())

    expect(onSave).toHaveBeenCalledWith({ month: 10, day: 17, type: 'income', name: '회비', amount: 30_000 })
  })

  it('AC-14 [+ 회원 넣기] 로 넣은 이름은 명단에 저장되고 체크된 채 목록에 생긴다', async () => {
    renderDues()
    await toPayers()

    await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
    const sheet = screen.getByRole('dialog', { name: '회원 넣기' })
    expect(within(sheet).getByText('2026년 10월에 들어온 분으로 넣고, 회원 명단에도 저장해요')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '넣기' })).toBeDisabled()
    await userEvent.type(within(sheet).getByLabelText('이름'), '김도윤')
    expect(within(sheet).getByText('같은 이름이 있어요. 구분할 수 있게 적어 주세요')).toBeInTheDocument()
    await userEvent.clear(within(sheet).getByLabelText('이름'))
    await userEvent.type(within(sheet).getByLabelText('이름'), '한지우')
    await userEvent.click(within(sheet).getByRole('button', { name: '넣기' }))

    expect(screen.queryByRole('dialog', { name: '회원 넣기' })).not.toBeInTheDocument()
    expect(box('한지우')).toBeChecked()
    expect(actionNote()).toHaveTextContent('1명 · 20,000원')
  })

  it('[+ 회원 넣기] 창에서 이름에 쉼표가 있으면 안내와 함께 [넣기]를 누를 수 없다 — 엑셀 낸 분 구분 글자라서 (#180 리뷰)', async () => {
    renderDues()
    await toPayers()

    await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
    const sheet = screen.getByRole('dialog', { name: '회원 넣기' })
    await userEvent.type(within(sheet).getByLabelText('이름'), '한지우,총무')

    expect(within(sheet).getByLabelText('이름')).toHaveAccessibleDescription('이름에 쉼표(,)는 쓸 수 없어요. 구분하려면 괄호를 써 주세요')
    expect(within(sheet).getByRole('button', { name: '넣기' })).toBeDisabled()
    await userEvent.type(within(sheet).getByLabelText('이름'), '{Enter}')
    expect(screen.getByRole('dialog', { name: '회원 넣기' })).toBeInTheDocument()
  })

  it('회원이 8명 넘으면 7명만 보이고 [회원 N명 더 보기] 로 펼친다', async () => {
    const many: Member[] = ['가', '나', '다', '라', '마', '바', '사', '아', '자'].map((name, index) => ({
      id: `m${index}`,
      name: `${name}예시`,
      joined: '2026-01',
      off: [],
    }))
    renderDues(clubBook(many))
    await toPayers()

    expect(screen.getAllByRole('checkbox')).toHaveLength(7)
    await userEvent.click(screen.getByRole('button', { name: '회원 2명 더 보기' }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(9)
  })

  it('지출 "대관료" 처럼 회비가 아닌 항목은 지금처럼 바로 "얼마인가요?" 로 간다', async () => {
    renderDues()
    await userEvent.click(screen.getByRole('button', { name: '오늘 17일' }))
    await userEvent.click(within(screen.getByRole('group', { name: '자주 쓴 항목' })).getByRole('button', { name: /^대관료 / }))

    expect(screen.getByRole('heading', { level: 2, name: '얼마인가요?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '한 분만 금액이 달라요' })).not.toBeInTheDocument()
  })
})
