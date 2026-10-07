import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { frequentChoices, lastUsedType, type EntryInput } from '../../domain/ledger'
import type { Entry, EntryType } from '../../domain/types'
import { useScreenHistory } from '../useScreenHistory'
import { AddEntryForm } from './AddEntryForm'

// 지난 기록: 대관료·꽃값(지출) → 찬조금(수입) 순으로 썼다
const HISTORY: Entry[] = [
  { id: '1', month: 9, type: 'expense', name: '대관료', amount: 40_000, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: '2', month: 9, type: 'expense', name: '꽃값', amount: 20_000, createdAt: '2026-09-02T00:00:00.000Z' },
  { id: '3', month: 9, type: 'income', name: '찬조금', amount: 50_000, createdAt: '2026-09-03T00:00:00.000Z' },
]

function makeHandlers() {
  return {
    onSave: vi.fn<(input: EntryInput) => void>(),
    onBack: vi.fn<() => void>(),
    onDirtyChange: vi.fn<(dirty: boolean) => void>(),
  }
}

type Handlers = ReturnType<typeof makeHandlers>

// 선택 창은 App 처럼 방문 기록 훅이 연다
function Harness({ month, handlers }: { month: number; handlers: Handlers }) {
  const sheets = useScreenHistory()
  return (
    <AddEntryForm
      month={month}
      currentMonth={10}
      frequentChoices={(type?: EntryType) => frequentChoices(HISTORY, type)}
      lastUsedType={(name) => lastUsedType(HISTORY, name)}
      sheets={sheets}
      onSave={handlers.onSave}
      onBack={handlers.onBack}
      onDirtyChange={handlers.onDirtyChange}
    />
  )
}

function renderForm(month = 10) {
  const handlers = makeHandlers()
  render(<Harness month={month} handlers={handlers} />)
  return handlers
}

const itemList = () => screen.getByRole('group', { name: '자주 쓴 항목' })
// "적은 내용" 카드 줄의 값 (위에서부터 달 / 항목)
const answers = () => screen.queryAllByTestId('answers-card-value').map((value) => value.textContent)
const actionButton = () => within(screen.getByTestId('bottom-action-bar')).getByRole('button')
const question = () => screen.getByRole('heading', { level: 2 })

async function writeCustomName(name: string) {
  await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))
  await userEvent.type(screen.getByLabelText('직접 적기'), name)
  await userEvent.click(screen.getByRole('button', { name: '다음' }))
}

describe('SPEC-001 내역 적기 (하나씩 채우기)', () => {
  it('AC-3 처음에는 "적은 내용" 카드에 보던 달 줄만 있고 "무엇인가요?" 항목 목록만 보인다 (아래 버튼 없음)', () => {
    renderForm(9)

    expect(screen.getByRole('heading', { level: 1, name: '내역 적기' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '적은 내용' })).toBeInTheDocument()
    expect(answers()).toEqual(['9월'])
    expect(screen.getByRole('button', { name: '달 바꾸기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '항목 바꾸기' })).not.toBeInTheDocument()
    expect(question()).toHaveTextContent('무엇인가요?')
    expect(screen.queryByTestId('bottom-action-bar')).not.toBeInTheDocument()
  })

  it('항목 목록은 원형 아이콘 + 이름 + 오른쪽 수입/지출, 최근 사용 순 최대 6개 + 맨 아래 [직접 적기]', () => {
    renderForm()

    const rows = within(itemList()).getAllByRole('button')
    expect(rows.map((row) => row.textContent)).toEqual([
      '찬조금 수입',
      '꽃값 지출',
      '대관료 지출',
      '간식비 지출',
      '회비 수입',
      '직접 적기',
    ])
    expect(rows[0].querySelector('[data-icon]')).toBeInTheDocument()
    expect(rows[0]).toHaveAttribute('data-tone', 'income')
  })

  it('카드 아래에 "지금 적을 것" 표시와 지금 질문이 있다', () => {
    renderForm()

    const now = screen.getByTestId('entry-now')
    expect(now).toHaveTextContent('지금 적을 것')
    expect(now.nextElementSibling).toBe(question())
  })

  it('AC-4 항목을 누르면 카드에 항목 줄("대관료 · 지출", 항목 아이콘)이 쌓이고 "얼마인가요?" 로 넘어간다', async () => {
    renderForm()

    await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

    expect(answers()).toEqual(['10월', '대관료 · 지출'])
    expect(screen.getAllByTestId('answers-card-label').map((label) => label.textContent)).toEqual(['달', '항목'])
    expect(screen.getAllByTestId('answers-card-value')[1].querySelector('[data-icon="building"]')).toBeInTheDocument()
    expect(question()).toHaveTextContent('얼마인가요?')
    expect(screen.queryByRole('group', { name: '자주 쓴 항목' })).not.toBeInTheDocument()
  })

  it('AC-10 "얼마인가요?" 는 숫자 키패드 칸이 바로 포커스를 받고, [저장] 이 아래에 있다', async () => {
    renderForm()

    await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

    const amount = screen.getByLabelText('얼마인가요?')
    expect(amount).toHaveAttribute('inputmode', 'numeric')
    expect(amount).toHaveFocus()
    expect(actionButton()).toHaveAccessibleName('저장')
  })

  it('AC-5 금액이 0 이면 [저장] 비활성 + "얼마인지 적어 주세요"', async () => {
    renderForm()

    await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

    expect(actionButton()).toBeDisabled()
    expect(actionButton()).toHaveAccessibleDescription('얼마인지 적어 주세요')
  })

  it('AC-1 금액을 적고 [저장] 하면 달·종류·이름·금액을 넘긴다', async () => {
    const { onSave } = renderForm()

    await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))
    await userEvent.type(screen.getByLabelText('얼마인가요?'), '40000')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onSave).toHaveBeenCalledWith({ month: 10, type: 'expense', name: '대관료', amount: 40_000 })
  })

  it('AC-17 [+1만] [+5만] [+10만] 은 지금 금액에 더한다', async () => {
    renderForm()
    await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

    await userEvent.click(screen.getByRole('button', { name: '1만 원 더하기' }))
    await userEvent.click(screen.getByRole('button', { name: '5만 원 더하기' }))
    await userEvent.click(screen.getByRole('button', { name: '10만 원 더하기' }))

    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('160,000')
  })

  describe('직접 적기', () => {
    it('AC-5 [직접 적기] 를 누르면 이름 칸이 나오고, 비어 있으면 [다음] 비활성 + "무엇인지 적어 주세요"', async () => {
      renderForm()

      await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))

      expect(screen.getByLabelText('직접 적기')).toHaveFocus()
      expect(actionButton()).toHaveAccessibleName('다음')
      expect(actionButton()).toBeDisabled()
      expect(actionButton()).toHaveAccessibleDescription('무엇인지 적어 주세요')
    })

    it('AC-15 처음 쓰는 이름이면 "수입인가요, 지출인가요?" 를 기본값 없이 묻고, 안 골랐으면 [다음] 비활성 + 안내', async () => {
      renderForm()

      await writeCustomName(' 화환 ')

      expect(question()).toHaveTextContent('수입인가요, 지출인가요?')
      const kinds = within(screen.getByRole('group', { name: '수입인가요, 지출인가요?' })).getAllByRole('button')
      expect(kinds.map((kind) => kind.textContent)).toEqual(['수입', '지출'])
      expect(kinds.every((kind) => kind.getAttribute('aria-pressed') === 'false')).toBe(true)
      // 지금 묻는 수입/지출은 카드에 올리지 않는다: 항목 줄은 이름만
      expect(answers()).toEqual(['10월', '화환'])
      expect(actionButton()).toBeDisabled()
      expect(actionButton()).toHaveAccessibleDescription('수입인지 지출인지 골라 주세요')
    })

    it('AC-15 새 이름의 종류를 고르고 [다음] 을 누르면 금액으로 넘어가 저장된다', async () => {
      const { onSave } = renderForm()
      await writeCustomName('화환')

      await userEvent.click(screen.getByRole('button', { name: '지출' }))
      await userEvent.click(screen.getByRole('button', { name: '다음' }))
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '30000')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(onSave).toHaveBeenCalledWith({ month: 10, type: 'expense', name: '화환', amount: 30_000 })
    })

    it('AC-15 예전에 쓴 이름이면 묻지 않고 그때 종류로 정해 금액으로 넘어간다', async () => {
      renderForm()

      await writeCustomName('찬조금')

      expect(question()).toHaveTextContent('얼마인가요?')
      expect(answers()).toEqual(['10월', '찬조금 · 수입'])
    })

    it('이름 칸에서 키패드 [완료](Enter) 로도 다음으로 넘어간다', async () => {
      renderForm()
      await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))

      await userEvent.type(screen.getByLabelText('직접 적기'), '찬조금{Enter}')

      expect(question()).toHaveTextContent('얼마인가요?')
    })

    it('AC-4 이름을 적는 동안에는 적는 중인 이름을 카드에 올리지 않는다', async () => {
      renderForm()
      await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))

      await userEvent.type(screen.getByLabelText('직접 적기'), '화환')

      expect(answers()).toEqual(['10월'])
    })

    it('잘못 눌렀으면 [목록에서 고르기] 로 항목 목록에 돌아간다', async () => {
      renderForm()
      await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))

      await userEvent.click(screen.getByRole('button', { name: '목록에서 고르기' }))

      expect(itemList()).toBeInTheDocument()
    })
  })

  describe('AC-16 "적은 내용" 카드 줄의 [바꾸기] 를 누르면 그 값을 고친다', () => {
    it('[항목 바꾸기] 를 누르면 항목 고르기로 돌아가고(지금 이름 체크), 다른 항목을 골라도 금액은 그대로다', async () => {
      const { onSave } = renderForm()
      await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '40000')

      await userEvent.click(screen.getByRole('button', { name: '항목 바꾸기' }))
      expect(within(itemList()).getByRole('button', { name: '대관료 지출' })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(within(itemList()).getByRole('button', { name: '회비 수입' }))

      expect(screen.getByLabelText('얼마인가요?')).toHaveValue('40,000')
      expect(answers()).toEqual(['10월', '회비 · 수입'])
      await userEvent.click(screen.getByRole('button', { name: '항목 바꾸기' }))
      expect(itemList()).toBeInTheDocument()
      await userEvent.click(within(itemList()).getByRole('button', { name: '회비 수입' }))
      await userEvent.click(screen.getByRole('button', { name: '저장' }))
      expect(onSave).toHaveBeenCalledWith({ month: 10, type: 'income', name: '회비', amount: 40_000 })
    })

    it('[달 바꾸기] 를 누르면 열두 달 선택 창이 열리고, 고르면 창이 닫히며 달 줄이 바뀐다 (지금 질문 그대로)', async () => {
      renderForm()
      await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

      await userEvent.click(screen.getByRole('button', { name: '달 바꾸기' }))
      const sheet = screen.getByRole('dialog', { name: '몇 월인가요?' })
      expect(within(sheet).getByRole('button', { name: '10월' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(sheet).getByRole('button', { name: '10월' })).toHaveAttribute('aria-current', 'date')
      await userEvent.click(within(sheet).getByRole('button', { name: '3월' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(answers()).toEqual(['3월', '대관료 · 지출'])
      expect(question()).toHaveTextContent('얼마인가요?')
    })

    it('선택 창이 열려 있을 때 뒤로 버튼은 선택 창만 닫는다', async () => {
      const { onBack } = renderForm()
      await userEvent.click(screen.getByRole('button', { name: '달 바꾸기' }))

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
      })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: '내역 적기' })).toBeInTheDocument()
      expect(onBack).not.toHaveBeenCalled()
    })
  })

  describe('적던 내용 (버릴까요?)', () => {
    it('처음 상태(달만 있음)에서는 적던 내용이 없다고 알린다', () => {
      const { onDirtyChange } = renderForm()

      expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })

    it('항목을 고르면 적던 내용이 있다고 알린다', async () => {
      const { onDirtyChange } = renderForm()

      await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

      expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    })

    it('달만 바꿔도 알리고, 처음 달로 되돌리면 다시 없다고 알린다', async () => {
      const { onDirtyChange } = renderForm()

      await userEvent.click(screen.getByRole('button', { name: '달 바꾸기' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '3월' }))
      expect(onDirtyChange).toHaveBeenLastCalledWith(true)

      await userEvent.click(screen.getByRole('button', { name: '달 바꾸기' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '10월' }))
      expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })
  })

  it('[← 장부로] 를 누르면 닫는다', async () => {
    const { onBack, onSave } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: '장부로' }))

    expect(onBack).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })
})
