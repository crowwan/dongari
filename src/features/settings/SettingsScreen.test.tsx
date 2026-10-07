import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LedgerInfo } from '../../domain/ledger'
import type { Ledger } from '../../domain/types'
import { createInstallPromptStore, type InstallPromptStore } from '../install/installPrompt'
import { useScreenHistory } from '../useScreenHistory'
import { SettingsScreen } from './SettingsScreen'

const LEDGER: Ledger = { year: 2026, clubName: '한랑드림', carryover: 370_482, entries: [] }

type Handlers = {
  onChangeYear?: (year: number) => void
  onSaveClubInfo?: (info: LedgerInfo) => void
  onSendBackup?: () => void
  onImportBackup?: () => void
}

const SAMSUNG_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36'
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'

// 홈 화면에 추가 줄이 보는 브라우저 상태. 테스트마다 따로 듣는 곳을 두어 앞 테스트의 설치 제안·설치 완료가 섞이지 않게 한다
type InstallOptions = { standalone?: boolean; userAgent?: string; installPrompt?: InstallPromptStore }

// ledger 가 null 이면 고른 연도 장부가 아직 없는 경우
type HarnessProps = {
  ledger?: Ledger | null
  needsBackup?: boolean
  lastBackupAt?: string
  handlers?: Handlers
  install?: InstallOptions
}

// 선택 창·편집 화면은 App 처럼 방문 기록 훅이 연다
function Harness({ ledger = LEDGER, needsBackup = false, lastBackupAt, handlers = {}, install = {} }: HarnessProps) {
  const sheets = useScreenHistory()
  const [installPrompt] = useState(() => install.installPrompt ?? createInstallPromptStore(new EventTarget()))
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
      install={{ standalone: install.standalone ?? false, userAgent: install.userAgent ?? CHROME_UA, installPrompt }}
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

  describe('SPEC-002 홈 화면에 추가 줄', () => {
    // 크롬·삼성 인터넷이 설치할 수 있을 때 보내는 이벤트를 흉내 낸다
    function installPromptWith(outcome: 'accepted' | 'dismissed') {
      const events = new EventTarget()
      const store = createInstallPromptStore(events)
      const prompt = vi.fn(async () => {})
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt,
        userChoice: Promise.resolve({ outcome, platform: 'web' }),
      })
      events.dispatchEvent(event)
      return { store, events, prompt, event }
    }

    const installRow = () => screen.queryByRole('button', { name: /홈 화면에 추가/ })

    it('홈 화면에 추가하지 않고 열었으면 맨 아래 "앱" 묶음에 [홈 화면에 추가] 줄이 있다', () => {
      render(<Harness />)

      const groups = screen.getAllByRole('region')
      expect(groups.map((group) => group.querySelector('h2')?.textContent)).toEqual([
        '동아리',
        '기록 백업',
        '앱',
      ])
      const row = within(screen.getByRole('region', { name: '앱' })).getByTestId('list-row')
      expect(row.textContent?.trim()).toBe('홈 화면에 추가 기록이 더 안전해요')
      expect(row.querySelector('[data-icon="phone"]')).toBeInTheDocument()
      expect(row.querySelector('[data-icon="right"]')).toBeInTheDocument()
    })

    it('홈 화면 앱으로 열었으면 줄(묶음째)이 없다', () => {
      render(<Harness install={{ standalone: true }} />)

      expect(screen.queryByRole('region', { name: '앱' })).not.toBeInTheDocument()
      expect(installRow()).not.toBeInTheDocument()
    })

    it('브라우저가 설치를 제안했으면 줄을 누를 때 브라우저 설치 창을 바로 열고(기본 설치 띠는 막음), 설치하면 줄을 숨긴다', async () => {
      const { store, prompt, event } = installPromptWith('accepted')
      render(<Harness install={{ installPrompt: store }} />)

      expect(event.defaultPrevented).toBe(true)
      await userEvent.click(screen.getByRole('button', { name: /홈 화면에 추가/ }))

      expect(prompt).toHaveBeenCalledOnce()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(installRow()).not.toBeInTheDocument()
    })

    it('설치 창에서 취소하면 줄은 남고, 다시 누르면 방법 안내가 뜬다 (설치 제안은 한 번만 쓸 수 있다)', async () => {
      const { store, prompt } = installPromptWith('dismissed')
      render(<Harness install={{ installPrompt: store }} />)

      await userEvent.click(screen.getByRole('button', { name: /홈 화면에 추가/ }))
      expect(prompt).toHaveBeenCalledOnce()
      expect(installRow()).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /홈 화면에 추가/ }))
      expect(screen.getByRole('dialog', { name: '홈 화면에 추가하는 방법' })).toBeInTheDocument()
    })

    it('다른 경로로 설치가 끝나면(appinstalled) 줄을 숨긴다', () => {
      const events = new EventTarget()
      render(<Harness install={{ installPrompt: createInstallPromptStore(events) }} />)

      act(() => {
        events.dispatchEvent(new Event('appinstalled'))
      })

      expect(installRow()).not.toBeInTheDocument()
    })

    describe('방법 안내 (설치 제안이 없을 때)', () => {
      it('삼성 인터넷이면 아래 메뉴에서 추가하는 순서를 선택 창으로 보인다', async () => {
        render(<Harness install={{ userAgent: SAMSUNG_UA }} />)

        await userEvent.click(screen.getByRole('button', { name: /홈 화면에 추가/ }))

        const sheet = screen.getByRole('dialog', { name: '홈 화면에 추가하는 방법' })
        const guide = within(sheet).getByTestId('install-guide')
        expect(guide).toHaveAttribute('data-browser', 'samsung')
        expect(guide).toHaveTextContent('화면 아래 오른쪽 [≡] 메뉴')
        expect(guide).toHaveTextContent('[현재 페이지 추가]')
        expect(guide).not.toHaveTextContent('[⋮]')
      })

      it('크롬이면 위쪽 메뉴에서 추가하는 순서를 보인다', async () => {
        render(<Harness install={{ userAgent: CHROME_UA }} />)

        await userEvent.click(screen.getByRole('button', { name: /홈 화면에 추가/ }))

        const guide = within(screen.getByRole('dialog')).getByTestId('install-guide')
        expect(guide).toHaveAttribute('data-browser', 'chrome')
        expect(guide).toHaveTextContent('화면 위 오른쪽 [⋮] 메뉴')
        expect(guide).not.toHaveTextContent('[≡]')
      })

      it('그 밖의 브라우저면 삼성 인터넷과 크롬 순서를 둘 다 보인다', async () => {
        render(<Harness install={{ userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0' }} />)

        await userEvent.click(screen.getByRole('button', { name: /홈 화면에 추가/ }))

        const guide = within(screen.getByRole('dialog')).getByTestId('install-guide')
        expect(guide).toHaveTextContent('[≡]')
        expect(guide).toHaveTextContent('[⋮]')
      })

      it('[확인] 을 누르면 창이 닫히고 설정에 남는다', async () => {
        render(<Harness />)
        await userEvent.click(screen.getByRole('button', { name: /홈 화면에 추가/ }))

        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '확인' }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
      })

      it('안드로이드 뒤로 버튼을 누르면 창만 닫힌다', async () => {
        render(<Harness />)
        await userEvent.click(screen.getByRole('button', { name: /홈 화면에 추가/ }))

        pressBackButton()

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
      })
    })
  })
})
