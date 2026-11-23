// 연습 장부 단계 말풍선 규칙 (SPEC-008 "단계 말풍선", SPEC-010 10절). 지금 화면 상태와 진행으로 띄울 말풍선을 순수 함수로 정한다.
//
//   ① 적기       장부 [+ 내역 적기] → 오늘 날짜 → 회비 → (동아리) 김예시 → [다음] → 채워진 10,000원 [저장] / (가계부) 용돈 → +1만 → [저장]
//                → 간식비 날짜 → 간식비 → 금액 칸 → [저장] → [다 적었어요]
//   ② 정리 보기  장부 [N월 정리 보기] → (1초 읽기) → 월 정리 [‹ 장부로]
//   ③ 고치기     장부 간식비 줄 → 고치기 [이 내역 지우기] → (확인 창, 말풍선 없음)
//   ④ 결산 보내기 장부 [결산] → 결산 [사진 보내기] (거부되면 한 번 더 / 그냥 닫으면 [다음에 할게요] / 못 쓰는 기기는 [사진으로 저장])
//                → 결산 [‹ 장부로]
//   ⑤ 회비 표    (동아리만) 장부 [회비 표] → (1초 읽기) → 회비 표 [‹ 장부로]
//   ⑥ 엑셀       장부 이름 ⌄ → 장부 고르기 창 [엑셀 파일로 새 장부] → 연습용 엑셀 읽은 내용 [새 장부 만들기] → 끝 (가계부는 ⑤)
//
// 진짜 내역 적기는 저장하면 날을 다시 묻는다(연달아 적기). 그래서 지출 예시도 날짜부터 짚는다 (스펙 1-d 앞과 다른 점, 변경 이력)
import type { EntryType } from '../../domain/types'
import { formatAmount } from '../../ui/money'
import type { ExcelReadStatus } from '../excel/useExcelImport'
import type { EntryStep } from '../ledger/entrySteps'
import type { Screen } from '../useScreenHistory'
import type { PracticeExample } from './practiceScript'

// 말풍선이 가리키거나 같이 열어 두는 곳 (practiceTargets 가 화면에서 찾는다)
export type PracticeTarget =
  | 'add-entry' // 장부 아래 [+ 내역 적기]
  | 'quick-day' // "며칠인가요?" 빠른 칩 [오늘 16일]·[방금 16일]
  | 'day-field' // 날 숫자 칸
  | 'day-area' // 날 숫자 칸 + 빠른 칩 묶음 (말풍선이 덮지 않게 함께 밝힌다)
  | 'next' // 날을 치면 생기는 아래 [다음], "누가 냈어요?" 아래 [다음]
  | 'item-income' // 기본 항목 줄 (회비 / 용돈)
  | 'item-expense' // 기본 항목 줄 (간식비 / 장보기)
  | 'payer' // "누가 냈어요?" 예시 회원 줄 (김예시, SPEC-010 10절)
  | 'plus-10k' // [+1만]
  | 'amount-field' // 금액 칸
  | 'amount-area' // 금액 칸 + 빠른 더하기 묶음
  | 'save' // 내역 적기 [저장]
  | 'finish-add' // 연달아 적기 [다 적었어요]
  | 'month-summary' // 장부 [N월 정리 보기]
  | 'back-to-ledger' // 월 정리·결산·회비 표 [‹ 장부로]
  | 'expense-row' // 장부의 지출 예시 줄
  | 'delete' // 고치기 [이 내역 지우기]
  | 'year-summary' // 장부 위쪽 [결산]
  | 'send' // 결산 [사진 보내기]·[한 번 더 눌러 보내기]
  | 'save-picture' // 결산 [사진으로 저장] (공유를 못 쓰는 기기)
  | 'dues' // 장부 [회비 표] (SPEC-010 10절 ⑤)
  | 'book' // 장부 이름 ⌄ (⑥ 엑셀 불러오기)
  | 'excel-entry' // 장부 고르기 창 [엑셀 파일로 새 장부]
  | 'excel-create' // 엑셀 읽은 내용 [새 장부 만들기]

export type PracticeStage = 1 | 2 | 3 | 4 | 5 | 6

export type PracticeCoach = {
  step: string // 단계 이름 (말풍선 data-state)
  stage: PracticeStage // "연습 N / 6" (가계부 "연습 N / 5")
  target: PracticeTarget
  alsoOpen: PracticeTarget[] // 같이 열어 둘 곳 (누를 수 있다)
  spotlight: PracticeTarget[] // 가리키는 곳과 함께 밝게 보일 바로 옆 칸 (날 칸·금액 칸)
  message: string
  later: boolean // [다음에 할게요] 를 둔다 (공유 갈래 A·B)
}

// 연습 App 이 그릴 때마다 넘기는 지금 화면 상태
export type PracticeView = {
  screen: Screen['name']
  covered: boolean // 확인 창·선택 창(장부 고르기 창 빼고)·버릴까요가 떠 있다 (말풍선 없음)
  bookSheet: boolean // 장부 고르기 창이 떠 있다 (⑥ [엑셀 파일로 새 장부] 를 가리킨다)
  entries: readonly { name: string; type: EntryType }[] // 연습 장부의 기록
  // 내역 적기 화면: 지금 단계, 적는 금액, 이번에 들어와 저장한 수, "누가 냈어요?" 에 체크한 분
  entry?: { step: EntryStep; amount: number; saved: number; payers: readonly string[] }
  canSend: boolean // 공유 창에 사진을 넘길 수 있는 기기 ([사진 보내기] 가 있다)
  excel: ExcelReadStatus // 엑셀 읽은 내용 화면: 연습용 엑셀을 읽는 중 / 읽음 / 못 읽음(엑셀 조각을 받지 못함)
}

// 화면 밖에서 쌓이는 진행
export type PracticeProgress = {
  monthSeen: boolean // 월 정리를 열어 봤다 (② 끝)
  monthReady: boolean // 월 정리를 연 뒤 1초쯤 지났다
  sendReady: boolean // 공유 창이 거부돼 사진을 들고 있다 ([한 번 더 눌러 보내기])
  sendCancelled: boolean // 공유 창을 그냥 닫고 왔다 (갈래 A)
  // ④ 끝: 아직 / 보냈다 / [다음에 할게요]·사진으로 저장 (끝 화면 넷째 줄 체크)
  picture: 'pending' | 'sent' | 'later'
  duesSeen: boolean // 회비 표를 열어 봤다 (⑤ 끝, SPEC-010 10절)
  duesReady: boolean // 회비 표를 연 뒤 1초쯤 지났다
}

// 월 정리·회비 표를 연 뒤 말풍선 없이 읽을 시간 (컷 3 "1초쯤", SPEC-010 10절 ⑤ "1초 읽기")
export const READING_MS = 1000

export const START_PROGRESS: PracticeProgress = {
  monthSeen: false,
  monthReady: false,
  sendReady: false,
  sendCancelled: false,
  picture: 'pending',
  duesSeen: false,
  duesReady: false,
}

// 동아리 연습은 ⑤ 회비 표가 있어 여섯 단계, 가계부는 회비가 없어 다섯 단계 ("연습 N / 6", SPEC-010 10절)
export function practiceStageCount({ payer }: PracticeExample): 5 | 6 {
  return payer ? 6 : 5
}

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
function entryCoach(entry: NonNullable<PracticeView['entry']>, { income, expense, payer }: PracticeExample): PracticeCoach | undefined {
  const { step, amount, saved, payers } = entry
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
    case 'payers':
      // 회비 "누가 냈어요?" (SPEC-010 3절·10절 ①): 동아리 연습 장부의 회비 예시에서만 온다. 예시 회원 한 분을 고르고 [다음]
      if (!first || !payer) return undefined
      return payers.includes(payer.id)
        ? coach('income-payers-next', 1, 'next', `${payer.name} 님을 골랐어요. [다음]을 눌러요`)
        : coach('income-payers', 1, 'payer', `${payer.name} 님을 눌러 보세요. 여러 분을 고를 수 있어요.`)
    case 'amount': {
      const ready = amount === line.amount
      if (!first) {
        const message = `${won(expense.amount)}을 적고 [저장]을 눌러요`
        return ready
          ? coach('expense-save', 1, 'save', message, { alsoOpen: ['amount-field'] })
          : coach('expense-amount', 1, 'amount-field', message)
      }
      // 낸 분을 고르고 왔으면 금액이 사람 수 × 월 회비로 이미 채워져 있다 ([+1만] 단계 없이, SPEC-010 10절 ①)
      const saveMessage = payers.length > 0 ? `금액이 ${won(income.amount)}으로 채워졌어요. [저장]을 눌러요` : `${won(income.amount)}이 됐으면 [저장]을 눌러요`
      return ready
        ? coach('income-save', 1, 'save', saveMessage, { alsoOpen: ['amount-field'] })
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

// ④ 결산 화면: 공유 결과에 따른 갈래. 끝났으면(보냄·[다음에 할게요]·사진으로 저장) [‹ 장부로] 를 가리켜 다음 단계로
function yearCoach(view: PracticeView, progress: PracticeProgress): PracticeCoach {
  if (progress.picture === 'sent') return coach('back-from-year', 4, 'back-to-ledger', '잘 보냈어요! 여기를 눌러 장부로 돌아가요')
  if (progress.picture === 'later') return coach('back-from-year', 4, 'back-to-ledger', '다음에 보내도 돼요. 여기를 눌러 장부로 돌아가요')
  if (!view.canSend) {
    return coach('send', 4, 'save-picture', '이 기기에서는 바로 보낼 수 없어요. 사진으로 저장해 두었다가 보내요', { later: true })
  }
  if (progress.sendReady) return coach('send', 4, 'send', '사진이 준비됐어요. 한 번 더 눌러 주세요', { later: progress.sendCancelled })
  if (progress.sendCancelled) return coach('send', 4, 'send', '아직 안 보냈어요. 다시 눌러 보거나, 나중에 해도 돼요', { later: true })
  return coach('send', 4, 'send', "결산은 사진으로 보낼 수 있어요. [사진 보내기]를 눌러 카톡 '나와의 채팅'에 보내 보세요")
}

// 장부 화면에서 할 차례: 진행과 연습 장부 기록으로 정한다
type LedgerTurn = 'add' | 'month' | 'expense' | 'year' | 'dues' | 'excel'

function ledgerTurn(view: PracticeView, progress: PracticeProgress, { expense, payer }: PracticeExample): LedgerTurn {
  if (view.entries.length === 0) return 'add'
  if (!progress.monthSeen) return 'month'
  if (view.entries.some((entry) => entry.type === 'expense' && entry.name === expense.name)) return 'expense'
  if (progress.picture === 'pending') return 'year'
  if (payer && !progress.duesSeen) return 'dues'
  return 'excel'
}

function ledgerCoach(view: PracticeView, progress: PracticeProgress, example: PracticeExample): PracticeCoach | undefined {
  const turn = ledgerTurn(view, progress, example)
  const excelStage = practiceStageCount(example)
  // 장부 고르기 창은 ⑥ 에서만 뜬다 (그 전에는 장부 이름이 잠겨 있다). 창 안 [엑셀 파일로 새 장부] 를 가리킨다
  if (view.bookSheet) {
    return turn === 'excel'
      ? coach('open-excel', excelStage, 'excel-entry', '여기를 눌러요. 연습이라 파일을 고르지 않고 연습용 엑셀을 읽어요')
      : undefined
  }
  const { income, expense } = example
  switch (turn) {
    case 'add':
      return coach('open-add', 1, 'add-entry', `${income.name} ${won(income.amount)}을 적어 볼게요. 여기를 눌러요`)
    case 'month':
      return coach('open-month', 2, 'month-summary', '이번 달에 얼마 쓰고 남았는지 여기서 봐요')
    case 'expense':
      return coach('open-expense', 3, 'expense-row', `잘못 적었으면 줄을 눌러 고칠 수 있어요. ${expense.name} 줄을 눌러 봐요`)
    case 'year':
      return coach('open-year', 4, 'year-summary', '한 해가 끝나면 여기서 결산을 봐요. 눌러 봐요')
    case 'dues':
      return coach('open-dues', 5, 'dues', '회비 표를 열어 볼게요. 여기를 눌러요')
    case 'excel':
      return coach('open-books', excelStage, 'book', '엑셀로 쓰던 장부도 불러올 수 있어요. 장부 이름을 눌러요')
  }
}

// 지금 띄울 연습 말풍선. 없으면 undefined (확인 창이 떠 있음, 월 정리·회비 표 읽는 1초, 엑셀 읽는 중, 연습에 없는 화면)
export function practiceCoach(view: PracticeView, progress: PracticeProgress, example: PracticeExample): PracticeCoach | undefined {
  if (view.covered) return undefined
  switch (view.screen) {
    case 'ledger':
      return ledgerCoach(view, progress, example)
    case 'add-entry':
      return view.entry && entryCoach(view.entry, example)
    case 'month-summary':
      return progress.monthReady ? coach('back-from-month', 2, 'back-to-ledger', '다 봤으면 여기를 눌러 장부로 돌아가요') : undefined
    case 'edit-entry':
      return coach('delete-expense', 3, 'delete', '여기서 고치거나 지울 수 있어요. 연습이니 지워 봐요')
    case 'year-summary':
      return yearCoach(view, progress)
    case 'dues':
      return progress.duesReady
        ? coach('back-from-dues', 5, 'back-to-ledger', '누가 몇 월까지 냈는지 여기서 봐요. 다 봤으면 여기를 눌러 장부로 돌아가요')
        : undefined
    case 'excel-import':
      return view.excel === 'read'
        ? coach(
            'create-excel',
            practiceStageCount(example),
            'excel-create',
            '엑셀 장부가 있으면 이렇게 읽은 내용을 먼저 보여 줘요. [새 장부 만들기]를 눌러 보세요.',
          )
        : undefined
    case 'settings':
    case 'new-book':
    case 'keep-restore':
      return undefined
  }
}
