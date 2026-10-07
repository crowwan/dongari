import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LedgerInfo } from '../../domain/ledger'
import type { Ledger } from '../../domain/types'
import { useScreenHistory } from '../useScreenHistory'
import { SettingsScreen } from './SettingsScreen'

const LEDGER: Ledger = { year: 2026, clubName: '한랑드림', carryover: 370_482, entries: [] }

type Handlers = {
  onChangeYear?: (year: number) => void
  onSaveClubInfo?: (info: LedgerInfo) => void
  onSendBackup?: () => void
  onImportBackup?: () => void
}

// ledger 가 null 이면 고른 연도 장부가 아직 없는 경우
type HarnessProps = { ledger?: Ledger | null; needsBackup?: boolean; lastBackupAt?: string; handlers?: Handlers }

// 선택 창·편집 화면은 App 처럼 방문 기록 훅이 연다
function Harness({ ledger = LEDGER, needsBackup = false, lastBackupAt, handlers = {} }: HarnessProps) {
  const sheets = useScreenHistory()
  return (
    <SettingsScreen
      year={2026}
      yearChoices={[2026, 2025]}
      ledger={ledger ?? undefined}
      sheets={sheets}
      needsBackup={needsBackup}
      onChangeYear={handlers.onChangeYear ?? vi.fn()}
      onSaveClubInfo={handlers.onSaveClubInfo ?? vi.fn()}
      lastBackupAt={lastBackupAt}
      onSendBackup={handlers.onSendBackup ?? vi.fn()}
      onImportBackup={handlers.onImportBackup ?? vi.fn()}
      onBack={vi.fn()}
    />
  )
}

function pressBackButton() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
}

describe('SPEC-001·002 설정 화면', () => {
  describe('줄 목록', () => {
    it('묶음 제목(동아리 / 기록 백업) 아래 아이콘 + 이름 + 값 + 화살표 줄이 있다', () => {
      render(<Harness lastBackupAt="2026-09-03T10:00:00.000+09:00" />)

      const club = screen.getByRole('region', { name: '동아리' })
      const rows = within(club).getAllByTestId('list-row')
      expect(rows.map((row) => row.textContent)).toEqual(['동아리 이름 한랑드림', '작년 이월금 370,482원', '장부 연도 2026년'])
      expect(rows.map((row) => row.querySelector('[data-icon]')?.getAttribute('data-icon'))).toEqual([
        'users',
        'bank',
        'calendar',
      ])
      // 줄 끝 화살표는 "누르면 들어간다" 표시
      expect(rows.every((row) => row.querySelector('[data-icon="right"]') !== null)).toBe(true)

      const backup = screen.getByRole('region', { name: '기록 백업' })
      // 값이 없는 줄은 끝에 화살표만 있다
      expect(within(backup).getAllByTestId('list-row').map((row) => row.textContent?.trim())).toEqual([
        '백업 파일 보내기 마지막 백업: 2026년 9월 3일',
        '백업 파일 불러오기 새 폰으로 옮길 때',
      ])
    })

    it('작년이 적자였으면 이월금 값에 "적자" 를 붙인다', () => {
      render(<Harness ledger={{ ...LEDGER, carryover: -20_000 }} />)

      expect(screen.getByRole('button', { name: /작년 이월금/ })).toHaveTextContent('적자 20,000원')
    })

    it('고른 연도 장부가 아직 없으면 동아리 이름·이월금 줄 대신 안내를 보이고 연도 줄은 남는다', () => {
      render(<Harness ledger={null} />)

      expect(screen.getByText('2026년 장부가 아직 없어요. 장부 화면에서 시작하면 여기서 고칠 수 있어요.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /동아리 이름/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /장부 연도/ })).toBeInTheDocument()
    })

    it('[백업 파일 보내기] [백업 파일 불러오기] 줄은 누르면 바로 그 일을 한다', async () => {
      const onSendBackup = vi.fn()
      const onImportBackup = vi.fn()
      render(<Harness handlers={{ onSendBackup, onImportBackup }} />)

      await userEvent.click(screen.getByRole('button', { name: /백업 파일 보내기/ }))
      await userEvent.click(screen.getByRole('button', { name: /백업 파일 불러오기/ }))

      expect(onSendBackup).toHaveBeenCalledOnce()
      expect(onImportBackup).toHaveBeenCalledOnce()
    })

    it('한 달 넘게 백업하지 않았으면 제목 아래 백업 안내 띠와 [백업 파일 보내기] 가 보인다', async () => {
      const onSendBackup = vi.fn()
      render(<Harness needsBackup handlers={{ onSendBackup }} />)

      const notice = screen.getByTestId('notice-bar')
      expect(notice).toHaveTextContent('한 달 넘게 백업하지 않았어요')
      await userEvent.click(within(notice).getByRole('button', { name: '백업 파일 보내기' }))

      expect(onSendBackup).toHaveBeenCalledOnce()
    })
  })

  describe('편집 화면 (동아리 이름·작년 이월금)', () => {
    it('[동아리 이름] 줄을 누르면 설정 목록 대신 그 값 하나만 고치는 화면이 열린다', async () => {
      render(<Harness />)

      await userEvent.click(screen.getByRole('button', { name: /동아리 이름/ }))

      expect(screen.getByRole('heading', { level: 1, name: '동아리 이름 바꾸기' })).toBeInTheDocument()
      expect(screen.getByLabelText('동아리 이름')).toHaveValue('한랑드림')
      expect(screen.queryByRole('region', { name: '기록 백업' })).not.toBeInTheDocument()
      // 바꾼 것이 없으면 [저장] 을 누를 수 없다
      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    })

    it('이름을 고쳐 [저장] 하면 이월금은 그대로 두고 저장을 알리고 설정 목록으로 돌아온다', async () => {
      const onSaveClubInfo = vi.fn()
      render(<Harness handlers={{ onSaveClubInfo }} />)
      await userEvent.click(screen.getByRole('button', { name: /동아리 이름/ }))

      const name = screen.getByLabelText('동아리 이름')
      await userEvent.clear(name)
      await userEvent.type(name, '꽃동산')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(onSaveClubInfo).toHaveBeenCalledWith({ clubName: '꽃동산', carryover: 370_482 })
      expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    })

    it('이름을 비우면 [저장] 을 누를 수 없고 이유를 알린다', async () => {
      render(<Harness />)
      await userEvent.click(screen.getByRole('button', { name: /동아리 이름/ }))

      await userEvent.clear(screen.getByLabelText('동아리 이름'))

      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
      expect(screen.getByText('동아리 이름을 적어주세요')).toBeInTheDocument()
    })

    it('[작년 이월금] 줄은 금액 + 남았어요/적자였어요 화면을 열고, 적자로 바꿔 저장하면 이름은 그대로 둔다', async () => {
      const onSaveClubInfo = vi.fn()
      render(<Harness handlers={{ onSaveClubInfo }} />)
      await userEvent.click(screen.getByRole('button', { name: /작년 이월금/ }))

      expect(screen.getByRole('heading', { level: 1, name: '작년 이월금 바꾸기' })).toBeInTheDocument()
      expect(screen.getByLabelText('작년 이월금')).toHaveValue('370,482')
      await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(onSaveClubInfo).toHaveBeenCalledWith({ clubName: '한랑드림', carryover: -370_482 })
    })

    it('[‹ 설정] 을 누르면 저장하지 않고 설정 목록으로 돌아온다', async () => {
      const onSaveClubInfo = vi.fn()
      render(<Harness handlers={{ onSaveClubInfo }} />)
      await userEvent.click(screen.getByRole('button', { name: /동아리 이름/ }))
      await userEvent.type(screen.getByLabelText('동아리 이름'), '2')

      await userEvent.click(screen.getByRole('button', { name: '설정' }))

      expect(onSaveClubInfo).not.toHaveBeenCalled()
      expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    })

    it('편집 화면에서 안드로이드 뒤로 버튼을 누르면 설정 목록으로 돌아온다 (장부까지 나가지 않는다)', async () => {
      render(<Harness />)
      await userEvent.click(screen.getByRole('button', { name: /작년 이월금/ }))

      pressBackButton()

      expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    })
  })

  describe('장부 연도 선택 창', () => {
    it('[장부 연도] 줄을 누르면 고를 수 있는 연도가 선택 창으로 올라오고 지금 연도에 체크가 있다', async () => {
      render(<Harness />)

      await userEvent.click(screen.getByRole('button', { name: /장부 연도/ }))

      const sheet = screen.getByRole('dialog', { name: '어느 해 장부를 볼까요?' })
      const years = within(sheet).getByRole('group', { name: '장부 연도' })
      expect(within(years).getAllByRole('button').map((button) => button.textContent)).toEqual(['2026년', '2025년'])
      expect(within(years).getByRole('button', { name: '2026년' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('연도를 고르면 그 연도를 알린다 (장부로 돌아가는 것은 App 몫)', async () => {
      const onChangeYear = vi.fn()
      render(<Harness handlers={{ onChangeYear }} />)
      await userEvent.click(screen.getByRole('button', { name: /장부 연도/ }))

      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '2025년' }))

      expect(onChangeYear).toHaveBeenCalledWith(2025)
    })

    it('선택 창에서 안드로이드 뒤로 버튼을 누르면 창만 닫히고 설정에 남는다', async () => {
      render(<Harness />)
      await userEvent.click(screen.getByRole('button', { name: /장부 연도/ }))

      pressBackButton()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    })
  })
})
