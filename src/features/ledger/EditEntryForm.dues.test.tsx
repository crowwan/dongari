import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { frequentChoices, olderChoices, type EntryInput, type PayersEdit } from '../../domain/ledger'
import { addMember } from '../../domain/members'
import { payerChoices } from '../../domain/payers'
import type { Book, Entry, Member, Payer } from '../../domain/types'
import { book } from '../../test/ledgerFixtures'
import { useScreenHistory } from '../useScreenHistory'
import { EditEntryForm } from './EditEntryForm'

// 지어낸 회원. 박서연은 그만둔 분
const MEMBERS: Member[] = [
  { id: 'm-kim', name: '김도윤', joined: '2026-01', off: [] },
  { id: 'm-lee', name: '이준호', joined: '2026-01', off: [] },
  { id: 'm-jung', name: '정하늘', joined: '2026-01', off: [] },
  { id: 'm-park', name: '박서연', joined: '2026-01', left: '2026-06', off: [] },
]

const even = (ids: readonly string[], amount: number): Payer[] => ids.map((memberId) => ({ memberId, amount }))

// 3월 5일, 김도윤·이준호가 2만 원씩 낸 회비
const PAID: Entry = {
  id: 'e1',
  month: 3,
  day: 5,
  type: 'income',
  name: '회비',
  amount: 40_000,
  createdAt: '2026-03-05T00:00:00.000Z',
  payers: even(['m-kim', 'm-lee'], 20_000),
}

function clubBook(entry: Entry): Book {
  return book([{ year: 2026, carryover: 0, monthlyFee: 20_000, entries: [entry] }], { members: MEMBERS, dues: { startMonth: '2026-01' } })
}

function Harness({ entry, onSave }: { entry: Entry; onSave: (input: EntryInput, payers: PayersEdit) => void }) {
  const sheets = useScreenHistory()
  const [target, setTarget] = useState(() => clubBook(entry))
  return (
    <EditEntryForm
      year={2026}
      initial={{ month: entry.month, day: entry.day, type: entry.type, name: entry.name, amount: entry.amount }}
      initialPayers={entry.payers}
      currentMonth={10}
      frequentChoices={() => frequentChoices([entry])}
      olderChoices={() => olderChoices([entry])}
      sheets={sheets}
      onSave={onSave}
      onBack={vi.fn()}
      onDelete={vi.fn()}
      dues={{
        choices: (month, keep) => payerChoices(target, 2026, month, keep),
        members: target.members ?? [],
        onAddMember: (name, month) => {
          setTarget(addMember(target, { name, joined: `2026-${String(month).padStart(2, '0')}` }, { createId: () => 'm-new', year: 2026 }))
          return 'm-new'
        },
      }}
    />
  )
}

function renderEdit(entry: Entry = PAID) {
  const onSave = vi.fn<(input: EntryInput, payers: PayersEdit) => void>()
  render(<Harness entry={entry} onSave={onSave} />)
  return onSave
}

const box = (name: string) => screen.getByRole('checkbox', { name })
const saveButton = () => screen.getByRole('button', { name: '저장' })
const amountField = () => screen.getByLabelText('얼마인가요?')

async function typeAmount(amount: string) {
  await userEvent.clear(amountField())
  await userEvent.type(amountField(), amount)
}

describe('SPEC-010 회비 기록 고치기 (3절 "고치기 화면")', () => {
  it('AC-15 회비 기록이고 명단이 있으면 "얼마인가요?" 위에 "누가 냈어요?" 가 있고 지금 낸 분이 체크돼 있다', () => {
    renderEdit()

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['며칠인가요?', '무엇인가요?', '누가 냈어요?', '얼마인가요?'])
    expect(box('김도윤')).toBeChecked()
    expect(box('이준호')).toBeChecked()
    expect(box('정하늘')).not.toBeChecked()
  })

  it('AC-15 그 기록에 낸 분으로 들어간 그만둔 분은 목록에 남는다', () => {
    renderEdit({ ...PAID, payers: even(['m-kim', 'm-park'], 20_000) })

    expect(box('박서연')).toBeChecked()
  })

  it('AC-15 아무것도 바꾸지 않고 저장하면 지금 낸 분 그대로 (이 값)', async () => {
    const onSave = renderEdit()

    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: 40_000 }), { kind: 'set', payers: PAID.payers })
  })

  it('AC-15 낸 분을 바꾸고 나눠떨어지는 금액으로 저장하면 똑같이 나눈다', async () => {
    const onSave = renderEdit()

    await userEvent.click(box('정하늘'))
    await typeAmount('60000')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: 60_000 }), {
      kind: 'set',
      payers: even(['m-kim', 'm-lee', 'm-jung'], 20_000),
    })
  })

  it('AC-15 모두 같은 몫이던 기록의 금액을 바꾸면 똑같이 다시 나누고, 안 나눠지면 [저장] 때 "한 분씩 금액" 으로 간다', async () => {
    const onSave = renderEdit()

    await typeAmount('50001')
    await userEvent.click(saveButton())
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: '한 분씩 금액' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '내역 고치기' })).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('이준호'))
    await userEvent.type(screen.getByLabelText('이준호'), '30001')
    await userEvent.click(screen.getByRole('button', { name: '이대로 할게요' }))
    expect(screen.getByRole('heading', { level: 1, name: '내역 고치기' })).toBeInTheDocument()
    expect(amountField()).toHaveValue('50,001')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: 50_001 }), {
      kind: 'set',
      payers: [
        { memberId: 'm-kim', amount: 20_000 },
        { memberId: 'm-lee', amount: 30_001 },
      ],
    })
  })

  it('AC-15 낸 분을 모두 풀면 낸 분 없는 회비 기록으로 저장한다 (지우기)', async () => {
    const onSave = renderEdit()

    await userEvent.click(box('김도윤'))
    await userEvent.click(box('이준호'))
    expect(screen.getByText('아무도 고르지 않으면 낸 분 없이 저장돼요')).toBeInTheDocument()
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: '회비' }), { kind: 'clear' })
  })

  it('AC-15 항목을 회비가 아닌 것으로 바꾸고 [저장] 하면 확인 창 "낸 분 기록이 지워져요" 뒤 [바꾸기] 로 낸 분이 지워진다', async () => {
    const onSave = renderEdit()

    await userEvent.click(within(screen.getByRole('group', { name: '자주 쓴 항목' })).getByRole('button', { name: '직접 적기' }))
    await userEvent.type(screen.getByRole('textbox', { name: '무엇인지 적어 주세요' }), '찬조금')
    // 회비가 아니게 되면 "누가 냈어요?" 는 사라진다
    expect(screen.queryByRole('heading', { level: 2, name: '누가 냈어요?' })).not.toBeInTheDocument()
    await userEvent.click(saveButton())

    const dialog = screen.getByRole('alertdialog', { name: '낸 분 기록이 지워져요' })
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: '아니요' }))
    expect(onSave).not.toHaveBeenCalled()

    await userEvent.click(saveButton())
    await userEvent.click(within(screen.getByRole('alertdialog', { name: '낸 분 기록이 지워져요' })).getByRole('button', { name: '바꾸기' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: '찬조금' }), { kind: 'clear' })
  })

  it('AC-14 고치기에서도 [+ 회원 넣기] 로 넣은 분이 체크된 채 생긴다', async () => {
    renderEdit()

    await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
    await userEvent.type(within(screen.getByRole('dialog', { name: '회원 넣기' })).getByLabelText('이름'), '한지우')
    await userEvent.click(within(screen.getByRole('dialog', { name: '회원 넣기' })).getByRole('button', { name: '넣기' }))

    expect(box('한지우')).toBeChecked()
  })
})
