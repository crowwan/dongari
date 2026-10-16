// 연습 장부 단계 말풍선 규칙 (SPEC-008 "단계 말풍선"). 지금 화면 상태와 진행으로 띄울 말풍선을 순수 함수로 정한다.
//
//   ① 적기       장부 [+ 내역 적기] → 오늘 날짜 → 회비 → +1만 → [저장] → 간식비 날짜 → 간식비 → 금액 칸 → [저장] → [다 적었어요]
//   ② 정리 보기  장부 [N월 정리 보기] → (1초 읽기) → 월 정리 [‹ 장부로]
//   ③ 고치기     장부 간식비 줄 → 고치기 [이 내역 지우기] → (확인 창, 말풍선 없음)
//   ④ 결산 보내기 장부 [결산] → 결산 [사진 보내기] (거부되면 한 번 더 / 그냥 닫으면 [다음에 할게요] / 못 쓰는 기기는 [사진으로 저장])
//
// 진짜 내역 적기는 저장하면 날을 다시 묻는다(연달아 적기). 그래서 지출 예시도 날짜부터 짚는다 (스펙 1-d 앞과 다른 점, 변경 이력)
import type { EntryType } from '../../domain/types'
import { formatAmount } from '../../ui/money'
import type { EntryStep } from '../ledger/entrySteps'
import type { Screen } from '../useScreenHistory'
import type { PracticeExample } from './practiceScript'

// 말풍선이 가리키거나 같이 열어 두는 곳 (practiceTargets 가 화면에서 찾는다)
export type PracticeTarget =
  | 'add-entry' // 장부 아래 [+ 내역 적기]
  | 'quick-day' // "며칠인가요?" 빠른 칩 [오늘 16일]·[방금 16일]
  | 'day-field' // 날 숫자 칸
  | 'day-area' // 날 숫자 칸 + 빠른 칩 묶음 (말풍선이 덮지 않게 함께 밝힌다)
  | 'next' // 날을 치면 생기는 아래 [다음]
  | 'item-income' // 기본 항목 줄 (회비 / 용돈)
  | 'item-expense' // 기본 항목 줄 (간식비 / 장보기)
  | 'plus-10k' // [+1만]
  | 'amount-field' // 금액 칸
  | 'amount-area' // 금액 칸 + 빠른 더하기 묶음
  | 'save' // 내역 적기 [저장]
  | 'finish-add' // 연달아 적기 [다 적었어요]
  | 'month-summary' // 장부 [N월 정리 보기]
  | 'back-to-ledger' // 월 정리 [‹ 장부로]
  | 'expense-row' // 장부의 지출 예시 줄
  | 'delete' // 고치기 [이 내역 지우기]
  | 'year-summary' // 장부 위쪽 [결산]
  | 'send' // 결산 [사진 보내기]·[한 번 더 눌러 보내기]
  | 'save-picture' // 결산 [사진으로 저장] (공유를 못 쓰는 기기)

export type PracticeStage = 1 | 2 | 3 | 4

export type PracticeCoach = {
  step: string // 단계 이름 (말풍선 data-state)
  stage: PracticeStage // "연습 N / 4"
  target: PracticeTarget
  alsoOpen: PracticeTarget[] // 같이 열어 둘 곳 (누를 수 있다)
  spotlight: PracticeTarget[] // 가리키는 곳과 함께 밝게 보일 바로 옆 칸 (날 칸·금액 칸)
  message: string
  later: boolean // [다음에 할게요] 를 둔다 (공유 갈래 A·B)
}

// 연습 App 이 그릴 때마다 넘기는 지금 화면 상태
export type PracticeView = {
  screen: Screen['name']
  covered: boolean // 확인 창·선택 창·버릴까요가 떠 있다 (말풍선 없음)
  entries: readonly { name: string; type: EntryType }[] // 연습 장부의 기록
  // 내역 적기 화면: 지금 단계, 적는 금액, 이번에 들어와 저장한 수
  entry?: { step: EntryStep; amount: number; saved: number }
  canSend: boolean // 공유 창에 사진을 넘길 수 있는 기기 ([사진 보내기] 가 있다)
}

// 화면 밖에서 쌓이는 진행
export type PracticeProgress = {
  monthSeen: boolean // 월 정리를 열어 봤다 (② 끝)
  monthReady: boolean // 월 정리를 연 뒤 1초쯤 지났다
  sendReady: boolean // 공유 창이 거부돼 사진을 들고 있다 ([한 번 더 눌러 보내기])
  sendCancelled: boolean // 공유 창을 그냥 닫고 왔다 (갈래 A)
}

// 월 정리를 연 뒤 말풍선 없이 읽을 시간 (컷 3 "1초쯤")
export const MONTH_READING_MS = 1000

export const START_PROGRESS: PracticeProgress = { monthSeen: false, monthReady: false, sendReady: false, sendCancelled: false }

// 받침이 있으면 "을", 없으면 "를" (회비를 / 용돈을)
function withObject(word: string): string {
  const last = word.charCodeAt(word.length - 1) - 0xac00
  const hasFinal = last >= 0 && last < 11172 && last % 28 !== 0
  return `${word}${hasFinal ? '을' : '를'}`
}

const won = (amount: number) => `${formatAmount(amount)}원`

function coach(step: string, stage: PracticeStage, target: PracticeTarget, message: string, extra: Partial<PracticeCoach> = {}): PracticeCoach {
  return { step, stage, target, alsoOpen: [], spotlight: [], message, later: false, ...extra }
}

// ① 내역 적기 화면: 저장한 수로 수입·지출 예시 중 어느 쪽을 적는지 안다
function entryCoach(entry: NonNullable<PracticeView['entry']>, { income, expense }: PracticeExample): PracticeCoach | undefined {
  const { step, amount, saved } = entry
  if (saved >= 2) return coach('finish-add', 1, 'finish-add', '잘했어요! 다 적었으면 여기를 눌러 장부로 가요')
  const first = saved === 0
  const line = first ? income : expense
  switch (step) {
    case 'day':
      return coach(
        first ? 'income-day' : 'expense-day',
        1,
        'quick-day',
        first ? '오늘 날짜를 눌러요' : `${expense.name} ${won(expense.amount)}도 적어 볼까요? 날짜를 눌러요`,
        { alsoOpen: ['day-field', 'next'], spotlight: ['day-area'] },
      )
    case 'item':
      return coach(first ? 'income-item' : 'expense-item', 1, first ? 'item-income' : 'item-expense', `${withObject(line.name)} 눌러요`)
    case 'amount': {
      const ready = amount === line.amount
      if (!first) {
        const message = `${won(expense.amount)}을 적고 [저장]을 눌러요`
        return ready
          ? coach('expense-save', 1, 'save', message, { alsoOpen: ['amount-field'] })
          : coach('expense-amount', 1, 'amount-field', message)
      }
      return ready
        ? coach('income-save', 1, 'save', `${won(income.amount)}이 됐으면 [저장]을 눌러요`, { alsoOpen: ['amount-field'] })
        : coach('income-amount', 1, 'plus-10k', `+1만을 눌러 ${won(income.amount)}을 만들어요`, {
            alsoOpen: ['amount-field'],
            spotlight: ['amount-area'],
          })
    }
    case 'custom-name':
    case 'custom-type':
      // 말풍선이 항목 줄만 열어 두어 오지 않는 단계
      return undefined
  }
}

// ④ 결산 화면: 공유 결과에 따른 갈래
function sendCoach(view: PracticeView, progress: PracticeProgress): PracticeCoach {
  if (!view.canSend) {
    return coach('send', 4, 'save-picture', '이 기기에서는 바로 보낼 수 없어요. 사진으로 저장해 두었다가 보내요', { later: true })
  }
  if (progress.sendReady) return coach('send', 4, 'send', '사진이 준비됐어요. 한 번 더 눌러 주세요', { later: progress.sendCancelled })
  if (progress.sendCancelled) return coach('send', 4, 'send', '아직 안 보냈어요. 다시 눌러 보거나, 나중에 해도 돼요', { later: true })
  return coach('send', 4, 'send', "결산은 사진으로 보낼 수 있어요. [사진 보내기]를 눌러 카톡 '나와의 채팅'에 보내 보세요")
}

// 지금 띄울 연습 말풍선. 없으면 undefined (확인 창이 떠 있음, 월 정리 읽는 1초, 연습에 없는 화면)
export function practiceCoach(view: PracticeView, progress: PracticeProgress, example: PracticeExample): PracticeCoach | undefined {
  if (view.covered) return undefined
  const { expense } = example
  switch (view.screen) {
    case 'ledger': {
      if (view.entries.length === 0) {
        return coach('open-add', 1, 'add-entry', `${example.income.name} ${won(example.income.amount)}을 적어 볼게요. 여기를 눌러요`)
      }
      if (!progress.monthSeen) return coach('open-month', 2, 'month-summary', '이번 달에 얼마 쓰고 남았는지 여기서 봐요')
      const hasExpense = view.entries.some((entry) => entry.type === 'expense' && entry.name === expense.name)
      if (hasExpense) {
        return coach('open-expense', 3, 'expense-row', `잘못 적었으면 줄을 눌러 고칠 수 있어요. ${expense.name} 줄을 눌러 봐요`)
      }
      return coach('open-year', 4, 'year-summary', '한 해가 끝나면 여기서 결산을 봐요. 눌러 봐요')
    }
    case 'add-entry':
      return view.entry && entryCoach(view.entry, example)
    case 'month-summary':
      return progress.monthReady ? coach('back-from-month', 2, 'back-to-ledger', '다 봤으면 여기를 눌러 장부로 돌아가요') : undefined
    case 'edit-entry':
      return coach('delete-expense', 3, 'delete', '여기서 고치거나 지울 수 있어요. 연습이니 지워 봐요')
    case 'year-summary':
      return sendCoach(view, progress)
    case 'settings':
    case 'new-book':
    case 'keep-restore':
      return undefined
  }
}
