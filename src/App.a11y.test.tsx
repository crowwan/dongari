import { afterEach, describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Ledger } from './domain/types'
import { createBackup } from './storage/backup'
import { MemoryRepository } from './storage/MemoryRepository'
import { storedWith } from './test/ledgerFixtures'

const TODAY = new Date('2026-10-03T09:00:00.000+09:00')

const LEDGER_2026: Ledger = {
  year: 2026,
  carryover: 200_000,
  entries: [{ id: 'a', month: 10, type: 'expense', name: '대관료', amount: 40_000, day: 1, createdAt: '2026-10-01T00:00:00.000Z' }],
}

function renderApp() {
  const repository = new MemoryRepository(storedWith(LEDGER_2026))
  render(<App repository={repository} loaded={repository.load()} options={{ now: () => TODAY }} />)
}

// 안드로이드 뒤로 버튼: 브라우저가 방문 기록을 하나 빼고 popstate 를 보낸다
function pressBackButton() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
}

function isLocked(element: HTMLElement): boolean {
  return element.closest('[inert]') !== null
}

async function chooseFile(text: string) {
  await userEvent.upload(screen.getByLabelText('백업 파일 고르기'), new File([text], '우리장부-백업.txt', { type: 'text/plain' }))
}

afterEach(() => {
  document.title = '우리 장부'
})

describe('#110 접근성 점검 08 창이 떠 있는 동안 뒤 화면 잠금', () => {
  it('내역 고치기의 지우기 확인 창이 떠 있는 동안 아래 [저장]·[장부로] 는 잠기고, [아니요] 로 닫으면 풀리며 [이 내역 지우기] 로 포커스가 돌아온다', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: /^대관료/ }))
    const remove = screen.getByRole('button', { name: '이 내역 지우기' })

    await userEvent.click(remove)

    expect(isLocked(screen.getByRole('button', { name: '저장' }))).toBe(true)
    expect(isLocked(screen.getByRole('button', { name: /장부로/ }))).toBe(true)
    expect(isLocked(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: '아니요' }))
    expect(isLocked(screen.getByRole('button', { name: '저장' }))).toBe(false)
    expect(remove).toHaveFocus()
  })
})

describe('#110 접근성 점검 09 폰 뒤로 버튼은 확인 창만 닫기', () => {
  it('내역 고치기의 지우기 확인 창에서 뒤로 버튼을 누르면 확인 창만 닫히고 고치기 화면에 남는다 (지우지 않는다)', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: /^대관료/ }))
    await userEvent.click(screen.getByRole('button', { name: '이 내역 지우기' }))

    pressBackButton()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '내역 고치기' })).toBeInTheDocument()
  })

  it('장부 화면의 백업 불러오기 확인 창에서 뒤로 버튼을 누르면 확인 창만 닫히고 장부에 남는다', async () => {
    renderApp()
    await chooseFile(createBackup(storedWith(LEDGER_2026), TODAY).text)
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()

    pressBackButton()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('ledger-screen')).toBeInTheDocument()
  })

  it('뒤로 버튼으로 닫은 알림 창은 다음 불러오기에 남지 않는다 ([아니요] 와 같이 비운다)', async () => {
    renderApp()
    await chooseFile('백업 파일이 아닌 글')
    expect(await screen.findByRole('alertdialog', { name: '이 파일은 열 수 없어요' })).toBeInTheDocument()
    pressBackButton()

    await chooseFile(createBackup(storedWith(LEDGER_2026), TODAY).text)

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: '불러오기' })).toBeInTheDocument()
  })
})

describe('#110 접근성 점검 10 화면이 바뀌면 화면 읽기에 알리기', () => {
  it('설정을 열면 제목 "설정" 에 포커스가 가고 창 제목이 "설정 · 우리 장부" 가 된다. 뒤로 버튼으로 장부에 오면 장부 제목으로', async () => {
    renderApp()
    expect(document.title).toBe('한랑드림 2026년 · 우리 장부')

    await userEvent.click(screen.getByRole('button', { name: /^설정/ }))

    const heading = screen.getByRole('heading', { level: 1, name: '설정' })
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(document.title).toBe('설정 · 우리 장부')

    pressBackButton()
    expect(await screen.findByTestId('ledger-screen')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(document.title).toBe('한랑드림 2026년 · 우리 장부')
  })

  it('앱을 처음 열 때는 제목으로 포커스를 옮기지 않는다', () => {
    renderApp()

    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus()
  })

  it('내역 적기처럼 새 화면이 스스로 칸에 포커스를 주면(날 숫자 칸 → 숫자 키패드) 그대로 두고 창 제목만 바꾼다', async () => {
    renderApp()

    await userEvent.click(screen.getByRole('button', { name: '내역 적기' }))

    expect(screen.getByRole('heading', { level: 1, name: '내역 적기' })).not.toHaveFocus()
    expect(document.activeElement?.tagName).toBe('INPUT')
    expect(document.title).toBe('내역 적기 · 우리 장부')
  })
})
