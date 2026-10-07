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

type HarnessProps = { year: number; month: number; saved: EntryInput[]; handlers: Handlers }

// 선택 창은 App 처럼 방문 기록 훅이 연다. 오늘은 2026년 10월 7일
function Harness({ year, month, saved, handlers }: HarnessProps) {
  const sheets = useScreenHistory()
  return (
    <AddEntryForm
      year={year}
      month={month}
      saved={saved}
      currentMonth={10}
      currentDay={7}
      frequentChoices={(type?: EntryType) => frequentChoices(HISTORY, type)}
      lastUsedType={(name) => lastUsedType(HISTORY, name)}
      sheets={sheets}
      onSave={handlers.onSave}
      onBack={handlers.onBack}
      onDirtyChange={handlers.onDirtyChange}
    />
  )
}

// saved: 이번에 내역 적기 화면에 들어와 이미 저장한 내역 (연달아 적기)
function renderForm(month = 10, saved: EntryInput[] = [], year = 2026) {
  const handlers = makeHandlers()
  render(<Harness year={year} month={month} saved={saved} handlers={handlers} />)
  return handlers
}

const itemList = () => screen.getByRole('group', { name: '자주 쓴 항목' })
const dayGrid = () => screen.getByTestId('day-picker')
const dayButtons = () => within(dayGrid()).getAllByRole('button')
// "지금 적는 내역" 카드 답한 줄의 값 (위에서부터 날짜 / 항목)
const answers = () => screen.queryAllByTestId('entry-card-value').map((value) => value.textContent)
const actionButton = () => within(screen.getByTestId('bottom-action-bar')).getByRole('button')
const question = () => screen.getByRole('heading', { level: 2 })

// "며칠인가요?" 날 격자에서 날을 누른다 ("방금" 이 붙은 칸도)
async function pickDay(day: number) {
  await userEvent.click(within(dayGrid()).getByRole('button', { name: new RegExp(`^${day}일`) }))
}

// 날을 골라 "무엇인가요?" 로 넘어간다
async function renderAtItem(month = 10, saved: EntryInput[] = []) {
  const handlers = renderForm(month, saved)
  await pickDay(5)
  return handlers
}

async function writeCustomName(name: string) {
  await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))
  await userEvent.type(screen.getByLabelText('직접 적기'), name)
  await userEvent.click(screen.getByRole('button', { name: '다음' }))
}

// "며칠인가요?" 의 [10월 ▾] → 열두 달 선택 창에서 고른다
async function pickMonth(current: number, next: number) {
  await userEvent.click(screen.getByRole('button', { name: `${current}월 달 바꾸기` }))
  await userEvent.click(within(screen.getByRole('dialog', { name: '몇 월인가요?' })).getByRole('button', { name: `${next}월` }))
}

describe('SPEC-001 내역 적기 (하나씩 채우기)', () => {
  describe('AC-24 며칠인가요? (0단계)', () => {
    it('AC-3 처음에는 "지금 적는 내역" 카드에 보던 달만 있는 날짜 줄과 "며칠인가요?" 날 격자만 보인다 (아래 버튼 없음)', () => {
      renderForm(9)

      expect(screen.getByRole('heading', { level: 1, name: '내역 적기' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: '지금 적는 내역' })).toBeInTheDocument()
      expect(answers()).toEqual(['9월'])
      expect(screen.getAllByTestId('entry-card-label').map((label) => label.textContent)).toEqual(['날짜'])
      // 지금 묻고 있는 날짜 줄에는 [바꾸기] 가 없다 (질문 제목 옆 [9월 ▾] 로 달을 바꾼다)
      expect(screen.queryByRole('button', { name: '날짜 바꾸기' })).not.toBeInTheDocument()
      expect(question()).toHaveTextContent('며칠인가요?')
      expect(screen.getByRole('button', { name: '9월 달 바꾸기' })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: '자주 쓴 항목' })).not.toBeInTheDocument()
      expect(screen.queryByTestId('bottom-action-bar')).not.toBeInTheDocument()
    })

    it('그 달의 날만 격자에 있다: 10월은 31일까지, 2026년 2월은 28일까지, 윤년(2028년) 2월은 29일까지', () => {
      renderForm(10)
      expect(dayButtons()).toHaveLength(31)
      expect(screen.getByRole('group', { name: '10월 날짜' })).toBe(dayGrid())
    })

    it.each([
      [2026, 28],
      [2028, 29],
    ])('%i년 2월 격자는 %i일까지', (year, last) => {
      renderForm(2, [], year)

      expect(dayButtons()).toHaveLength(last)
      expect(dayButtons().at(-1)).toHaveAccessibleName(`${last}일`)
    })

    it('지금 질문(제목 + 날 격자)은 카드 안, 날짜 줄 아래에 있다', () => {
      renderForm()

      const now = within(screen.getByRole('region', { name: '지금 적는 내역' })).getByTestId('entry-card-question')
      expect(within(now).getByRole('heading', { level: 2, name: '며칠인가요?' })).toBe(question())
      expect(within(now).getByTestId('day-picker')).toBeInTheDocument()
    })

    it('올해 장부의 이번 달이면 오늘 날에 테두리, 다른 달이면 없다', async () => {
      renderForm(10)

      expect(within(dayGrid()).getByRole('button', { name: '7일' })).toHaveAttribute('aria-current', 'date')
      await pickMonth(10, 9)
      expect(dayGrid().querySelector('[aria-current]')).not.toBeInTheDocument()
    })

    it('날은 미리 골라 두지 않는다 (매번 누른다)', () => {
      renderForm()

      expect(dayGrid().querySelector('[aria-pressed="true"]')).not.toBeInTheDocument()
    })

    it('날을 누르면 날짜 줄이 "10월 7일" 로 접히고 "무엇인가요?" 로 넘어간다', async () => {
      renderForm()

      await pickDay(7)

      expect(answers()).toEqual(['10월 7일'])
      expect(screen.getByRole('button', { name: '날짜 바꾸기' })).toBeInTheDocument()
      expect(question()).toHaveTextContent('무엇인가요?')
      expect(screen.queryByTestId('day-picker')).not.toBeInTheDocument()
    })

    it('[10월 ▾] 를 누르면 "몇 월인가요?" 선택 창이 열리고, 고르면 닫히며 그 달의 날 격자가 된다', async () => {
      renderForm()

      await userEvent.click(screen.getByRole('button', { name: '10월 달 바꾸기' }))
      const sheet = screen.getByRole('dialog', { name: '몇 월인가요?' })
      expect(within(sheet).getByRole('button', { name: '10월' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(sheet).getByRole('button', { name: '10월' })).toHaveAttribute('aria-current', 'date')
      await userEvent.click(within(sheet).getByRole('button', { name: '4월' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(answers()).toEqual(['4월'])
      expect(question()).toHaveTextContent('며칠인가요?')
      expect(dayButtons()).toHaveLength(30)
    })

    it('선택 창이 열려 있을 때 뒤로 버튼은 선택 창만 닫는다', async () => {
      const { onBack } = renderForm()
      await userEvent.click(screen.getByRole('button', { name: '10월 달 바꾸기' }))

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
      })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: '내역 적기' })).toBeInTheDocument()
      expect(onBack).not.toHaveBeenCalled()
    })
  })

  describe('AC-25 날짜 바꾸기', () => {
    it('날짜 줄 [바꾸기] 를 누르면 "며칠인가요?" 로 돌아가고(고른 날 표시), 항목·금액은 그대로 다시 날을 고르면 금액으로 돌아온다', async () => {
      const { onSave } = renderForm()
      await pickDay(7)
      await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '40000')

      await userEvent.click(screen.getByRole('button', { name: '날짜 바꾸기' }))

      expect(question()).toHaveTextContent('며칠인가요?')
      expect(answers()).toEqual(['10월 7일', '대관료 · 지출'])
      expect(within(dayGrid()).getByRole('button', { name: '7일' })).toHaveAttribute('aria-pressed', 'true')
      await pickDay(9)

      expect(question()).toHaveTextContent('얼마인가요?')
      expect(screen.getByLabelText('얼마인가요?')).toHaveValue('40,000')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))
      expect(onSave).toHaveBeenCalledWith({ month: 10, day: 9, type: 'expense', name: '대관료', amount: 40_000 })
    })

    it('달을 바꿔 고른 날이 그 달에 없으면(31일 → 2월) 날을 비우고 다시 묻는다', async () => {
      renderForm()
      await pickDay(31)
      await userEvent.click(screen.getByRole('button', { name: '날짜 바꾸기' }))

      await pickMonth(10, 2)

      expect(answers()).toEqual(['2월'])
      expect(dayGrid().querySelector('[aria-pressed="true"]')).not.toBeInTheDocument()
      expect(question()).toHaveTextContent('며칠인가요?')
    })

    it('달을 바꿔도 고른 날이 그 달에 있으면 날짜 줄에 남는다 (다시 날을 눌러 넘어간다)', async () => {
      renderForm()
      await pickDay(7)
      await userEvent.click(screen.getByRole('button', { name: '날짜 바꾸기' }))

      await pickMonth(10, 3)

      expect(answers()).toEqual(['3월 7일'])
      await pickDay(7)
      expect(question()).toHaveTextContent('무엇인가요?')
    })
  })

  it('항목 목록은 원형 아이콘 + 이름 + 오른쪽 수입/지출, 최근 사용 순 최대 6개 + 맨 아래 [직접 적기]', async () => {
    await renderAtItem()

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

  it('AC-23 지금 질문(제목 + 항목 목록 + 안내)은 "지금 적는 내역" 카드 안, 답한 줄 아래에 있고 "지금 적을 것" 표시는 없다', async () => {
    await renderAtItem()

    const card = screen.getByRole('region', { name: '지금 적는 내역' })
    const now = within(card).getByTestId('entry-card-question')
    expect(within(now).getByRole('heading', { level: 2, name: '무엇인가요?' })).toBe(question())
    expect(within(now).getByRole('group', { name: '자주 쓴 항목' })).toBeInTheDocument()
    expect(within(now).getByText('누르면 바로 다음으로 넘어가요')).toBeInTheDocument()
    expect(within(card).getByTestId('entry-card-row').compareDocumentPosition(now)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.queryByText('지금 적을 것')).not.toBeInTheDocument()
  })

  it('AC-23 직접 적기 이름 칸·[목록에서 고르기], 수입/지출 스위치, 금액 칸도 카드 안 지금 질문 칸에 있다', async () => {
    await renderAtItem()
    const now = () => screen.getByTestId('entry-card-question')

    await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))
    expect(within(now()).getByLabelText('직접 적기')).toBeInTheDocument()
    expect(within(now()).getByRole('button', { name: '목록에서 고르기' })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('직접 적기'), '새항목')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(within(now()).getByRole('group', { name: '수입인가요, 지출인가요?' })).toBeInTheDocument()

    await userEvent.click(within(now()).getByRole('button', { name: '지출' }))
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(within(now()).getByLabelText('얼마인가요?')).toBeInTheDocument()
    expect(within(now()).getByRole('button', { name: '1만 원 더하기' })).toBeInTheDocument()
  })

  it('AC-4 항목을 누르면 카드에 항목 줄("대관료 · 지출", 항목 아이콘)이 쌓이고 "얼마인가요?" 로 넘어간다', async () => {
    await renderAtItem()

    await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

    expect(answers()).toEqual(['10월 5일', '대관료 · 지출'])
    expect(screen.getAllByTestId('entry-card-label').map((label) => label.textContent)).toEqual(['날짜', '항목'])
    expect(screen.getAllByTestId('entry-card-value')[1].querySelector('[data-icon="building"]')).toBeInTheDocument()
    expect(question()).toHaveTextContent('얼마인가요?')
    expect(screen.queryByRole('group', { name: '자주 쓴 항목' })).not.toBeInTheDocument()
  })

  it('AC-10 "얼마인가요?" 는 숫자 키패드 칸이 바로 포커스를 받고, [저장] 이 아래에 있다', async () => {
    await renderAtItem()

    await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

    const amount = screen.getByLabelText('얼마인가요?')
    expect(amount).toHaveAttribute('inputmode', 'numeric')
    expect(amount).toHaveFocus()
    expect(actionButton()).toHaveAccessibleName('저장')
  })

  it('AC-5 금액이 0 이면 [저장] 비활성 + "얼마인지 적어 주세요"', async () => {
    await renderAtItem()

    await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

    expect(actionButton()).toBeDisabled()
    expect(actionButton()).toHaveAccessibleDescription('얼마인지 적어 주세요')
  })

  it('AC-1 금액을 적고 [저장] 하면 달·날짜·종류·이름·금액을 넘긴다', async () => {
    const { onSave } = await renderAtItem()

    await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))
    await userEvent.type(screen.getByLabelText('얼마인가요?'), '40000')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onSave).toHaveBeenCalledWith({ month: 10, day: 5, type: 'expense', name: '대관료', amount: 40_000 })
  })

  it('AC-17 [+1만] [+5만] [+10만] 은 지금 금액에 더한다', async () => {
    await renderAtItem()
    await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

    await userEvent.click(screen.getByRole('button', { name: '1만 원 더하기' }))
    await userEvent.click(screen.getByRole('button', { name: '5만 원 더하기' }))
    await userEvent.click(screen.getByRole('button', { name: '10만 원 더하기' }))

    expect(screen.getByLabelText('얼마인가요?')).toHaveValue('160,000')
  })

  describe('직접 적기', () => {
    it('AC-5 [직접 적기] 를 누르면 이름 칸이 나오고, 비어 있으면 [다음] 비활성 + "무엇인지 적어 주세요"', async () => {
      await renderAtItem()

      await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))

      expect(screen.getByLabelText('직접 적기')).toHaveFocus()
      expect(actionButton()).toHaveAccessibleName('다음')
      expect(actionButton()).toBeDisabled()
      expect(actionButton()).toHaveAccessibleDescription('무엇인지 적어 주세요')
    })

    it('AC-15 처음 쓰는 이름이면 "수입인가요, 지출인가요?" 를 기본값 없이 묻고, 안 골랐으면 [다음] 비활성 + 안내', async () => {
      await renderAtItem()

      await writeCustomName(' 화환 ')

      expect(question()).toHaveTextContent('수입인가요, 지출인가요?')
      const kinds = within(screen.getByRole('group', { name: '수입인가요, 지출인가요?' })).getAllByRole('button')
      expect(kinds.map((kind) => kind.textContent)).toEqual(['수입', '지출'])
      expect(kinds.every((kind) => kind.getAttribute('aria-pressed') === 'false')).toBe(true)
      // 지금 묻는 수입/지출은 카드에 올리지 않는다: 항목 줄은 이름만
      expect(answers()).toEqual(['10월 5일', '화환'])
      expect(actionButton()).toBeDisabled()
      expect(actionButton()).toHaveAccessibleDescription('수입인지 지출인지 골라 주세요')
    })

    it('AC-15 새 이름의 종류를 고르고 [다음] 을 누르면 금액으로 넘어가 저장된다', async () => {
      const { onSave } = await renderAtItem()
      await writeCustomName('화환')

      await userEvent.click(screen.getByRole('button', { name: '지출' }))
      await userEvent.click(screen.getByRole('button', { name: '다음' }))
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '30000')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(onSave).toHaveBeenCalledWith({ month: 10, day: 5, type: 'expense', name: '화환', amount: 30_000 })
    })

    it('AC-15 예전에 쓴 이름이면 묻지 않고 그때 종류로 정해 금액으로 넘어간다', async () => {
      await renderAtItem()

      await writeCustomName('찬조금')

      expect(question()).toHaveTextContent('얼마인가요?')
      expect(answers()).toEqual(['10월 5일', '찬조금 · 수입'])
    })

    it('이름 칸에서 키패드 [완료](Enter) 로도 다음으로 넘어간다', async () => {
      await renderAtItem()
      await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))

      await userEvent.type(screen.getByLabelText('직접 적기'), '찬조금{Enter}')

      expect(question()).toHaveTextContent('얼마인가요?')
    })

    it('AC-4 이름을 적는 동안에는 적는 중인 이름을 카드에 올리지 않는다', async () => {
      await renderAtItem()
      await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))

      await userEvent.type(screen.getByLabelText('직접 적기'), '화환')

      expect(answers()).toEqual(['10월 5일'])
    })

    it('잘못 눌렀으면 [목록에서 고르기] 로 항목 목록에 돌아간다', async () => {
      await renderAtItem()
      await userEvent.click(within(itemList()).getByRole('button', { name: '직접 적기' }))

      await userEvent.click(screen.getByRole('button', { name: '목록에서 고르기' }))

      expect(itemList()).toBeInTheDocument()
    })
  })

  describe('AC-16 항목 줄 [바꾸기]', () => {
    it('[항목 바꾸기] 를 누르면 항목 고르기로 돌아가고(지금 이름 체크), 다른 항목을 골라도 금액은 그대로다', async () => {
      const { onSave } = await renderAtItem()
      await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '40000')

      await userEvent.click(screen.getByRole('button', { name: '항목 바꾸기' }))
      expect(within(itemList()).getByRole('button', { name: '대관료 지출' })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(within(itemList()).getByRole('button', { name: '회비 수입' }))

      expect(screen.getByLabelText('얼마인가요?')).toHaveValue('40,000')
      expect(answers()).toEqual(['10월 5일', '회비 · 수입'])
      await userEvent.click(screen.getByRole('button', { name: '저장' }))
      expect(onSave).toHaveBeenCalledWith({ month: 10, day: 5, type: 'income', name: '회비', amount: 40_000 })
    })
  })

  describe('적던 내용 (버릴까요?)', () => {
    it('처음 상태(달만 있음)에서는 적던 내용이 없다고 알린다', () => {
      const { onDirtyChange } = renderForm()

      expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })

    it('날만 골라도 적던 내용이 있다고 알린다', async () => {
      const { onDirtyChange } = renderForm()

      await pickDay(7)

      expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    })

    it('달만 바꿔도 알리고, 처음 달로 되돌리면 다시 없다고 알린다', async () => {
      const { onDirtyChange } = renderForm()

      await pickMonth(10, 3)
      expect(onDirtyChange).toHaveBeenLastCalledWith(true)

      await pickMonth(3, 10)
      expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })
  })

  it('[← 장부로] 를 누르면 닫는다', async () => {
    const { onBack, onSave } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: '장부로' }))

    expect(onBack).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  describe('연달아 적기 (v2.1)', () => {
    const RENT: EntryInput = { month: 10, day: 3, type: 'expense', name: '대관료', amount: 40_000 }
    const SNACK: EntryInput = { month: 10, day: 5, type: 'expense', name: '간식비', amount: 28_340 }

    it('저장한 것이 없으면 "장부에 넣었어요" 목록과 [다 적었어요] 가 없다', () => {
      renderForm()

      expect(screen.queryByTestId('saved-entries')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '다 적었어요' })).not.toBeInTheDocument()
    })

    it('AC-20 저장한 것이 있으면 맨 위("지금 적는 내역" 카드 위)에 "장부에 넣었어요 · N건" 목록이 있고 방금 저장한 줄에 "방금" 이 붙는다', () => {
      renderForm(10, [RENT, SNACK])

      const card = screen.getByRole('region', { name: '장부에 넣었어요 · 2건' })
      expect(card.compareDocumentPosition(screen.getByTestId('entry-card'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      expect(within(card).getAllByTestId('saved-entries-row').map((row) => row.textContent)).toEqual([
        '대관료 −40,000원',
        '간식비 방금 −28,340원',
      ])
    })

    it('AC-24 이어서 적을 때도 "며칠인가요?" 부터 묻고 화면 읽기 초점은 그 제목에 있다 ("이어서 적을 것" 표시 없음)', () => {
      renderForm(10, [RENT])

      expect(screen.queryByText('이어서 적을 것')).not.toBeInTheDocument()
      expect(question()).toHaveTextContent('며칠인가요?')
      expect(question()).toHaveFocus()
    })

    it('AC-24 방금 저장한 날에 옅은 바탕 + "방금" 이 붙지만 미리 고르지는 않는다', () => {
      renderForm(10, [RENT, SNACK])

      const recent = within(dayGrid()).getByRole('button', { name: '5일 방금' })
      expect(recent).toHaveAttribute('data-recent', 'true')
      expect(recent).toHaveAttribute('aria-pressed', 'false')
      expect(answers()).toEqual(['10월'])
      expect(within(dayGrid()).getAllByText('방금')).toHaveLength(1)
    })

    it('방금 저장한 달과 다른 달로 바꾸면 "방금" 표시가 없다', async () => {
      renderForm(10, [RENT])

      await pickMonth(10, 11)

      expect(within(dayGrid()).queryByText('방금')).not.toBeInTheDocument()
    })

    it('AC-21 날 고르기·항목 고르기 단계에서는 아래에 [다 적었어요](보조 버튼)가 고정되고, 누르면 닫는다', async () => {
      const { onBack } = renderForm(10, [RENT])

      expect(actionButton()).toHaveAccessibleName('다 적었어요')
      expect(actionButton()).toHaveAttribute('data-variant', 'secondary')
      await pickDay(3)
      expect(actionButton()).toHaveAccessibleName('다 적었어요')
      await userEvent.click(actionButton())

      expect(onBack).toHaveBeenCalledOnce()
    })

    it('금액 단계에서는 [✓ 저장] 만 보이고 [다 적었어요] 는 없다', async () => {
      await renderAtItem(10, [RENT])

      await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))

      expect(within(screen.getByTestId('bottom-action-bar')).getAllByRole('button')).toHaveLength(1)
      expect(actionButton()).toHaveAccessibleName('저장')
      expect(screen.queryByRole('button', { name: '다 적었어요' })).not.toBeInTheDocument()
    })
  })
})
