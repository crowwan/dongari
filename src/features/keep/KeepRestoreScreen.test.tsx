import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, type StoredData } from '../../domain/types'
import { createBackup } from '../../storage/backup'
import type { SaveResult } from '../../storage/LedgerRepository'
import { book, ledger } from '../../test/ledgerFixtures'
import { keepIdOf, sealKeep } from './keepCrypto'
import { useScreenHistory } from '../useScreenHistory'
import { KeepRestoreScreen } from './KeepRestoreScreen'
import type { KeepGetResult, KeepServer } from './keepServer'

const CODE = 'HK7M-29QF-MX4P-8R2D'
// 폰 시각 10월 12일 오후 3:20
const SAVED_AT = new Date(2026, 9, 12, 15, 20).toISOString()

const KEPT: StoredData = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  books: [
    book([ledger([[3, 'income', '회비', 10_000], [3, 'expense', '간식비', 5_000]], { year: 2026 })]),
    book([ledger([[1, 'expense', '장보기', 30_000]], { year: 2026 })], { id: 'home', name: '우리집 가계부', kind: 'household' }),
  ],
  settings: { recoveryCode: CODE },
}

async function serverWithKept(): Promise<KeepServer> {
  const id = await keepIdOf(CODE)
  const envelope = await sealKeep(CODE, createBackup(KEPT, new Date(SAVED_AT)).text, SAVED_AT)
  return {
    put: async () => 'ok',
    get: async (asked) => (asked === id ? { status: 'found', envelope } : { status: 'not-found' }),
    remove: async () => true,
    sendStatus: async () => {},
  }
}

function answering(result: KeepGetResult): KeepServer {
  return { put: async () => 'ok', get: async () => result, remove: async () => true, sendStatus: async () => {} }
}

type Restore = (data: StoredData) => SaveResult

type HarnessProps = { server: KeepServer; hasRecords: boolean; restore: Restore; onBack: () => void }

// 확인 창은 App 처럼 방문 기록 훅이 연다
function Harness({ server, hasRecords, restore, onBack }: HarnessProps) {
  const dialogs = useScreenHistory()
  return (
    <KeepRestoreScreen server={server} hasRecords={hasRecords} onRestore={restore} backLabel="설정" onBack={onBack} dialogs={dialogs} />
  )
}

function renderScreen(server: KeepServer, { hasRecords = true, restore = vi.fn<Restore>(() => ({ ok: true })) } = {}) {
  const onBack = vi.fn()
  render(<Harness server={server} hasRecords={hasRecords} restore={restore} onBack={onBack} />)
  return { restore, onBack }
}

async function typeCode(text: string) {
  await userEvent.type(screen.getByRole('textbox', { name: '복구 코드를 넣어 주세요' }), text)
}

describe('SPEC-006 복구 코드로 불러오기 화면', () => {
  it('넣는 동안 4자마다 줄표가 저절로 들어가고 소문자·띄어쓰기는 무시한다', async () => {
    renderScreen(answering({ status: 'not-found' }))
    await typeCode('hk7m 29qf')
    expect(screen.getByRole('textbox')).toHaveValue('HK7M-29QF')
  })

  it('16자를 다 넣기 전에는 [불러오기] 를 누를 수 없다', async () => {
    renderScreen(answering({ status: 'not-found' }))
    expect(screen.getByRole('button', { name: '불러오기' })).toBeDisabled()
    await typeCode('hk7m29qfmx4p8r2')
    expect(screen.getByRole('button', { name: '불러오기' })).toBeDisabled()
    await typeCode('d')
    expect(screen.getByRole('button', { name: '불러오기' })).toBeEnabled()
  })

  it('AC-5 맞는 코드면 보관한 때·장부 수와 이름·기록 수를 보여 주고 이 폰 기록이 지워진다고 묻는다', async () => {
    const { restore } = renderScreen(await serverWithKept())
    await typeCode('hk7m-29qf-mx4p-8r2d')
    await userEvent.click(screen.getByRole('button', { name: '불러오기' }))

    const dialog = await screen.findByRole('alertdialog', { name: '보관본으로 바꿀까요?' })
    expect(dialog).toHaveAccessibleDescription('이 폰에 있던 기록은 지워져요')
    expect(within(dialog).getByText('10월 12일 오후 3:20')).toBeInTheDocument()
    expect(within(dialog).getByText('2개 (한랑드림, 우리집 가계부)')).toBeInTheDocument()
    expect(within(dialog).getByText('3건')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '바꾸기' })).toHaveAttribute('data-variant', 'danger')
    expect(restore).not.toHaveBeenCalled()
  })

  it('AC-5 [바꾸기] 를 누르면 보관본(이 폰 복구 코드도 그 코드로)으로 바꾼다', async () => {
    const { restore } = renderScreen(await serverWithKept())
    await typeCode(CODE)
    await userEvent.click(screen.getByRole('button', { name: '불러오기' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '바꾸기' }))

    expect(restore).toHaveBeenCalledTimes(1)
    const restored = restore.mock.calls[0]?.[0]
    expect(restored?.books).toEqual(KEPT.books)
    expect(restored?.settings.recoveryCode).toBe(CODE)
  })

  it('[아니요] 면 아무것도 바꾸지 않는다', async () => {
    const { restore } = renderScreen(await serverWithKept())
    await typeCode(CODE)
    await userEvent.click(screen.getByRole('button', { name: '불러오기' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '아니요' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(restore).not.toHaveBeenCalled()
  })

  it('이 폰에 기록이 없으면(첫 실행) 지워진다는 말 없이 주 버튼', async () => {
    renderScreen(await serverWithKept(), { hasRecords: false })
    await typeCode(CODE)
    await userEvent.click(screen.getByRole('button', { name: '불러오기' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).not.toHaveAccessibleDescription()
    expect(within(dialog).getByRole('button', { name: '바꾸기' })).toHaveAttribute('data-variant', 'primary')
  })

  it.each([
    ['AC-5 틀린 코드·보관본 없음', { status: 'not-found' } as const, '이 코드로 보관된 기록이 없어요. 코드를 다시 확인해 주세요'],
    ['AC-5 인터넷 없음', { status: 'offline' } as const, '인터넷에 연결한 뒤 다시 눌러 주세요'],
    ['서버 오류', { status: 'failed' } as const, '보관본을 받아 오지 못했어요. 잠시 뒤 다시 눌러 주세요'],
  ])('%s 이면 칸 아래에 알린다', async (_label, answer, message) => {
    renderScreen(answering(answer))
    await typeCode(CODE)
    await userEvent.click(screen.getByRole('button', { name: '불러오기' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription(message)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('기기에 저장하지 못하면 지금 기록은 그대로라고 알린다', async () => {
    renderScreen(await serverWithKept(), { restore: vi.fn<Restore>(() => ({ ok: false, reason: 'quota-exceeded' })) })
    await typeCode(CODE)
    await userEvent.click(screen.getByRole('button', { name: '불러오기' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '바꾸기' }))

    expect(await screen.findByText('불러오지 못했어요. 기기에 저장하지 못했어요. 지금 기록은 그대로예요')).toBeInTheDocument()
  })

  it('맨 위 되돌아가기 버튼', async () => {
    const { onBack } = renderScreen(answering({ status: 'not-found' }))
    await userEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('#110 접근성 점검 09 복구 코드 확인 창과 뒤로 버튼', () => {
  it('확인 창에서 뒤로 버튼을 누르면 확인 창만 닫히고 불러오기 화면(넣은 코드)은 그대로다', async () => {
    const { restore, onBack } = renderScreen(await serverWithKept())
    await typeCode(CODE)
    await userEvent.click(screen.getByRole('button', { name: '불러오기' }))
    await screen.findByRole('alertdialog')

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue(CODE)
    expect(restore).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()
  })
})
