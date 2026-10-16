// 연습 장부(SPEC-008)를 끝까지 따라 하는 테스트 동작. 연습 장부 테스트와 연습 끝 홈 화면 추가(SPEC-009 B) 테스트가 같이 쓴다
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { ShareResult } from '../features/backup/sendFile'
import type { PictureSaver } from '../features/report/savePicture'

// 오늘은 2026년 10월 16일 (SPEC-008 기본 흐름과 같은 날). [오늘 16일] 칩이 이 날을 따른다
export const PRACTICE_TODAY = new Date('2026-10-16T09:00:00.000+09:00')

// 사진 만들기·내려받기는 가짜, 공유 창은 결과를 차례로 돌려주는 흉내 (없으면 공유를 못 쓰는 기기)
export function fakeSaver(shareResults?: ShareResult[]) {
  const results = [...(shareResults ?? [])]
  const send = vi.fn(async (): Promise<ShareResult> => results.shift() ?? 'shared')
  const make = vi.fn(async (element: HTMLElement) => new Blob([element.textContent ?? ''], { type: 'image/png' }))
  const saver: PictureSaver = { make, download: vi.fn(), send: shareResults ? send : undefined }
  return { saver, send, make }
}

export const button = (name: string | RegExp) => screen.getByRole('button', { name })
export const click = (name: string | RegExp) => userEvent.click(button(name))

// 안드로이드 뒤로 버튼 (방문 기록을 실제로 하나 빼고 popstate 를 기다린다)
export async function pressBack() {
  await act(async () => {
    window.history.back()
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

// 늦게 오는 방문 기록 일(되돌리기·popstate)이 끝나기를 기다린다
export async function settleHistory() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
}

export async function startPracticeFromQuestion() {
  await click('연습해 보기')
  await screen.findByTestId('ledger-screen')
}

export type Example = { income: string; expense: string }
export const CLUB: Example = { income: '회비', expense: '간식비' }
export const HOUSEHOLD: Example = { income: '용돈', expense: '장보기' }

// ① 수입 10,000원 → 지출 5,000원 → [다 적었어요]
export async function writeTwoLines({ income, expense }: Example = CLUB) {
  await click('내역 적기')
  await click('오늘 16일')
  await click(new RegExp(`^${income}`))
  await click('1만 원 더하기')
  await click('저장')
  await click('방금 16일')
  await click(new RegExp(`^${expense}`))
  await userEvent.type(screen.getByRole('textbox', { name: '얼마인가요?' }), '5000')
  await click('저장')
  await click('다 적었어요')
  await screen.findByTestId('ledger-screen')
}

// ② 월 정리를 열고 1초쯤 뒤 말풍선이 뜨면 [‹ 장부로]
export async function lookAtMonth() {
  await click('10월 정리 보기')
  await screen.findByText('다 봤으면 여기를 눌러 장부로 돌아가요', {}, { timeout: 3000 })
  await click(/장부로/)
  await screen.findByTestId('ledger-screen')
}

// ③ 지출 줄 → [이 내역 지우기] → [지우기]
export async function deleteExpense({ expense }: Example = CLUB) {
  await click(new RegExp(`^${expense}`))
  await click('이 내역 지우기')
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))
  await screen.findByTestId('ledger-screen')
}

// ①~③ 을 마치고 ④ 결산 화면까지
export async function reachYear(example: Example = CLUB) {
  await writeTwoLines(example)
  await lookAtMonth()
  await deleteExpense(example)
  await click('결산')
  await screen.findByTestId('year-summary-screen')
}
