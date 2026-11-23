import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Ledger, StoredData } from './domain/types'
import type { LedgerRepository, LoadResult, SaveFailureReason } from './storage/LedgerRepository'
import { MemoryRepository } from './storage/MemoryRepository'
import { duesData, PAYERS_OFF_ROSTER, storedWith } from './test/ledgerFixtures'

// SPEC-002 v2.6 보강: 저장 실패 안내 문구 ① · 저장 안 된 줄의 "저장 안 됨" 알약 (#121)

const TODAY = new Date('2026-10-03T09:00:00.000+09:00')

const LEDGER_2026: Ledger = {
  year: 2026,
  carryover: 200_000,
  entries: [
    { id: 'a', month: 10, day: 1, type: 'income', name: '회비', amount: 140_000, createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 'b', month: 10, day: 2, type: 'expense', name: '대관료', amount: 40_000, createdAt: '2026-10-02T00:00:00.000Z' },
  ],
}

const SAVE_FAILED = '저장하지 못했어요. 방금 적은 내역은 앱을 닫으면 사라져요. 기록 파일을 보내 두세요'

// 저장 실패를 켰다 껐다 할 수 있는 저장소 (실패 이유는 고를 수 있다)
function switchable(data: StoredData, reason: SaveFailureReason = 'quota-exceeded') {
  const memory = new MemoryRepository(data)
  const state = { failing: true }
  const repository: LedgerRepository = {
    load: () => memory.load(),
    save: (next) => (state.failing ? { ok: false, reason } : memory.save(next)),
    restore: (next) => (state.failing ? { ok: false, reason } : memory.restore(next)),
  }
  return { repository, memory, state }
}

function renderApp(repository: LedgerRepository, loaded: LoadResult = repository.load()) {
  let seq = 0
  render(<App repository={repository} loaded={loaded} options={{ now: () => TODAY, createId: () => `id-${++seq}` }} />)
}

// 장부 화면 [+ 내역 적기] 로 3일에 처음 쓰는 이름의 지출 하나를 적어 저장한다
async function addExpense(name: string, amount: string) {
  await userEvent.click(screen.getByRole('button', { name: '내역 적기' }))
  const day = screen.getByRole('textbox', { name: '며칠인가요?' })
  await userEvent.clear(day)
  await userEvent.type(day, '3')
  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  const items = screen.getByRole('group', { name: '자주 쓴 항목' })
  await userEvent.click(within(items).getByRole('button', { name: '직접 적기' }))
  await userEvent.type(screen.getByLabelText('직접 적기'), name)
  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await userEvent.click(within(screen.getByRole('group', { name: '수입인가요, 지출인가요?' })).getByRole('button', { name: '지출' }))
  await userEvent.type(screen.getByLabelText('얼마인가요?'), amount)
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  // 저장에 성공하면 연달아 적기로 내역 적기 화면에 남으니 장부로 돌아간다 (실패하면 바로 장부로 돌아간다)
  const back = screen.queryByRole('button', { name: '장부로' })
  if (back) await userEvent.click(back)
  expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
}

// 기록 줄을 눌러 금액을 바꿔 저장한다
async function editAmount(rowName: RegExp, amount: string) {
  await userEvent.click(screen.getByRole('button', { name: rowName }))
  const field = screen.getByLabelText('얼마인가요?')
  await userEvent.clear(field)
  await userEvent.type(field, amount)
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
}

// "저장 안 됨" 알약이 붙은 줄의 이름(줄 제목)
function unsavedRowTitles() {
  return within(screen.getByTestId('month-card'))
    .getAllByTestId('list-row')
    .filter((row) => within(row).queryByTestId('list-row-badge'))
    .map((row) => row.querySelector('.ui-row__title')?.textContent)
}

describe('SPEC-002 v2.6 저장 실패 안내·저장 안 됨 표시', () => {
  it('AC-8 저장에 실패하면 장부 위 띠가 "방금 적은 내역은 앱을 닫으면 사라져요" 문구 + [기록 파일 보내기] 다', async () => {
    renderApp(switchable(storedWith(LEDGER_2026)).repository)

    await addExpense('간식비', '5000')

    const notice = screen.getByTestId('notice-bar')
    expect(within(notice).getByRole('alert')).toHaveTextContent(new RegExp(`^${SAVE_FAILED}$`))
    expect(within(notice).getByRole('button', { name: '기록 파일 보내기' })).toBeInTheDocument()
  })

  it('AC-9 저장에 실패한 뒤 추가한 줄에 "저장 안 됨" 알약이 붙고 화면 읽기 이름 끝에 "저장 안 됨" 이 읽힌다', async () => {
    renderApp(switchable(storedWith(LEDGER_2026)).repository)

    await addExpense('간식비', '5000')

    expect(screen.getByRole('button', { name: '간식비 3일 · 지출 −5,000원 저장 안 됨' })).toBeInTheDocument()
    expect(unsavedRowTitles()).toEqual(['간식비'])
    const badge = screen.getByTestId('list-row-badge')
    expect(badge).toHaveTextContent('저장 안 됨')
    // 저장된 줄은 그대로
    expect(screen.getByRole('button', { name: '대관료 2일 · 지출 −40,000원' })).toBeInTheDocument()
  })

  it('AC-9 저장에 실패한 뒤 고친 줄에도 "저장 안 됨" 이 붙는다', async () => {
    renderApp(switchable(storedWith(LEDGER_2026)).repository)

    await editAmount(/^대관료/, '45000')

    expect(screen.getByRole('button', { name: '대관료 2일 · 지출 −45,000원 저장 안 됨' })).toBeInTheDocument()
    expect(unsavedRowTitles()).toEqual(['대관료'])
  })

  it('AC-10 그 뒤 저장이 한 번 성공하면 모든 "저장 안 됨" 알약과 띠가 사라진다', async () => {
    const { repository, memory, state } = switchable(storedWith(LEDGER_2026))
    renderApp(repository)
    await addExpense('간식비', '5000')
    await editAmount(/^대관료/, '45000')
    expect(unsavedRowTitles()).toEqual(['대관료', '간식비'])

    state.failing = false
    await addExpense('꽃값', '30000')

    expect(screen.queryByTestId('list-row-badge')).not.toBeInTheDocument()
    expect(screen.queryByText(SAVE_FAILED)).not.toBeInTheDocument()
    // 저장은 전체를 한 번에 쓰므로 앞서 저장 안 된 줄도 함께 저장됐다
    expect(memory.load().data.books[0]?.ledgers['2026']?.entries.map((entry) => entry.name)).toEqual([
      '회비',
      '대관료',
      '간식비',
      '꽃값',
    ])
  })

  it('AC-11 읽기 전용으로 시작한 상태에서 적거나 고친 줄에도 "저장 안 됨" 이 붙고, 띠는 시작 안내 하나다', async () => {
    const { repository } = switchable(storedWith(LEDGER_2026), 'unreadable-original')
    renderApp(repository, { status: 'read-only', reason: 'unreadable-original', data: storedWith(LEDGER_2026) })

    await addExpense('간식비', '5000')
    // 동아리 장부에는 [회비 표] 버튼도 있어 줄 보조 줄까지 (SPEC-010 #163)
    await editAmount(/^회비 1일/, '150000')

    expect(unsavedRowTitles()).toEqual(['회비', '간식비'])
    expect(screen.getAllByTestId('notice-bar')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('저장된 기록을 읽지 못했어요. 지금 적는 내용은 저장되지 않아요')
  })
})

describe('SPEC-002 저장 전 v4 가드 (#172)', () => {
  it('가드에 어긋난 데이터를 저장하면 저장소 값이 그대로이고 장부 위 띠로 저장 실패를 알린다 ([앱 다시 열기], 적은 줄은 "저장 안 됨")', async () => {
    // 화면 데이터에 앱이 만든 틀린 값(명단에 없는 회원 번호)이 들어 있는 상태: 진짜 가드가 다음 저장을 막는다
    const memory = new MemoryRepository(duesData(PAYERS_OFF_ROSTER))
    renderApp(memory)

    await addExpense('간식비', '5000')

    const notice = screen.getByTestId('notice-bar')
    expect(within(notice).getByRole('alert')).toHaveTextContent(
      /^앱에 문제가 있어 방금 바꾼 것을 저장하지 않았어요\. 그 전 기록은 그대로예요\. 앱을 다시 열어 주세요$/,
    )
    expect(within(notice).getByRole('button', { name: '앱 다시 열기' })).toBeInTheDocument()
    // 지금 화면 데이터로 만든 기록 파일은 열 수 없는 파일이 되니 보내기를 권하지 않는다
    expect(within(notice).queryByRole('button', { name: '기록 파일 보내기' })).not.toBeInTheDocument()
    expect(unsavedRowTitles()).toEqual(['간식비'])
    expect(memory.load().data).toEqual(duesData(PAYERS_OFF_ROSTER))
  })
})
