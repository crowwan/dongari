import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { carryoverWords } from '../../domain/book'
import type { BookSetup } from '../../domain/ledger'
import type { BookKind, Ledger } from '../../domain/types'
import { createInstallPromptStore, type InstallPromptStore } from '../install/installPrompt'
import type { KeepServer } from '../keep/keepServer'
import { useScreenHistory } from '../useScreenHistory'
import { createUpdateWatcher, type AppVersion } from '../version/appVersion'
import { SettingsScreen, type KeepRow } from './SettingsScreen'

const LEDGER: Ledger = { year: 2026, carryover: 370_482, entries: [] }

type Handlers = {
  onChangeYear?: (year: number) => void
  onSaveBookInfo?: (setup: BookSetup) => void
  onDeleteBook?: () => boolean
  onSendBackup?: () => void
  onImportBackup?: () => void
  onShareCode?: () => void
  onPractice?: () => void
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
  kind?: BookKind
  canDeleteBook?: boolean
  // 자동으로 지키기 (없으면 서버 주소가 없는 빌드 — 맨 위 카드 없이 기록 파일 두 줄)
  keep?: KeepRow
  recoveryCode?: string
  // 복구 코드로 불러오기에 쓰는 서버 (없으면 줄이 없다)
  keepServer?: KeepServer
  // 버전 줄 (없으면 본 주소 2.6.0, 새 버전 받지 않음)
  version?: AppVersion
}

const MAIN_VERSION: AppVersion = { label: '2.6.0', updates: createUpdateWatcher(undefined), reload: () => {} }

// 선택 창·편집 화면은 App 처럼 방문 기록 훅이 연다
function Harness({
  ledger = LEDGER,
  needsBackup = false,
  lastBackupAt,
  handlers = {},
  install = {},
  kind = 'club',
  canDeleteBook = true,
  keep,
  recoveryCode = 'HK7M-29QF-MX4P-8R2D',
  keepServer,
  version = MAIN_VERSION,
}: HarnessProps) {
  const sheets = useScreenHistory()
  const [installPrompt] = useState(() => install.installPrompt ?? createInstallPromptStore(new EventTarget()))
  return (
    <SettingsScreen
      bookName="한랑드림"
      bookKind={kind}
      carryoverWords={carryoverWords(kind, false)}
      canDeleteBook={canDeleteBook}
      onDeleteBook={handlers.onDeleteBook ?? vi.fn(() => true)}
      year={2026}
      yearChoices={[2026, 2025]}
      ledger={ledger ?? undefined}
      sheets={sheets}
      needsBackup={needsBackup}
      onChangeYear={handlers.onChangeYear ?? vi.fn()}
      onSaveBookInfo={handlers.onSaveBookInfo ?? vi.fn()}
      lastBackupAt={lastBackupAt}
      onSendBackup={handlers.onSendBackup ?? vi.fn()}
      onImportBackup={handlers.onImportBackup ?? vi.fn()}
      keep={keep}
      recoveryCode={recoveryCode}
      onShareCode={handlers.onShareCode ?? vi.fn()}
      restoreByCode={keepServer && { server: keepServer, hasRecords: true, onRestore: () => ({ ok: true }) }}
      onBack={vi.fn()}
      onPractice={handlers.onPractice ?? vi.fn()}
      install={{ standalone: install.standalone ?? false, userAgent: install.userAgent ?? CHROME_UA, installPrompt }}
      version={version}
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
    it('SPEC-005 묶음 제목(장부 정보) 아래 아이콘 + 이름 + 값 + 화살표 줄이 있다', () => {
      render(<Harness lastBackupAt="2026-09-03T10:00:00.000+09:00" />)

      const book = screen.getByRole('region', { name: '장부 정보' })
      const rows = within(book).getAllByTestId('list-row')
      expect(rows.map((row) => row.textContent)).toEqual([
        '장부 이름 한랑드림',
        '종류 동아리·모임',
        '작년 이월금 370,482원',
        '장부 연도 2026년',
      ])
      expect(rows.map((row) => row.querySelector('[data-icon]')?.getAttribute('data-icon'))).toEqual([
        'pen',
        'users',
        'bank',
        'calendar',
      ])
      // 줄 끝 화살표는 "누르면 들어간다" 표시
      // 줄 끝 › 는 값 안이 아니라 ListRow chevron (큰 글씨에서 값이 아래 줄로 내려가도 줄 끝에 남는다, SPEC-001 v2.6)
      expect(rows.every((row) => within(row).queryByTestId('list-row-chevron')?.querySelector('[data-icon="right"]'))).toBe(true)
      expect(rows.every((row) => row.querySelector('.ui-row__end [data-icon="right"]') === null)).toBe(true)

      // 값이 없는 줄은 끝에 화살표만 있다 (서버 주소 없는 빌드: 맨 위 기록 파일 두 줄)
      expect(within(screen.getByTestId('settings-block-files')).getAllByTestId('list-row').map((row) => row.textContent?.trim())).toEqual([
        '기록 파일 보내기 마지막: 2026년 9월 3일',
        '기록 파일 불러오기 받아 둔 파일로 기록 되살리기',
      ])
    })

    it('작년이 적자였으면 이월금 값에 "적자" 를 붙인다', () => {
      render(<Harness ledger={{ ...LEDGER, carryover: -20_000 }} />)

      expect(screen.getByRole('button', { name: /작년 이월금/ })).toHaveTextContent('적자 20,000원')
    })

    it('고른 연도 장부가 아직 없으면 장부 이름·종류·이월금 줄 대신 안내를 보이고 연도 줄은 남는다', () => {
      render(<Harness ledger={null} />)

      expect(screen.getByText('2026년 장부가 아직 없어요. 장부 화면에서 시작하면 여기서 고칠 수 있어요.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /장부 이름/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^종류/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /장부 연도/ })).toBeInTheDocument()
    })

    it('[기록 파일 보내기] [기록 파일 불러오기] 줄은 누르면 바로 그 일을 한다', async () => {
      const onSendBackup = vi.fn()
      const onImportBackup = vi.fn()
      render(<Harness handlers={{ onSendBackup, onImportBackup }} />)

      await userEvent.click(screen.getByRole('button', { name: /기록 파일 보내기/ }))
      await userEvent.click(screen.getByRole('button', { name: /기록 파일 불러오기/ }))

      expect(onSendBackup).toHaveBeenCalledOnce()
      expect(onImportBackup).toHaveBeenCalledOnce()
    })

    it('한 달 넘게 기록 파일을 보내지 않았으면 제목 아래 안내 띠와 [기록 파일 보내기] 가 보인다', async () => {
      const onSendBackup = vi.fn()
      render(<Harness needsBackup handlers={{ onSendBackup }} />)

      const notice = screen.getByTestId('notice-bar')
      expect(notice).toHaveTextContent('한 달 넘게 기록 파일을 보내지 않았어요')
      await userEvent.click(within(notice).getByRole('button', { name: '기록 파일 보내기' }))

      expect(onSendBackup).toHaveBeenCalledOnce()
    })
  })

  describe('편집 화면 (장부 이름·작년 이월금)', () => {
    it('[장부 이름] 줄을 누르면 설정 목록 대신 그 값 하나만 고치는 화면이 열린다', async () => {
      render(<Harness />)

      await userEvent.click(screen.getByRole('button', { name: /장부 이름/ }))

      expect(screen.getByRole('heading', { level: 1, name: '장부 이름 바꾸기' })).toBeInTheDocument()
      expect(screen.getByLabelText('장부 이름')).toHaveValue('한랑드림')
      expect(screen.queryByTestId('settings-block-files')).not.toBeInTheDocument()
      // 바꾼 것이 없으면 [저장] 을 누를 수 없다
      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    })

    it('이름을 고쳐 [저장] 하면 이월금은 그대로 두고 저장을 알리고 설정 목록으로 돌아온다', async () => {
      const onSaveBookInfo = vi.fn()
      render(<Harness handlers={{ onSaveBookInfo }} />)
      await userEvent.click(screen.getByRole('button', { name: /장부 이름/ }))

      const name = screen.getByLabelText('장부 이름')
      await userEvent.clear(name)
      await userEvent.type(name, '꽃동산')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(onSaveBookInfo).toHaveBeenCalledWith({ name: '꽃동산', kind: 'club', carryover: 370_482 })
      expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    })

    it('이름을 비우면 [저장] 을 누를 수 없고 이유를 알린다', async () => {
      render(<Harness />)
      await userEvent.click(screen.getByRole('button', { name: /장부 이름/ }))

      await userEvent.clear(screen.getByLabelText('장부 이름'))

      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
      expect(screen.getByText('장부 이름을 적어 주세요')).toBeInTheDocument()
    })

    it('[작년 이월금] 줄은 금액 + 남았어요/적자였어요 화면을 열고, 적자로 바꿔 저장하면 이름은 그대로 둔다', async () => {
      const onSaveBookInfo = vi.fn()
      render(<Harness handlers={{ onSaveBookInfo }} />)
      await userEvent.click(screen.getByRole('button', { name: /작년 이월금/ }))

      expect(screen.getByRole('heading', { level: 1, name: '작년 이월금 바꾸기' })).toBeInTheDocument()
      expect(screen.getByLabelText('작년 이월금')).toHaveValue('370,482')
      await userEvent.click(screen.getByRole('button', { name: '적자였어요' }))
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(onSaveBookInfo).toHaveBeenCalledWith({ name: '한랑드림', kind: 'club', carryover: -370_482 })
    })

    it('이월금을 지우고 0 을 적으면 0 이 보이고 0원으로 저장할 수 있다', async () => {
      const onSaveBookInfo = vi.fn()
      render(<Harness handlers={{ onSaveBookInfo }} />)
      await userEvent.click(screen.getByRole('button', { name: /작년 이월금/ }))

      const amount = screen.getByLabelText('작년 이월금')
      await userEvent.clear(amount)
      await userEvent.type(amount, '0')
      expect(amount).toHaveValue('0')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(onSaveBookInfo).toHaveBeenCalledWith({ name: '한랑드림', kind: 'club', carryover: 0 })
    })

    it('이월금이 0원이면 편집 화면 금액 칸에 0 이 보인다', async () => {
      render(<Harness ledger={{ ...LEDGER, carryover: 0 }} />)
      await userEvent.click(screen.getByRole('button', { name: /작년 이월금/ }))

      expect(screen.getByLabelText('작년 이월금')).toHaveValue('0')
      // 바꾼 것이 없으면 [저장] 을 누를 수 없다
      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    })

    it('[‹ 설정] 을 누르면 저장하지 않고 설정 목록으로 돌아온다', async () => {
      const onSaveBookInfo = vi.fn()
      render(<Harness handlers={{ onSaveBookInfo }} />)
      await userEvent.click(screen.getByRole('button', { name: /장부 이름/ }))
      await userEvent.type(screen.getByLabelText('장부 이름'), '2')

      await userEvent.click(screen.getByRole('button', { name: '설정' }))

      expect(onSaveBookInfo).not.toHaveBeenCalled()
      expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    })

    it('편집 화면에서 안드로이드 뒤로 버튼을 누르면 설정 목록으로 돌아온다 (장부까지 나가지 않는다)', async () => {
      render(<Harness />)
      await userEvent.click(screen.getByRole('button', { name: /작년 이월금/ }))

      pressBackButton()

      expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    })
  })

  describe('SPEC-005 장부 정보', () => {
    it('가계부 장부는 종류 줄이 "개인 가계부"(집 아이콘)이고 이월금 줄 이름이 종류에 맞다', async () => {
      render(<Harness kind="household" />)

      const rows = within(screen.getByRole('region', { name: '장부 정보' })).getAllByTestId('list-row')
      expect(rows[1]?.textContent).toBe('종류 개인 가계부')
      expect(rows[1]?.querySelector('[data-icon="home"]')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /^작년에서 넘어온 돈/ }))

      expect(screen.getByRole('heading', { level: 1, name: '작년에서 넘어온 돈 바꾸기' })).toBeInTheDocument()
      expect(screen.getByLabelText('작년에서 넘어온 돈')).toHaveValue('370,482')
    })

    it('[종류] 줄을 누르면 "어떤 장부인가요?" 선택 창이 뜨고, 다른 종류를 고르면 이름·이월금은 그대로 종류만 바꿔 저장한다', async () => {
      const onSaveBookInfo = vi.fn()
      render(<Harness handlers={{ onSaveBookInfo }} />)

      await userEvent.click(screen.getByRole('button', { name: /^종류/ }))
      const sheet = screen.getByRole('dialog', { name: '어떤 장부인가요?' })
      expect(within(sheet).getByRole('button', { name: '동아리·모임' })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(within(sheet).getByRole('button', { name: '개인 가계부' }))

      expect(onSaveBookInfo).toHaveBeenCalledWith({ name: '한랑드림', kind: 'household', carryover: 370_482 })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    })

    it('지금 종류를 다시 고르면 저장하지 않고 창만 닫는다', async () => {
      const onSaveBookInfo = vi.fn()
      render(<Harness handlers={{ onSaveBookInfo }} />)

      await userEvent.click(screen.getByRole('button', { name: /^종류/ }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '동아리·모임' }))

      expect(onSaveBookInfo).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('AC-7 맨 아래 위험 글자형 [이 장부 지우기] 는 확인([아니요] [지우기]) 뒤에만 지워 달라고 알린다', async () => {
      const onDeleteBook = vi.fn(() => true)
      render(<Harness handlers={{ onDeleteBook }} />)

      const remove = screen.getByRole('button', { name: '이 장부 지우기' })
      expect(remove).toHaveAttribute('data-variant', 'danger-text')
      await userEvent.click(remove)

      const dialog = screen.getByRole('alertdialog', { name: '‘한랑드림’ 장부와 기록을 모두 지울까요?' })
      expect(dialog).toHaveAccessibleDescription('되돌릴 수 없어요')
      await userEvent.click(within(dialog).getByRole('button', { name: '아니요' }))
      expect(onDeleteBook).not.toHaveBeenCalled()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

      await userEvent.click(remove)
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))
      expect(onDeleteBook).toHaveBeenCalledOnce()
    })

    it('AC-7 장부가 하나뿐이면 [이 장부 지우기] 가 없다', () => {
      render(<Harness canDeleteBook={false} />)

      expect(screen.queryByRole('button', { name: '이 장부 지우기' })).not.toBeInTheDocument()
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
      expect(groups.map((group) => group.querySelector('h2')?.textContent)).toEqual(['장부 정보', '앱'])
      const [row] = within(screen.getByRole('region', { name: '앱' })).getAllByTestId('list-row')
      expect(row.textContent?.trim()).toBe('홈 화면에 추가 기록이 더 안전해요')
      expect(row.querySelector('[data-icon="phone"]')).toBeInTheDocument()
      expect(row.querySelector('[data-icon="right"]')).toBeInTheDocument()
    })

    it('홈 화면 앱으로 열었으면 [홈 화면에 추가] 줄이 없다', () => {
      render(<Harness install={{ standalone: true }} />)

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

describe('SPEC-006 설정 기록 지키기 (v2.6 맨 위 카드·다른 방법으로 옮기기)', () => {
  const NOT_FOUND_SERVER: KeepServer = {
    put: async () => 'ok',
    get: async () => ({ status: 'not-found' }),
    remove: async () => true,
    sendStatus: async () => {},
  }

  function keepRow(overrides: Partial<KeepRow> = {}): KeepRow {
    return {
      statusText: '자동으로 지키기 켜짐 · 3분 전에 보관했어요',
      enabled: true,
      tooLarge: false,
      onTurnOn: vi.fn(),
      onTurnOff: vi.fn(),
      ...overrides,
    }
  }

  const keepCard = () => screen.getByRole('region', { name: '새 폰으로 옮기려면 이 코드만 적어 두세요' })
  const moreToggle = () => screen.getByRole('button', { name: '다른 방법으로 옮기기' })

  async function openMore() {
    await userEvent.click(moreToggle())
  }

  async function openKeepSheet() {
    await openMore()
    await userEvent.click(screen.getByRole('button', { name: /^자동으로 지키기/ }))
  }

  it('AC-10 설정 맨 위 카드 안에 제목·복구 코드·안내·주 버튼 [복구 코드 보내기]·상태 줄이 이 순서로 있다', () => {
    render(<Harness keep={keepRow()} keepServer={NOT_FOUND_SERVER} />)

    const card = keepCard()
    const parts = [
      within(card).getByRole('heading', { level: 2, name: '새 폰으로 옮기려면 이 코드만 적어 두세요' }),
      within(card).getByTestId('recovery-code-value'),
      within(card).getByText('새 폰에서 이 코드를 넣으면 기록이 돌아와요. 가족에게도 보내 두세요.'),
      within(card).getByRole('button', { name: '복구 코드 보내기' }),
      within(card).getByTestId('keep-status'),
    ]
    expect(parts[1]).toHaveTextContent('HK7M-29QF-MX4P-8R2D')
    // 문서 순서가 위 순서와 같다
    for (let index = 1; index < parts.length; index += 1) {
      expect(parts[index - 1].compareDocumentPosition(parts[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // 설정 화면의 주 버튼은 [복구 코드 보내기] 하나
    expect(within(card).getByRole('button', { name: '복구 코드 보내기' })).toHaveAttribute('data-variant', 'primary')
  })

  it('AC-11 상태 줄은 구름 아이콘 + 상태 글자이고 누를 수 없다', () => {
    render(<Harness keep={keepRow()} keepServer={NOT_FOUND_SERVER} />)

    const status = screen.getByTestId('keep-status')
    expect(status).toHaveTextContent('자동으로 지키기 켜짐 · 3분 전에 보관했어요')
    expect(status.querySelector('[data-icon="cloud"]')).toBeInTheDocument()
    expect(status.closest('button')).toBeNull()
    expect(within(keepCard()).getAllByRole('button').map((button) => button.textContent)).toEqual(['복구 코드 보내기'])
  })

  it('보관본이 너무 커 올리지 못했으면 상태 줄 다음 줄에 기록 파일을 보내 두라고 알린다', () => {
    render(<Harness keep={keepRow({ tooLarge: true })} keepServer={NOT_FOUND_SERVER} />)

    const status = screen.getByTestId('keep-status')
    const warning = within(keepCard()).getByText('기록이 너무 많아 보관하지 못했어요. 기록 파일을 보내 두세요')
    expect(status.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-6 [복구 코드 보내기] 를 누르면 코드 보내기를 알린다', async () => {
    const onShareCode = vi.fn()
    render(<Harness keep={keepRow()} handlers={{ onShareCode }} />)

    await userEvent.click(screen.getByRole('button', { name: '복구 코드 보내기' }))
    expect(onShareCode).toHaveBeenCalledOnce()
  })

  it('AC-12 "다른 방법으로 옮기기" 는 처음엔 접혀 있고, 펼치면 네 줄이 순서대로 있다', async () => {
    render(<Harness keep={keepRow()} keepServer={NOT_FOUND_SERVER} lastBackupAt="2026-10-15T10:00:00.000+09:00" />)

    expect(moreToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /기록 파일 보내기/ })).not.toBeInTheDocument()

    await openMore()

    expect(moreToggle()).toHaveAttribute('aria-expanded', 'true')
    const body = screen.getByTestId('settings-more-body')
    expect(moreToggle()).toHaveAttribute('aria-controls', body.id)
    const rows = within(body).getAllByTestId('list-row')
    expect(rows.map((row) => row.textContent?.trim())).toEqual([
      '기록 파일 보내기 마지막: 2026년 10월 15일',
      '기록 파일 불러오기 받아 둔 파일로 기록 되살리기',
      '복구 코드로 불러오기 다른 폰의 코드를 넣기',
      '자동으로 지키기 켜짐',
    ])
    expect(rows.map((row) => row.querySelector('[data-icon]')?.getAttribute('data-icon'))).toEqual(['share', 'folder', 'key', 'cloud'])

    // 다시 누르면 접힌다
    await userEvent.click(moreToggle())
    expect(moreToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('settings-more-body')).not.toBeInTheDocument()
  })

  it('AC-12 펼친 기록 파일 줄은 지금 동작 그대로 보내기·불러오기를 한다', async () => {
    const onSendBackup = vi.fn()
    const onImportBackup = vi.fn()
    render(<Harness keep={keepRow()} handlers={{ onSendBackup, onImportBackup }} />)
    await openMore()

    expect(screen.getByRole('button', { name: /^기록 파일 보내기/ })).toHaveTextContent('아직 보내지 않았어요')
    await userEvent.click(screen.getByRole('button', { name: /^기록 파일 보내기/ }))
    await userEvent.click(screen.getByRole('button', { name: /^기록 파일 불러오기/ }))

    expect(onSendBackup).toHaveBeenCalledOnce()
    expect(onImportBackup).toHaveBeenCalledOnce()
  })

  it('30일 안내 띠가 떠 있어도 "다른 방법으로 옮기기" 는 접혀 있다', () => {
    render(<Harness keep={keepRow()} needsBackup />)

    expect(screen.getByTestId('notice-bar')).toHaveTextContent('한 달 넘게 기록 파일을 보내지 않았어요')
    expect(moreToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('AC-13 설정 묶음 순서는 기록 지키기 카드 → 다른 방법으로 옮기기 → 장부 정보 → 앱 → [이 장부 지우기] 다', () => {
    render(<Harness keep={keepRow()} keepServer={NOT_FOUND_SERVER} />)

    const blocks = [...screen.getByTestId('settings-screen').querySelectorAll('[data-testid^="settings-block-"]')]
    expect(blocks.map((block) => block.getAttribute('data-testid'))).toEqual([
      'settings-block-keep',
      'settings-block-more',
      'settings-block-book',
      'settings-block-app',
      'settings-block-delete',
    ])
    expect(within(screen.getByTestId('settings-block-book')).getByRole('heading', { name: '장부 정보' })).toBeInTheDocument()
  })

  it('AC-14 서버 주소가 없는 빌드면 맨 위 카드·접기·"준비 중"·[복구 코드로 불러오기] 없이 기록 파일 두 줄이 맨 위에 있다', () => {
    render(<Harness />)

    expect(screen.queryByRole('region', { name: '새 폰으로 옮기려면 이 코드만 적어 두세요' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다른 방법으로 옮기기' })).not.toBeInTheDocument()
    expect(screen.queryByText('준비 중')).not.toBeInTheDocument()
    expect(screen.queryByTestId('recovery-code-value')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /복구 코드로 불러오기/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/자동으로 지키기/)).not.toBeInTheDocument()

    const blocks = [...screen.getByTestId('settings-screen').querySelectorAll('[data-testid^="settings-block-"]')]
    expect(blocks.map((block) => block.getAttribute('data-testid'))).toEqual([
      'settings-block-files',
      'settings-block-book',
      'settings-block-app',
      'settings-block-delete',
    ])
    expect(within(screen.getByTestId('settings-block-files')).getAllByTestId('list-row').map((row) => row.querySelector('.ui-row__title')?.textContent)).toEqual([
      '기록 파일 보내기',
      '기록 파일 불러오기',
    ])
  })

  it('AC-14 복구 코드가 아직 없으면(읽기 전용 시작) 서버가 있어도 기록 파일 두 줄만 맨 위에 있다', () => {
    render(<Harness keep={keepRow()} keepServer={NOT_FOUND_SERVER} recoveryCode="" />)

    expect(screen.queryByTestId('recovery-code-value')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다른 방법으로 옮기기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /복구 코드로 불러오기/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^자동으로 지키기/ })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('settings-block-files')).getAllByTestId('list-row')).toHaveLength(2)
  })

  it('자동으로 지키기 줄을 누르면 [켜기 | 끄기] 선택 창, 끄기를 고르면 서버 사본을 지울지 묻는다 ([남겨 두기])', async () => {
    const onTurnOff = vi.fn()
    render(<Harness keep={keepRow({ onTurnOff })} />)

    await openKeepSheet()
    expect(screen.getByRole('dialog', { name: '자동으로 지키기' })).toBeInTheDocument()
    const options = within(screen.getByRole('group', { name: '자동으로 지키기' }))
    expect(options.getByRole('button', { name: '켜기' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(options.getByRole('button', { name: '끄기' }))

    const dialog = await screen.findByRole('alertdialog', { name: '보관해 둔 기록도 지울까요?' })
    expect(dialog).toHaveAccessibleDescription('남겨 두면 나중에 복구 코드로 다시 불러올 수 있어요')
    await userEvent.click(within(dialog).getByRole('button', { name: '남겨 두기' }))

    expect(onTurnOff).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('끄면서 [지우기] 를 고르면 서버 사본도 지워 달라고 알린다', async () => {
    const onTurnOff = vi.fn()
    render(<Harness keep={keepRow({ onTurnOff })} />)

    await openKeepSheet()
    await userEvent.click(within(screen.getByRole('group', { name: '자동으로 지키기' })).getByRole('button', { name: '끄기' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '지우기' }))

    expect(onTurnOff).toHaveBeenCalledWith(true)
  })

  it('꺼져 있으면 줄 값은 "꺼짐", 켜기를 고르면 켜 달라고 알리고, 지금 상태를 다시 고르면 창만 닫는다', async () => {
    const onTurnOn = vi.fn()
    const onTurnOff = vi.fn()
    render(<Harness keep={keepRow({ statusText: '자동으로 지키기 꺼짐', enabled: false, onTurnOn, onTurnOff })} />)

    await openMore()
    expect(screen.getByRole('button', { name: /^자동으로 지키기/ })).toHaveTextContent('꺼짐')
    await userEvent.click(screen.getByRole('button', { name: /^자동으로 지키기/ }))
    await userEvent.click(within(screen.getByRole('group', { name: '자동으로 지키기' })).getByRole('button', { name: '끄기' }))
    expect(onTurnOff).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^자동으로 지키기/ }))
    await userEvent.click(within(screen.getByRole('group', { name: '자동으로 지키기' })).getByRole('button', { name: '켜기' }))
    expect(onTurnOn).toHaveBeenCalledOnce()
  })

  it('[복구 코드로 불러오기] 줄을 누르면 설정 위에 불러오기 화면이 열리고 [‹ 설정] 으로 돌아오면 펼친 채다', async () => {
    render(<Harness keep={keepRow()} keepServer={NOT_FOUND_SERVER} />)
    await openMore()

    await userEvent.click(screen.getByRole('button', { name: /^복구 코드로 불러오기/ }))

    expect(screen.getByRole('heading', { level: 1, name: '복구 코드로 불러오기' })).toBeInTheDocument()
    expect(screen.queryByTestId('settings-screen')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(screen.getByTestId('settings-screen')).toBeInTheDocument()
    expect(moreToggle()).toHaveAttribute('aria-expanded', 'true')
  })

  describe('#110 접근성 점검 09 뒤로 버튼', () => {
    it('자동으로 지키기를 끄며 묻는 창에서 뒤로 버튼을 누르면 [남겨 두기] 와 같이 끄고(사본은 남김) 창만 닫힌다', async () => {
      const onTurnOff = vi.fn()
      render(<Harness keep={keepRow({ onTurnOff })} />)
      await openKeepSheet()
      await userEvent.click(within(screen.getByRole('group', { name: '자동으로 지키기' })).getByRole('button', { name: '끄기' }))
      await screen.findByRole('alertdialog')

      pressBackButton()

      expect(onTurnOff).toHaveBeenCalledExactlyOnceWith(false)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: '자동으로 지키기' })).not.toBeInTheDocument()
      expect(screen.getByTestId('settings-screen')).toBeInTheDocument()
    })
  })
})

describe('#110 접근성 점검 09 설정 확인 창과 뒤로 버튼', () => {
  it('장부 지우기 확인 창에서 뒤로 버튼을 누르면 확인 창만 닫히고 지우지 않는다', async () => {
    const onDeleteBook = vi.fn(() => true)
    render(<Harness handlers={{ onDeleteBook }} />)
    await userEvent.click(screen.getByRole('button', { name: '이 장부 지우기' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    pressBackButton()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-screen')).toBeInTheDocument()
    expect(onDeleteBook).not.toHaveBeenCalled()
  })

  it('장부를 지우지 못하면(저장 실패) 확인 창을 닫고 설정에 남는다', async () => {
    const onDeleteBook = vi.fn(() => false)
    render(<Harness handlers={{ onDeleteBook }} />)
    await userEvent.click(screen.getByRole('button', { name: '이 장부 지우기' }))

    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))

    expect(onDeleteBook).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('SPEC-008 설정 [연습해 보기]', () => {
  const appRows = () =>
    within(screen.getByRole('region', { name: '앱' }))
      .getAllByTestId('list-row')
      .map((row) => row.textContent?.trim())

  it('AC-24 "앱" 묶음 맨 아래에 [연습해 보기](보조 "저장되지 않는 장부로 따라 해 봐요") 줄이 있다', () => {
    render(<Harness />)

    expect(appRows()).toEqual(['홈 화면에 추가 기록이 더 안전해요', '연습해 보기 저장되지 않는 장부로 따라 해 봐요', '버전 2.6.0'])
    const row = screen.getByRole('button', { name: /연습해 보기/ })
    expect(row.querySelector('[data-icon="right"]')).toBeInTheDocument()
  })

  it('AC-24 홈 화면 앱에서도 "앱" 묶음에 [연습해 보기] 한 줄이 있다', () => {
    render(<Harness install={{ standalone: true }} />)

    expect(appRows()).toEqual(['연습해 보기 저장되지 않는 장부로 따라 해 봐요', '버전 2.6.0'])
  })

  it('[연습해 보기] 를 누르면 연습을 연다', async () => {
    const onPractice = vi.fn()
    render(<Harness handlers={{ onPractice }} />)

    await userEvent.click(screen.getByRole('button', { name: /연습해 보기/ }))

    expect(onPractice).toHaveBeenCalledOnce()
  })
})

describe('SPEC-002 설정 버전 줄·새 버전 바꾸기 (#135)', () => {
  // 옛 워커가 다루던 화면 흉내: controllerchange 를 보내면 새 버전을 받은 상태가 된다
  function controlledWorkers() {
    return Object.assign(new EventTarget(), { controller: {} })
  }
  const versionRow = () => within(screen.getByRole('region', { name: '앱' })).getAllByTestId('list-row').at(-1)

  it('"앱" 묶음 맨 아래에 누를 수 없는 버전 줄이 본 주소 버전을 보인다', () => {
    render(<Harness />)

    const row = versionRow()
    expect(row?.textContent?.trim()).toBe('버전 2.6.0')
    expect(row?.tagName).not.toBe('BUTTON')
    expect(row?.querySelector('[data-icon="right"]')).not.toBeInTheDocument()
  })

  it('미리보기 빌드 값("2.6.0 · 미리보기 abc1234")도 그대로 보인다', () => {
    render(<Harness version={{ ...MAIN_VERSION, label: '2.6.0 · 미리보기 abc1234' }} />)

    expect(versionRow()?.textContent?.trim()).toBe('버전 2.6.0 · 미리보기 abc1234')
  })

  it('홈 화면 앱에서도 버전 줄이 보인다', () => {
    render(<Harness install={{ standalone: true }} />)

    expect(versionRow()?.textContent?.trim()).toBe('버전 2.6.0')
  })

  it('새 버전을 받지 않았으면 [지금 바꾸기] 가 없다', () => {
    render(<Harness />)

    expect(screen.queryByRole('button', { name: '지금 바꾸기' })).not.toBeInTheDocument()
    expect(screen.queryByText('새 버전을 받았어요')).not.toBeInTheDocument()
  })

  it('새 버전을 받으면 버전 줄에 "새 버전을 받았어요" 와 [지금 바꾸기] 가 생기고, 누르면 새로 연다', async () => {
    const workers = controlledWorkers()
    const reload = vi.fn()
    render(<Harness version={{ label: '2.6.0', updates: createUpdateWatcher(workers), reload }} />)

    act(() => {
      workers.dispatchEvent(new Event('controllerchange'))
    })

    expect(versionRow()?.textContent?.trim()).toBe('버전 새 버전을 받았어요 2.6.0')
    await userEvent.click(screen.getByRole('button', { name: '지금 바꾸기' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
