import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { frequentChoices } from '../../domain/ledger'
import type { Entry, EntryType } from '../../domain/types'
import { EntryForm } from './EntryForm'
import { emptyDraft, type EntryDraft } from './entryDraft'

// 지난 기록: 회비(수입)를 가장 최근에, 그 전에 꽃값·대관료(지출)를 썼다
const HISTORY: Entry[] = [
  { id: '1', month: 9, type: 'expense', name: '대관료', amount: 40_000, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: '2', month: 9, type: 'expense', name: '꽃값', amount: 20_000, createdAt: '2026-09-02T00:00:00.000Z' },
  { id: '3', month: 9, type: 'income', name: '찬조금', amount: 50_000, createdAt: '2026-09-03T00:00:00.000Z' },
]

function renderForm(initial: EntryDraft = emptyDraft(9)) {
  const onSave = vi.fn()
  const onBack = vi.fn()
  render(
    <EntryForm
      title="내역 적기"
      initial={initial}
      frequentChoices={(type?: EntryType) => frequentChoices(HISTORY, type)}
      onSave={onSave}
      onBack={onBack}
    />,
  )
  return { onSave, onBack }
}

const saveButton = () => screen.getByRole('button', { name: '저장' })
const typeGroup = () => screen.getByRole('group', { name: '수입인가요, 지출인가요?' })
const choiceGroup = () => screen.getByRole('group', { name: '자주 쓴 항목' })
const choiceNames = () => within(choiceGroup()).getAllByRole('button').map((button) => button.textContent)

describe('SPEC-001 내역 적기', () => {
  it('위에서부터 몇 월 → 수입/지출 → 무엇 → 얼마 순서로 묻고, 맨 아래 고정 [저장] 이 있다', () => {
    renderForm()

    expect(screen.getByRole('heading', { level: 1, name: '내역 적기' })).toBeInTheDocument()
    const questions = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(questions).toEqual(['몇 월인가요?', '수입인가요, 지출인가요?', '무엇인가요?'])
    expect(screen.getByLabelText('얼마인가요?')).toBeInTheDocument()
    expect(within(screen.getByTestId('bottom-action-bar')).getByRole('button', { name: '저장' })).toBeInTheDocument()
  })

  it('AC-3 월 기본값은 장부에서 보고 있던 달이고, 1~12월 중 하나를 고른다', async () => {
    renderForm(emptyDraft(9))

    const months = within(screen.getByRole('group', { name: '몇 월인가요?' })).getAllByRole('button')
    expect(months.map((button) => button.textContent)).toEqual(Array.from({ length: 12 }, (_, index) => `${index + 1}월`))
    expect(screen.getByRole('button', { name: '9월' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: '3월' }))

    expect(screen.getByRole('button', { name: '3월' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '9월' })).toHaveAttribute('aria-pressed', 'false')
  })

  describe('AC-5 빠진 것이 있으면 [저장] 비활성 + 안내 (한 번에 하나, 위에서부터)', () => {
    it('수입/지출은 기본값이 없고, 안 골랐으면 "수입인지 지출인지 골라 주세요"', () => {
      renderForm()

      const kinds = within(typeGroup()).getAllByRole('button')
      expect(kinds.map((button) => button.textContent)).toEqual(['수입', '지출'])
      expect(kinds.every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
      expect(saveButton()).toBeDisabled()
      expect(saveButton()).toHaveAccessibleDescription('수입인지 지출인지 골라 주세요')
    })

    it('종류를 골랐는데 이름이 비었거나 공백뿐이면 "무엇인지 적어 주세요"', async () => {
      renderForm()

      await userEvent.click(within(typeGroup()).getByRole('button', { name: '지출' }))
      expect(saveButton()).toHaveAccessibleDescription('무엇인지 적어 주세요')

      await userEvent.type(screen.getByLabelText('직접 적기'), '   ')
      expect(saveButton()).toBeDisabled()
      expect(saveButton()).toHaveAccessibleDescription('무엇인지 적어 주세요')
    })

    it('이름까지 적었는데 금액이 비었으면 "얼마인지 적어 주세요"', async () => {
      renderForm()

      await userEvent.click(within(typeGroup()).getByRole('button', { name: '지출' }))
      await userEvent.type(screen.getByLabelText('직접 적기'), '간식비')

      expect(saveButton()).toBeDisabled()
      expect(saveButton()).toHaveAccessibleDescription('얼마인지 적어 주세요')
    })

    it('다 채우면 [저장] 을 누를 수 있고 안내가 사라진다', async () => {
      renderForm()

      await userEvent.click(within(typeGroup()).getByRole('button', { name: '지출' }))
      await userEvent.type(screen.getByLabelText('직접 적기'), '간식비')
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '28340')

      expect(saveButton()).toBeEnabled()
      expect(screen.queryByTestId('bottom-action-bar-note')).not.toBeInTheDocument()
    })
  })

  describe('자주 쓴 항목', () => {
    it('종류를 고르기 전엔 두 종류를 최근 사용 순으로 섞어 보여준다', () => {
      renderForm()

      expect(choiceNames()).toEqual(['찬조금', '꽃값', '대관료', '간식비', '회비'])
    })

    it('종류를 고른 뒤엔 그 종류만 보여준다', async () => {
      renderForm()

      await userEvent.click(within(typeGroup()).getByRole('button', { name: '수입' }))
      expect(choiceNames()).toEqual(['찬조금', '회비'])

      await userEvent.click(within(typeGroup()).getByRole('button', { name: '지출' }))
      expect(choiceNames()).toEqual(['꽃값', '대관료', '간식비'])
    })

    it('AC-4 항목 버튼을 누르면 이름 칸이 채워지고 그 항목을 마지막으로 쓴 종류가 자동 선택된다', async () => {
      renderForm()

      await userEvent.click(within(choiceGroup()).getByRole('button', { name: '꽃값' }))

      expect(screen.getByLabelText('직접 적기')).toHaveValue('꽃값')
      expect(within(typeGroup()).getByRole('button', { name: '지출' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(choiceGroup()).getByRole('button', { name: '꽃값' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('AC-4 기본 항목 회비는 수입으로 자동 선택된다', async () => {
      renderForm()

      await userEvent.click(within(choiceGroup()).getByRole('button', { name: '회비' }))

      expect(screen.getByLabelText('직접 적기')).toHaveValue('회비')
      expect(within(typeGroup()).getByRole('button', { name: '수입' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('AC-10 금액 칸은 숫자 키패드가 뜨는 칸이고 천 단위 콤마를 붙인다', async () => {
    renderForm()

    const amount = screen.getByLabelText('얼마인가요?')
    expect(amount).toHaveAttribute('inputmode', 'numeric')

    await userEvent.type(amount, '1234567')

    expect(amount).toHaveValue('1,234,567')
  })

  it('[저장] 을 누르면 고른 월·종류·이름·금액을 넘긴다', async () => {
    const { onSave } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: '3월' }))
    await userEvent.click(within(typeGroup()).getByRole('button', { name: '지출' }))
    await userEvent.type(screen.getByLabelText('직접 적기'), ' 간식비 ')
    await userEvent.type(screen.getByLabelText('얼마인가요?'), '28340')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledWith({ month: 3, type: 'expense', name: ' 간식비 ', amount: 28_340 })
  })

  it('처음 값을 넣으면 그 값이 채워진 채로 열린다 (고치기 화면 재사용, #14)', () => {
    renderForm({ month: 4, type: 'income', name: '회비', amount: 140_000 })

    expect(screen.getByRole('button', { name: '4월' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(typeGroup()).getByRole('button', { name: '수입' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('직접 적기')).toHaveValue('회비')
    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('140,000')
    expect(saveButton()).toBeEnabled()
  })

  it('[← 장부로] 를 누르면 닫는다', async () => {
    const { onBack, onSave } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: '장부로' }))

    expect(onBack).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })
})
