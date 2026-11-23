import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CURRENT_SCHEMA_VERSION, type StoredData } from './domain/types'
import { MemoryRepository } from './storage/MemoryRepository'
import { fakeBrowser } from './test/installFakes'
import { book, ledger } from './test/ledgerFixtures'
import { button, click, fakeSaver, HOUSEHOLD, leaveYear, PRACTICE_TODAY, reachYear } from './test/practiceFlow'

// 연습 ⑥(가계부 ⑤) 에서 엑셀 확인 화면 조각을 받지 못한 상황(오프라인인데 서비스 워커가 아직 못 받음·배포 뒤 옛 조각 주소가 사라짐).
// 모듈 대체가 다른 테스트에 번지지 않게 이 파일에서만 한다 (App.excel.offline.test.tsx 와 같음)
afterEach(() => {
  vi.doUnmock('./features/excel/ExcelImportScreen')
  vi.resetModules()
})

const FAILED_MESSAGE = '엑셀 연습 화면을 받지 못했어요. 인터넷이 되면 장부로 돌아가 다시 해 보거나, 엑셀 연습은 건너뛰어도 돼요'

// 가계부 장부가 있는 폰 (설정 [연습해 보기] 는 가계부 연습 — 다섯 단계라 ⑤ 가 엑셀)
const HOUSEHOLD_PHONE: StoredData = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  books: [book([ledger([[10, 'expense', '지출1', 10_000]], { year: 2026 })], { kind: 'household' })],
  settings: { lastBackupAt: PRACTICE_TODAY.toISOString() },
}

const isLocked = (element: HTMLElement) => element.closest('[inert]') !== null
const bookButton = () => screen.getByRole('button', { name: /장부 바꾸기$/ })

async function openPracticeExcel() {
  await userEvent.click(bookButton())
  await userEvent.click(within(screen.getByRole('dialog', { name: '어느 장부를 볼까요?' })).getByRole('button', { name: '엑셀 파일로 새 장부' }))
  return screen.findByRole('heading', { level: 1, name: '엑셀 기능을 받지 못했어요' }, { timeout: 5_000 })
}

describe('SPEC-010 10절 연습 엑셀 단계 — 엑셀 화면 조각을 받지 못함', () => {
  it('[앱 다시 열기](연습이 사라짐) 대신 [‹ 장부로] 로 다시 해 보거나 [엑셀 연습 건너뛰기] 로 끝 화면에 가고, 끝 화면 엑셀 줄은 빈 동그라미다', async () => {
    vi.resetModules()
    vi.doMock('./features/excel/ExcelImportScreen', () => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })
    const { AppRoot } = await import('./features/practice/AppRoot')
    const repository = new MemoryRepository(HOUSEHOLD_PHONE)
    render(
      <AppRoot
        repository={repository}
        loaded={repository.load()}
        install={fakeBrowser({ standalone: true }).install}
        saver={fakeSaver(['shared']).saver}
        options={{ now: () => PRACTICE_TODAY }}
      />,
    )
    await click(/^설정/)
    await click(/연습해 보기/)
    await screen.findByTestId('ledger-screen')
    await reachYear(HOUSEHOLD)
    await click('사진 보내기')
    await leaveYear()

    await openPracticeExcel()

    await screen.findByText(FAILED_MESSAGE)
    expect(button(/장부로/)).toHaveAccessibleDescription(`${FAILED_MESSAGE} 연습 5 / 5`)
    expect(isLocked(button('앱 다시 열기'))).toBe(true)
    expect(isLocked(button('엑셀 연습 건너뛰기'))).toBe(false)
    expect(isLocked(button('그만하기'))).toBe(false)

    // 다시 해 보기: [‹ 장부로] → 장부 이름 말풍선부터 다시
    await click(/장부로/)
    await screen.findByText('엑셀로 쓰던 장부도 불러올 수 있어요. 장부 이름을 눌러요')
    await openPracticeExcel()
    await screen.findByText(FAILED_MESSAGE)

    await click('엑셀 연습 건너뛰기')

    await screen.findByTestId('practice-end')
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map((row) => [row.textContent, row.dataset.done]).at(-1)).toEqual(['엑셀 장부 불러오기 (아직 안 해 봤어요)', 'false'])
    expect(rows.map((row) => row.dataset.done).slice(0, 4)).toEqual(['true', 'true', 'true', 'true'])
  })
})
