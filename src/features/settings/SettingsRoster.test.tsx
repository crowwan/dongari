import { describe, expect, it } from 'vitest'
import { useEffect, useRef, useState } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { carryoverWords } from '../../domain/book'
import {
  addMember,
  changeDuesStart,
  changeMonthlyFee,
  deleteMember,
  memberHasRecords,
  monthlyFeeOf,
  updateMember,
} from '../../domain/members'
import { CURRENT_SCHEMA_VERSION, type Book, type BookKind, type Ledger, type Member } from '../../domain/types'
import { isStoredData } from '../../storage/schema'
import { book, duesBook } from '../../test/ledgerFixtures'
import { createInstallPromptStore } from '../install/installPrompt'
import { useScreenHistory } from '../useScreenHistory'
import { createUpdateWatcher } from '../version/appVersion'
import type { DuesSettings } from './RosterPages'
import { SettingsScreen } from './SettingsScreen'

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'

// 2026년 장부를 보는 설정, 이번 달 2026년 11월
const YEAR = 2026
const THIS_MONTH = '2026-11'

type HarnessProps = {
  initial?: Book
  kind?: BookKind
  // 바뀐 장부를 받아 본다 (저장 형식 검사·저장 값 확인)
  onBook?: (changed: Book) => void
}

// App 처럼 설정 화면에 회원 명단 값을 넘기고, 바꾸는 동작은 도메인 함수로 장부에 반영한다
function Harness({ initial = duesBook(), kind = 'club', onBook }: HarnessProps) {
  const sheets = useScreenHistory()
  const [target, setTarget] = useState(initial)
  const ids = useRef(0)
  const [installPrompt] = useState(() => createInstallPromptStore(new EventTarget()))
  useEffect(() => {
    onBook?.(target)
  }, [target, onBook])

  const ledger = target.ledgers[String(YEAR)]
  const changeLedger = (change: (item: Ledger) => Ledger) =>
    setTarget((current) => {
      const item = current.ledgers[String(YEAR)]
      if (!item) throw new Error('장부가 없다')
      return { ...current, ledgers: { ...current.ledgers, [String(YEAR)]: change(item) } }
    })
  const dues: DuesSettings = {
    members: target.members ?? [],
    startMonth: target.dues?.startMonth,
    monthlyFee: monthlyFeeOf(target, YEAR),
    hasRecords: (id) => memberHasRecords(target, id),
    thisMonth: THIS_MONTH,
    onAddMember: (input) =>
      setTarget((current) => addMember(current, input, { createId: () => `new-${++ids.current}`, year: YEAR })),
    onUpdateMember: (id, changes) => setTarget((current) => updateMember(current, id, changes)),
    onDeleteMember: (id) => setTarget((current) => deleteMember(current, id)),
    onChangeStartMonth: (month) => setTarget((current) => changeDuesStart(current, month)),
    onChangeMonthlyFee: (fee) => changeLedger((item) => changeMonthlyFee(item, fee)),
  }

  return (
    <SettingsScreen
      bookName="한랑드림"
      bookKind={kind}
      carryoverWords={carryoverWords(kind, false)}
      canDeleteBook={false}
      onDeleteBook={() => true}
      year={YEAR}
      yearChoices={[YEAR]}
      ledger={ledger}
      sheets={sheets}
      onChangeYear={() => {}}
      onSaveBookInfo={() => {}}
      onSendBackup={() => {}}
      onImportBackup={() => {}}
      onShareCode={() => {}}
      onBack={() => {}}
      install={{ standalone: false, userAgent: CHROME_UA, installPrompt }}
      version={{ label: '2.8.0', updates: createUpdateWatcher(undefined), reload: () => {} }}
      dues={dues}
    />
  )
}

// 명단: 김도윤(시작 달부터), 강민지(10월부터 쉬어요), 정하늘(7월에 들어옴), 오현우(그만둠), 박서연(기록 없음)
const ROSTER: Member[] = [
  { id: 'm1', name: '김도윤', joined: '2026-01', off: [] },
  { id: 'm2', name: '강민지', joined: '2025-07', off: ['2026-02', '2026-10', '2026-11'], opening: -30_000 },
  { id: 'm3', name: '정하늘', joined: '2026-07', off: [] },
  { id: 'm4', name: '오현우', joined: '2026-01', left: '2026-01', off: [] },
  { id: 'm5', name: '박서연', joined: '2026-01', off: [] },
]

const rosterBook = () => duesBook({ members: ROSTER })

// 명단이 아직 없는 동아리 장부 (이미 쓰던 분, SPEC-010 11절)
const plainBook = () => book([{ year: YEAR, carryover: 0, entries: [] }])

function pressBackButton() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
}

const heading = (name: string) => screen.getByRole('heading', { level: 1, name })

async function openRoster() {
  await userEvent.click(screen.getByRole('button', { name: /^회원 명단/ }))
}

async function openMember(name: RegExp) {
  await openRoster()
  await userEvent.click(screen.getByRole('button', { name }))
}

describe('SPEC-010 회원 명단·월 회비·시작 달 설정 (6절)', () => {
  describe('설정 장부 정보 두 줄', () => {
    it('AC-20 동아리 장부는 장부 정보에서 종류 다음·작년 이월금 앞에 [회원 명단](지금 회원 수)·[월 회비](장부 연도) 줄이 있다', () => {
      render(<Harness />)

      const rows = within(screen.getByRole('region', { name: '장부 정보' })).getAllByTestId('list-row')
      expect(rows.map((row) => row.textContent)).toEqual([
        '장부 이름 한랑드림',
        '종류 동아리·모임',
        '회원 명단 회비 표에 나오는 분들 1명',
        '월 회비 2026년 20,000원',
        '작년 이월금 0원',
        '장부 연도 2026년',
      ])
      expect(rows[2]?.querySelector('[data-icon]')).toHaveAttribute('data-icon', 'users')
      expect(rows[3]?.querySelector('[data-icon]')).toHaveAttribute('data-icon', 'coin')
    })

    it('AC-20 개인 가계부에는 회원 명단·월 회비 줄이 없다 (값은 지우지 않고 숨긴다)', () => {
      render(<Harness kind="household" />)

      expect(screen.queryByRole('button', { name: /^회원 명단/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^월 회비/ })).not.toBeInTheDocument()
    })

    it('월 회비를 어느 해에도 정하지 않았으면 값이 "정하지 않음"이다', () => {
      render(<Harness initial={plainBook()} />)

      expect(screen.getByRole('button', { name: '월 회비 2026년 정하지 않음' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '회원 명단 회비 표에 나오는 분들 0명' })).toBeInTheDocument()
    })

    it('AC-20 [월 회비] 줄은 장부 연도 금액 화면을 열고, 바꿔 [저장]하면 설정으로 돌아와 새 금액을 보인다', async () => {
      let saved: Book | undefined
      render(<Harness onBook={(changed) => (saved = changed)} />)

      await userEvent.click(screen.getByRole('button', { name: /^월 회비/ }))
      expect(heading('월 회비 바꾸기')).toBeInTheDocument()
      const fee = screen.getByLabelText('2026년 월 회비')
      expect(fee).toHaveValue('20,000')
      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
      await userEvent.clear(fee)
      await userEvent.type(fee, '25000')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(heading('설정')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '월 회비 2026년 25,000원' })).toBeInTheDocument()
      expect(saved?.ledgers['2026']?.monthlyFee).toBe(25_000)
    })

    it('월 회비를 비우면 [저장]을 누를 수 없다', async () => {
      render(<Harness />)
      await userEvent.click(screen.getByRole('button', { name: /^월 회비/ }))

      await userEvent.clear(screen.getByLabelText('2026년 월 회비'))

      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    })
  })

  describe('회원 명단 화면', () => {
    it('지금 회원(가나다·보조 줄) → [회원 넣기] → 그만둔 분 → 시작 달 안내 순서로 보인다', async () => {
      render(<Harness initial={rosterBook()} />)

      await openRoster()

      expect(heading('회원 명단')).toBeInTheDocument()
      const currentList = screen.getByRole('list', { name: '지금 회원' })
      const current = within(currentList).getAllByRole('button')
      expect(current.map((row) => row.textContent)).toEqual(['강민지 10월부터 쉬어요', '김도윤', '박서연', '정하늘 7월에 들어왔어요'])
      const leftGroup = screen.getByRole('region', { name: '그만둔 분' })
      expect(within(leftGroup).getAllByRole('button').map((row) => row.textContent)).toEqual(['오현우 2025년 12월까지'])
      expect(screen.getByText('회비 표는 2026년 1월부터 계산해요')).toBeInTheDocument()
      // 위에서 아래로: 지금 회원 → [회원 넣기] → 그만둔 분 → 시작 달 [바꾸기]
      const order = [
        currentList,
        screen.getByRole('button', { name: '회원 넣기' }),
        leftGroup,
        screen.getByRole('button', { name: '시작 달 바꾸기' }),
      ]
      order.slice(1).forEach((element, index) => {
        expect(order[index]?.compareDocumentPosition(element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      })
    })

    it('명단이 비어 있으면 안내와 [회원 넣기]만 있고 그만둔 분·시작 달 안내는 없다', async () => {
      render(<Harness initial={plainBook()} />)

      await openRoster()

      expect(screen.getByText('아직 회원이 없어요. 회비 표에 나올 분을 넣어 주세요')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '회원 넣기' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: '그만둔 분' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '시작 달 바꾸기' })).not.toBeInTheDocument()
    })

    it('[‹ 설정] 이나 안드로이드 뒤로 버튼을 누르면 설정으로 돌아온다', async () => {
      render(<Harness />)
      await openRoster()

      await userEvent.click(screen.getByRole('button', { name: '설정' }))
      expect(heading('설정')).toBeInTheDocument()

      await openRoster()
      pressBackButton()
      expect(heading('설정')).toBeInTheDocument()
    })
  })

  describe('회원 넣기', () => {
    it('이름과 들어온 달(기본 이번 달)을 넣으면 명단에 생기고 회원 명단으로 돌아온다', async () => {
      render(<Harness />)
      await openRoster()

      await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
      expect(heading('회원 넣기')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '들어온 달 2026년 11월' })).toBeInTheDocument()
      await userEvent.type(screen.getByLabelText('이름'), '박서연')
      await userEvent.click(screen.getByRole('button', { name: '들어온 달 2026년 11월' }))
      const sheet = screen.getByRole('dialog', { name: '언제 들어왔나요?' })
      expect(within(sheet).getByRole('button', { name: '11월' })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(within(sheet).getByRole('button', { name: '7월' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '넣기' }))

      expect(heading('회원 명단')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '박서연 7월에 들어왔어요' })).toBeInTheDocument()
    })

    it('같은 이름이 있으면 안내만 하고 막지 않는다', async () => {
      render(<Harness />)
      await openRoster()
      await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))

      await userEvent.type(screen.getByLabelText('이름'), '김도윤')

      expect(screen.getByLabelText('이름')).toHaveAccessibleDescription('같은 이름이 있어요. 구분할 수 있게 적어 주세요')
      await userEvent.click(screen.getByRole('button', { name: '넣기' }))
      expect(within(screen.getByRole('list', { name: '지금 회원' })).getAllByRole('button', { name: /^김도윤/ })).toHaveLength(2)
    })

    it('이름을 적기 전에는 [넣기]를 누를 수 없다', async () => {
      render(<Harness />)
      await openRoster()
      await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))

      expect(screen.getByRole('button', { name: '넣기' })).toBeDisabled()
      await userEvent.type(screen.getByLabelText('이름'), '  ')
      expect(screen.getByRole('button', { name: '넣기' })).toBeDisabled()
    })

    it('명단을 처음 넣으면 회비 표 시작 달이 장부 연도 1월로 정해지고, 저장 형식 검사를 통과한다', async () => {
      let saved: Book | undefined
      render(<Harness initial={plainBook()} onBook={(changed) => (saved = changed)} />)
      await openRoster()

      await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
      await userEvent.type(screen.getByLabelText('이름'), '김도윤')
      await userEvent.click(screen.getByRole('button', { name: '넣기' }))

      expect(screen.getByText('회비 표는 2026년 1월부터 계산해요')).toBeInTheDocument()
      expect(saved?.members).toEqual([{ id: 'new-1', name: '김도윤', joined: '2026-11', off: [] }])
      expect(isStoredData({ schemaVersion: CURRENT_SCHEMA_VERSION, books: [saved], settings: {} })).toBe(true)
    })

    it('안드로이드 뒤로 버튼을 누르면 넣지 않고 회원 명단으로 돌아온다 (설정까지 나가지 않는다)', async () => {
      render(<Harness />)
      await openRoster()
      await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
      await userEvent.type(screen.getByLabelText('이름'), '박서연')

      pressBackButton()

      expect(heading('회원 명단')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^박서연/ })).not.toBeInTheDocument()
      pressBackButton()
      expect(heading('설정')).toBeInTheDocument()
    })

    it('들어온 달 선택 창에서 뒤로 버튼을 누르면 창만 닫히고 회원 넣기에 남는다', async () => {
      render(<Harness />)
      await openRoster()
      await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
      await userEvent.click(screen.getByRole('button', { name: /^들어온 달/ }))

      pressBackButton()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(heading('회원 넣기')).toBeInTheDocument()
    })
  })

  describe('회원 정보 편집', () => {
    it('이름 줄을 누르면 이름·들어온 달·그만뒀어요·시작할 때 남은 돈이 채워진 화면이 열리고, 바꿔 [저장]하면 명단에 반영된다', async () => {
      render(<Harness initial={rosterBook()} />)
      await openMember(/^정하늘/)

      expect(heading('회원 정보 바꾸기')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '회원 명단' })).toBeInTheDocument()
      const name = screen.getByLabelText('이름')
      expect(name).toHaveValue('정하늘')
      expect(screen.getByRole('button', { name: '들어온 달 2026년 7월' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '그만뒀어요' })).toBeInTheDocument()
      expect(screen.getByLabelText('시작할 때 남은 돈')).toHaveValue('0')
      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()

      await userEvent.clear(name)
      await userEvent.type(name, '정하늘B')
      await userEvent.click(screen.getByRole('button', { name: '들어온 달 2026년 7월' }))
      await userEvent.click(within(screen.getByRole('dialog', { name: '언제 들어왔나요?' })).getByRole('button', { name: '9월' }))
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(heading('회원 명단')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '정하늘B 9월에 들어왔어요' })).toBeInTheDocument()
    })

    it('AC-21 [그만뒀어요] → 마지막 회원 달을 고르고 [저장]하면 그만둔 분으로 옮겨진다 (그 다음 달부터 회원이 아님)', async () => {
      let saved: Book | undefined
      render(<Harness initial={rosterBook()} onBook={(changed) => (saved = changed)} />)
      await openMember(/^김도윤/)

      await userEvent.click(screen.getByRole('button', { name: '그만뒀어요' }))
      const sheet = screen.getByRole('dialog', { name: '몇 월까지 회원이었나요?' })
      await userEvent.click(within(sheet).getByRole('button', { name: '10월' }))
      expect(screen.getByRole('button', { name: '그만둔 달 2026년 10월까지' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      const left = within(screen.getByRole('region', { name: '그만둔 분' })).getAllByRole('button')
      expect(left.map((row) => row.textContent)).toEqual(['김도윤 10월까지', '오현우 2025년 12월까지'])
      expect(saved?.members?.find((member) => member.id === 'm1')?.left).toBe('2026-11')
    })

    it('[다시 회원으로]를 누르고 [저장]하면 그만둔 달을 비우고 지금 회원으로 돌아온다', async () => {
      render(<Harness initial={rosterBook()} />)
      await openMember(/^오현우/)
      expect(screen.getByRole('button', { name: '그만둔 달 2025년 12월까지' })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: '다시 회원으로' }))
      expect(screen.getByRole('button', { name: '그만뒀어요' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(within(screen.getByRole('list', { name: '지금 회원' })).getByRole('button', { name: /^오현우/ })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: '그만둔 분' })).not.toBeInTheDocument()
    })

    it('시작할 때 남은 돈: 덜 낸 돈이면 [덜 낸 돈]이 골라져 있고, [미리 낸 돈]으로 바꿔 저장하면 미리 낸 돈(양수)이 된다', async () => {
      let saved: Book | undefined
      render(<Harness initial={rosterBook()} onBook={(changed) => (saved = changed)} />)
      await openMember(/^강민지/)

      expect(screen.getByLabelText('시작할 때 남은 돈')).toHaveValue('30,000')
      expect(screen.getByRole('button', { name: '덜 낸 돈' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('회비 표 시작 달(2026년 1월) 앞까지 덜 냈거나 미리 낸 돈이에요')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: '미리 낸 돈' }))
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      expect(saved?.members?.find((member) => member.id === 'm2')?.opening).toBe(30_000)
    })

    it('AC-21 회비 기록에 낸 분으로 들어간 회원은 [이 회원 지우기] 대신 그만둔 분으로 옮기라는 안내가 보인다', async () => {
      render(<Harness initial={rosterBook()} />)
      await openMember(/^김도윤/)

      expect(screen.queryByRole('button', { name: '이 회원 지우기' })).not.toBeInTheDocument()
      expect(screen.getByText('회비 기록이 있어 지울 수 없어요. 그만둔 분으로 옮겨 주세요')).toBeInTheDocument()
    })

    it('AC-21 기록에 없는 회원은 [이 회원 지우기] → 확인 [지우기] 뒤 명단에서 사라지고 회원 명단으로 돌아온다', async () => {
      render(<Harness initial={rosterBook()} />)
      await openMember(/^박서연/)

      await userEvent.click(screen.getByRole('button', { name: '이 회원 지우기' }))
      const dialog = screen.getByRole('alertdialog', { name: '‘박서연’ 님을 명단에서 지울까요?' })
      await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

      expect(heading('회원 명단')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^박서연/ })).not.toBeInTheDocument()
    })

    it('지우기 확인 창에서 뒤로 버튼을 누르면 확인 창만 닫히고 지우지 않는다', async () => {
      render(<Harness initial={rosterBook()} />)
      await openMember(/^박서연/)
      await userEvent.click(screen.getByRole('button', { name: '이 회원 지우기' }))
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()

      pressBackButton()

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(heading('회원 정보 바꾸기')).toBeInTheDocument()
      expect(screen.getByLabelText('이름')).toHaveValue('박서연')
    })

    it('안드로이드 뒤로 버튼을 누르면 저장하지 않고 회원 명단으로 돌아온다', async () => {
      render(<Harness initial={rosterBook()} />)
      await openMember(/^정하늘/)
      await userEvent.type(screen.getByLabelText('이름'), 'B')

      pressBackButton()

      expect(heading('회원 명단')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '정하늘 7월에 들어왔어요' })).toBeInTheDocument()
    })
  })

  describe('회비 표 시작 달', () => {
    it('[시작 달 바꾸기] → 해·달 선택 창(바꾸면 그 전 기록이 빠진다는 안내)에서 고르면 그 달부터 계산한다고 보인다', async () => {
      let saved: Book | undefined
      render(<Harness onBook={(changed) => (saved = changed)} />)
      await openRoster()

      await userEvent.click(screen.getByRole('button', { name: '시작 달 바꾸기' }))
      const sheet = screen.getByRole('dialog', { name: '회비 표를 언제부터 계산할까요?' })
      expect(within(sheet).getByText('바꾸면 그 전 기록은 회비 표에 들어가지 않아요')).toBeInTheDocument()
      expect(within(sheet).getByTestId('year-month-picker-year')).toHaveTextContent('2026년')
      expect(within(sheet).getByRole('button', { name: '1월' })).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(within(sheet).getByRole('button', { name: '이전 해' }))
      await userEvent.click(within(sheet).getByRole('button', { name: '7월' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('회비 표는 2025년 7월부터 계산해요')).toBeInTheDocument()
      expect(saved?.dues?.startMonth).toBe('2025-07')
    })
  })
})
