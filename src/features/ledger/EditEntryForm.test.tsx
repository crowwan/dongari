import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { frequentChoices, type EntryInput } from '../../domain/ledger'
import type { Entry, EntryType } from '../../domain/types'
import { useScreenHistory } from '../useScreenHistory'
import { EditEntryForm } from './EditEntryForm'
import type { EntryDraft } from './entryDraft'

// 지난 기록: 대관료·꽃값(지출) → 찬조금(수입) 순으로 썼다
const HISTORY: Entry[] = [
  { id: '1', month: 9, type: 'expense', name: '대관료', amount: 40_000, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: '2', month: 9, type: 'expense', name: '꽃값', amount: 20_000, createdAt: '2026-09-02T00:00:00.000Z' },
  { id: '3', month: 9, type: 'income', name: '찬조금', amount: 50_000, createdAt: '2026-09-03T00:00:00.000Z' },
]

const SAVED: EntryDraft = { month: 4, type: 'income', name: '회비', amount: 140_000 }

function makeHandlers() {
  return {
    onSave: vi.fn<(input: EntryInput) => void>(),
    onBack: vi.fn<() => void>(),
    onDirtyChange: vi.fn<(dirty: boolean) => void>(),
    onDelete: vi.fn<() => void>(),
  }
}

type Handlers = ReturnType<typeof makeHandlers>

// 선택 창은 App 처럼 방문 기록 훅이 연다
function Harness({ initial, handlers }: { initial: EntryDraft; handlers: Handlers }) {
  const sheets = useScreenHistory()
  return (
    <EditEntryForm
      initial={initial}
      currentMonth={10}
      frequentChoices={(type?: EntryType) => frequentChoices(HISTORY, type)}
      sheets={sheets}
      onSave={handlers.onSave}
      onBack={handlers.onBack}
      onDirtyChange={handlers.onDirtyChange}
      onDelete={handlers.onDelete}
    />
  )
}

function renderForm(initial: EntryDraft = SAVED) {
  const handlers = makeHandlers()
  render(<Harness initial={initial} handlers={handlers} />)
  return handlers
}

const saveButton = () => screen.getByRole('button', { name: '저장' })
const typeGroup = () => screen.getByRole('group', { name: '수입인가요, 지출인가요?' })
const itemList = () => screen.getByRole('group', { name: '자주 쓴 항목' })
const itemNames = () =>
  within(itemList())
    .getAllByRole('button')
    .map((button) => button.textContent)

describe('SPEC-001 내역 고치기 (펼친 모양)', () => {
  it('위에서부터 몇 월(한 줄 + 바꾸기) → 수입/지출 스위치 → 무엇(항목 목록 + 직접 적기 칸) → 얼마, 맨 아래 [이 내역 지우기], 아래 고정 [저장]', () => {
    renderForm()

    expect(screen.getByRole('heading', { level: 1, name: '내역 고치기' })).toBeInTheDocument()
    const questions = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(questions).toEqual(['몇 월인가요?', '수입인가요, 지출인가요?', '무엇인가요?', '얼마인가요?'])
    expect(screen.getByRole('button', { name: '4월 바꾸기' })).toBeInTheDocument()
    expect(screen.getByTestId('segmented-control')).toBeInTheDocument()
    expect(screen.getByTestId('amount-display')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이 내역 지우기' })).toBeInTheDocument()
    expect(within(screen.getByTestId('bottom-action-bar')).getByRole('button', { name: '저장' })).toBeInTheDocument()
  })

  it('AC-6 그 기록 값이 채워진 채로 열리고, 지금 이름은 항목 목록에서 체크된다', () => {
    renderForm()

    expect(within(typeGroup()).getByRole('button', { name: '수입' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(itemList()).getByRole('button', { name: '회비 수입' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('직접 적기')).toHaveValue('회비')
    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('140,000')
    expect(saveButton()).toBeEnabled()
  })

  it('"직접 적기" 는 질문이 아니라 입력칸 보조 이름이다', () => {
    renderForm()

    const nameField = screen.getByLabelText('직접 적기').closest('[data-testid="text-field"]')
    expect(nameField).toHaveAttribute('data-label-role', 'label')
    expect(screen.queryByRole('heading', { name: '직접 적기' })).not.toBeInTheDocument()
  })

  describe('몇 월', () => {
    it('[바꾸기] 를 누르면 열두 달 선택 창이 열리고, 고르면 창이 닫히며 그 달로 바뀐다', async () => {
      renderForm()

      await userEvent.click(screen.getByRole('button', { name: '4월 바꾸기' }))
      const sheet = screen.getByRole('dialog', { name: '몇 월인가요?' })
      expect(within(sheet).getByRole('button', { name: '4월' })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(within(sheet).getByRole('button', { name: '3월' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '3월 바꾸기' })).toBeInTheDocument()
    })

    it('선택 창이 열려 있을 때 뒤로 버튼은 선택 창만 닫는다', async () => {
      const { onBack } = renderForm()
      await userEvent.click(screen.getByRole('button', { name: '4월 바꾸기' }))

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
      })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: '내역 고치기' })).toBeInTheDocument()
      expect(onBack).not.toHaveBeenCalled()
    })
  })

  describe('항목', () => {
    it('항목 목록은 고른 종류의 항목만 보여 주고, 종류를 바꾸면 그 종류의 목록이 된다', async () => {
      renderForm()
      expect(itemNames()).toEqual(['찬조금 수입', '회비 수입'])

      await userEvent.click(within(typeGroup()).getByRole('button', { name: '지출' }))

      expect(itemNames()).toEqual(['꽃값 지출', '대관료 지출', '간식비 지출'])
    })

    it('AC-4 항목을 누르면 이름 칸이 채워지고 체크된다', async () => {
      renderForm()

      await userEvent.click(within(itemList()).getByRole('button', { name: '찬조금 수입' }))

      expect(screen.getByLabelText('직접 적기')).toHaveValue('찬조금')
      expect(within(itemList()).getByRole('button', { name: '찬조금 수입' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(itemList()).getByRole('button', { name: '회비 수입' })).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('AC-5 빠진 것이 있으면 [저장] 비활성 + 안내 (한 번에 하나, 위에서부터)', () => {
    it('이름을 지우면 "무엇인지 적어 주세요"', async () => {
      renderForm()

      await userEvent.clear(screen.getByLabelText('직접 적기'))

      expect(saveButton()).toBeDisabled()
      expect(saveButton()).toHaveAccessibleDescription('무엇인지 적어 주세요')
    })

    it('금액을 지우면 "얼마인지 적어 주세요"', async () => {
      renderForm()

      await userEvent.clear(screen.getByLabelText('얼마인가요?'))

      expect(saveButton()).toHaveAccessibleDescription('얼마인지 적어 주세요')
    })
  })

  it('AC-6 고쳐서 [저장] 을 누르면 고친 달·종류·이름·금액을 넘긴다', async () => {
    const { onSave } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: '4월 바꾸기' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '5월' }))
    await userEvent.click(within(typeGroup()).getByRole('button', { name: '지출' }))
    await userEvent.click(within(itemList()).getByRole('button', { name: '꽃값 지출' }))
    await userEvent.click(screen.getByRole('button', { name: '1만 원 더하기' }))
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledWith({ month: 5, type: 'expense', name: '꽃값', amount: 150_000 })
  })

  describe('적던 내용 (닫기 전 확인)', () => {
    it('처음엔 바뀐 것이 없다고 알리고, 하나라도 바꾸면 바뀌었다고 알린다', async () => {
      const { onDirtyChange } = renderForm()
      expect(onDirtyChange).toHaveBeenLastCalledWith(false)

      await userEvent.click(within(typeGroup()).getByRole('button', { name: '지출' }))

      expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    })

    it('바꾼 값을 처음 값으로 되돌리면 다시 바뀐 것이 없다고 알린다', async () => {
      const { onDirtyChange } = renderForm()

      await userEvent.click(within(typeGroup()).getByRole('button', { name: '지출' }))
      expect(onDirtyChange).toHaveBeenLastCalledWith(true)
      await userEvent.click(within(typeGroup()).getByRole('button', { name: '수입' }))

      expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })
  })

  it('[← 장부로] 를 누르면 닫는다', async () => {
    const { onBack, onSave } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: '장부로' }))

    expect(onBack).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  describe('AC-7 지우기', () => {
    it('[이 내역 지우기] 를 누르면 "이 내역을 정말 지울까요?" 를 묻고, [아니요] 면 지우지 않는다', async () => {
      const { onDelete } = renderForm()

      await userEvent.click(screen.getByRole('button', { name: '이 내역 지우기' }))

      const dialog = screen.getByRole('alertdialog', { name: '이 내역을 정말 지울까요?' })
      expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('data-variant', 'danger')
      await userEvent.click(within(dialog).getByRole('button', { name: '아니요' }))

      expect(onDelete).not.toHaveBeenCalled()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByLabelText('직접 적기')).toHaveValue('회비')
    })

    it('확인 창에서 [지우기] 를 눌러야 지운다', async () => {
      const { onDelete } = renderForm()

      await userEvent.click(screen.getByRole('button', { name: '이 내역 지우기' }))
      expect(onDelete).not.toHaveBeenCalled()
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))

      expect(onDelete).toHaveBeenCalledOnce()
    })
  })
})
