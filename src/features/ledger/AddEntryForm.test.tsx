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
const dayField = () => screen.getByRole('textbox', { name: '며칠인가요?' })
const chipRow = () => screen.queryByRole('group', { name: '빠른 날짜' })
const chips = () => within(screen.getByRole('group', { name: '빠른 날짜' })).getAllByRole('button').map((chip) => chip.textContent)
// "지금 적는 내역" 카드 답한 줄의 값 (위에서부터 날짜 / 항목)
const answers = () => screen.queryAllByTestId('entry-card-value').map((value) => value.textContent)
const actionButton = () => within(screen.getByTestId('bottom-action-bar')).getByRole('button')
const question = () => screen.getByRole('heading', { level: 2 })

// "며칠인가요?" 날 숫자 칸에 날을 치고 [다음] 을 누른다 (칸에 있던 글자는 지운다)
async function pickDay(day: number) {
  await userEvent.clear(dayField())
  await userEvent.type(dayField(), String(day))
  await userEvent.click(actionButton())
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
    it('AC-3 처음에는 "지금 적는 내역" 카드에 보던 달만 있는 날짜 줄과 "며칠인가요?" 날 숫자 칸(빈칸)이 보이고, 숫자 키패드가 바로 뜬다', () => {
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
      // 날은 미리 채우지 않는다 (매번 친다)
      expect(dayField()).toHaveValue('')
      expect(dayField()).toHaveAttribute('inputmode', 'numeric')
      expect(dayField()).toHaveFocus()
    })

    it('지금 질문(제목 + 날 숫자 칸)은 카드 안, 날짜 줄 아래에 있다', () => {
      renderForm()

      const now = within(screen.getByRole('region', { name: '지금 적는 내역' })).getByTestId('entry-card-question')
      expect(within(now).getByRole('heading', { level: 2, name: '며칠인가요?' })).toBe(question())
      expect(within(now).getByTestId('day-input')).toBeInTheDocument()
    })

    it('빈칸이면 아래 [다음] 비활성 + "며칠인지 적어 주세요"', () => {
      renderForm()

      expect(actionButton()).toHaveAccessibleName('다음')
      expect(actionButton()).toBeDisabled()
      expect(actionButton()).toHaveAccessibleDescription('며칠인지 적어 주세요')
    })

    it('숫자만 두 자리까지 쳐진다', async () => {
      renderForm()

      await userEvent.type(dayField(), '1a23')

      expect(dayField()).toHaveValue('12')
    })

    it('날을 치고 [다음] 을 누르면 날짜 줄이 "10월 7일" 로 접히고 "무엇인가요?" 로 넘어간다', async () => {
      renderForm()

      await userEvent.type(dayField(), '7')
      expect(answers()).toEqual(['10월'])
      await userEvent.click(actionButton())

      expect(answers()).toEqual(['10월 7일'])
      expect(screen.getByRole('button', { name: '날짜 바꾸기' })).toBeInTheDocument()
      expect(question()).toHaveTextContent('무엇인가요?')
      expect(screen.queryByTestId('day-input')).not.toBeInTheDocument()
    })

    it('키패드 [완료](Enter) 로도 다음으로 넘어간다', async () => {
      renderForm()

      await userEvent.type(dayField(), '7{Enter}')

      expect(question()).toHaveTextContent('무엇인가요?')
      expect(answers()).toEqual(['10월 7일'])
    })

    it.each([
      ['0', '10월은 31일까지 있어요'],
      ['32', '10월은 31일까지 있어요'],
    ])('그 달에 없는 날 "%s" 이면 [다음] 비활성 + "%s", Enter 로도 넘어가지 않는다', async (text, missing) => {
      renderForm()

      await userEvent.type(dayField(), `${text}{Enter}`)

      expect(actionButton()).toBeDisabled()
      expect(actionButton()).toHaveAccessibleDescription(missing)
      expect(question()).toHaveTextContent('며칠인가요?')
    })

    it.each([
      [2026, '29', '2월은 28일까지 있어요'],
      [2028, '30', '2월은 29일까지 있어요'],
    ])('%i년 2월에 "%s" 이면 "%s"', async (year, text, missing) => {
      renderForm(2, [], year)

      await userEvent.type(dayField(), text)

      expect(actionButton()).toHaveAccessibleDescription(missing)
    })

    it('윤년(2028년) 장부의 2월 29일은 적을 수 있다', async () => {
      renderForm(2, [], 2028)

      await pickDay(29)

      expect(answers()).toEqual(['2월 29일'])
    })

    it('올해 장부의 이번 달이면 칸 아래 [오늘 7일] 칩이 있고, 누르면 그 날로 정해지며 바로 "무엇인가요?" 로 넘어간다', async () => {
      renderForm(10)

      expect(chips()).toEqual(['오늘 7일'])
      await userEvent.click(screen.getByRole('button', { name: '오늘 7일' }))

      expect(answers()).toEqual(['10월 7일'])
      expect(question()).toHaveTextContent('무엇인가요?')
    })

    it('이번 달이 아니면 칩 줄이 없다', async () => {
      renderForm(10)

      await pickMonth(10, 9)

      expect(chipRow()).not.toBeInTheDocument()
    })

    it('[10월 ▾] 를 누르면 "몇 월인가요?" 선택 창이 열리고, 고르면 닫히며 그 달의 날을 묻는다', async () => {
      renderForm()

      await userEvent.click(screen.getByRole('button', { name: '10월 달 바꾸기' }))
      const sheet = screen.getByRole('dialog', { name: '몇 월인가요?' })
      expect(within(sheet).getByRole('button', { name: '10월' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(sheet).getByRole('button', { name: '10월' })).toHaveAttribute('aria-current', 'date')
      await userEvent.click(within(sheet).getByRole('button', { name: '4월' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(answers()).toEqual(['4월'])
      expect(question()).toHaveTextContent('며칠인가요?')
      await userEvent.type(dayField(), '31')
      expect(actionButton()).toHaveAccessibleDescription('4월은 30일까지 있어요')
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
    it('날짜 줄 [바꾸기] 를 누르면 "며칠인가요?" 로 돌아가고(칸에 지금 날), 항목·금액은 그대로 날을 고쳐 [다음] 을 누르면 금액으로 돌아온다', async () => {
      const { onSave } = renderForm()
      await pickDay(7)
      await userEvent.click(within(itemList()).getByRole('button', { name: '대관료 지출' }))
      await userEvent.type(screen.getByLabelText('얼마인가요?'), '40000')

      await userEvent.click(screen.getByRole('button', { name: '날짜 바꾸기' }))

      expect(question()).toHaveTextContent('며칠인가요?')
      expect(answers()).toEqual(['10월 7일', '대관료 · 지출'])
      expect(dayField()).toHaveValue('7')
      expect(dayField()).toHaveFocus()
      await pickDay(9)

      expect(question()).toHaveTextContent('얼마인가요?')
      expect(screen.getByLabelText('얼마인가요?')).toHaveValue('40,000')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))
      expect(onSave).toHaveBeenCalledWith({ month: 10, day: 9, type: 'expense', name: '대관료', amount: 40_000 })
    })

    it('달을 바꿔 그 날이 그 달에 없으면(31일 → 2월) 칸과 날을 비우고 다시 묻는다', async () => {
      renderForm()
      await pickDay(31)
      await userEvent.click(screen.getByRole('button', { name: '날짜 바꾸기' }))

      await pickMonth(10, 2)

      expect(answers()).toEqual(['2월'])
      expect(dayField()).toHaveValue('')
      expect(question()).toHaveTextContent('며칠인가요?')
    })

    it('달을 바꿔도 그 날이 그 달에 있으면 날짜 줄과 칸에 남고, [다음] 으로 넘어간다', async () => {
      renderForm()
      await pickDay(7)
      await userEvent.click(screen.getByRole('button', { name: '날짜 바꾸기' }))

      await pickMonth(10, 3)

      expect(answers()).toEqual(['3월 7일'])
      expect(dayField()).toHaveValue('7')
      await userEvent.click(actionButton())
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

    it('날만 정해도 적던 내용이 있다고 알린다', async () => {
      const { onDirtyChange } = renderForm()

      await pickDay(7)

      expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    })

    it('날 숫자 칸에 글자만 쳐도 알리고, 지우면 다시 없다고 알린다', async () => {
      const { onDirtyChange } = renderForm()

      await userEvent.type(dayField(), '3')
      expect(onDirtyChange).toHaveBeenLastCalledWith(true)

      await userEvent.clear(dayField())
      expect(onDirtyChange).toHaveBeenLastCalledWith(false)
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

    it('AC-24 이어서 적을 때도 "며칠인가요?" 부터 빈칸으로 묻고, 날 숫자 칸에 포커스가 있다 ("이어서 적을 것" 표시 없음)', () => {
      renderForm(10, [RENT])

      expect(screen.queryByText('이어서 적을 것')).not.toBeInTheDocument()
      expect(question()).toHaveTextContent('며칠인가요?')
      expect(answers()).toEqual(['10월'])
      expect(dayField()).toHaveValue('')
      expect(dayField()).toHaveFocus()
    })

    it('AC-24 방금 저장한 내역이 같은 달이면 [오늘 7일] 옆에 [방금 5일] 칩, 누르면 그 날로 바로 넘어간다', async () => {
      renderForm(10, [RENT, SNACK])

      expect(chips()).toEqual(['오늘 7일', '방금 5일'])
      await userEvent.click(screen.getByRole('button', { name: '방금 5일' }))

      expect(answers()).toEqual(['10월 5일'])
      expect(question()).toHaveTextContent('무엇인가요?')
    })

    it('AC-24 방금 저장한 날이 오늘이면 [방금 7일] 하나만', () => {
      renderForm(10, [{ ...SNACK, day: 7 }])

      expect(chips()).toEqual(['방금 7일'])
    })

    it('방금 저장한 달과 다른 달로 바꾸면 [방금] 칩이 없다', async () => {
      renderForm(3, [{ ...RENT, month: 3 }])
      expect(chips()).toEqual(['방금 3일'])

      await pickMonth(3, 11)

      expect(chipRow()).not.toBeInTheDocument()
    })

    it('AC-21 날 숫자 칸이 빈 "며칠인가요?" 와 항목 고르기 단계에서는 아래에 [다 적었어요](보조 버튼)가 고정되고, 누르면 닫는다', async () => {
      const { onBack } = renderForm(10, [RENT])

      expect(actionButton()).toHaveAccessibleName('다 적었어요')
      expect(actionButton()).toHaveAttribute('data-variant', 'secondary')
      await pickDay(3)
      expect(actionButton()).toHaveAccessibleName('다 적었어요')
      await userEvent.click(actionButton())

      expect(onBack).toHaveBeenCalledOnce()
    })

    it('AC-21 날을 치기 시작하면 [다 적었어요] 대신 [다음] 이 보이고, 지우면 다시 [다 적었어요]', async () => {
      renderForm(10, [RENT])

      await userEvent.type(dayField(), '3')
      expect(within(screen.getByTestId('bottom-action-bar')).getAllByRole('button')).toHaveLength(1)
      expect(actionButton()).toHaveAccessibleName('다음')

      await userEvent.clear(dayField())
      expect(actionButton()).toHaveAccessibleName('다 적었어요')
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
