// 연습 말풍선이 가리키는 곳을 화면에서 찾는다 (SPEC-008 기술 메모 "가리키는 곳을 아는 방법").
// 가리키는 곳이 열 곳 넘게 여러 화면 부품에 흩어져 있어, 부품마다 ref 를 늘리는 대신 화면 루트 data-testid 아래에서 찾는다.
// 진짜 화면 부품은 연습을 모른다
import type { RefObject } from 'react'
import type { PracticeExample } from './practiceScript'
import type { PracticeTarget } from './practiceSteps'

function first(selector: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector)
}

// selector 에 맞는 요소 중 글자가 text 인 것 (글자는 앞뒤 빈칸을 뺀다)
function withText(selector: string, text: string, textSelector?: string): HTMLElement | null {
  const candidates = [...document.querySelectorAll<HTMLElement>(selector)]
  return candidates.find((element) => (textSelector ? element.querySelector(textSelector) : element)?.textContent?.trim() === text) ?? null
}

const ADD_BAR = '[data-testid="add-entry-form"] [data-testid="bottom-action-bar"] button'

export function findPracticeTarget(target: PracticeTarget, example: PracticeExample): HTMLElement | null {
  switch (target) {
    case 'add-entry':
      return first('[data-testid="ledger-screen"] [data-testid="bottom-action-bar"] button')
    case 'quick-day':
      return first('[data-testid="day-input"] .ui-day-input__quick button')
    case 'day-field':
      return first('[data-testid="day-input"] input')
    case 'day-area':
      return first('[data-testid="day-input"]')
    case 'next':
      return withText(ADD_BAR, '다음')
    case 'item-income':
      return withText('[data-testid="add-entry-form"] .ui-options__option', example.income.name, '.ui-options__label')
    case 'item-expense':
      return withText('[data-testid="add-entry-form"] .ui-options__option', example.expense.name, '.ui-options__label')
    case 'plus-10k':
      return first('[data-testid="amount-display"] [aria-label="1만 원 더하기"]')
    case 'amount-field':
      return first('[data-testid="amount-display"] input')
    case 'amount-area':
      return first('[data-testid="amount-display"]')
    case 'save':
      return withText(ADD_BAR, '저장')
    case 'finish-add':
      return withText(ADD_BAR, '다 적었어요')
    case 'month-summary':
      return first('[data-testid="ledger-screen"] .ledger__month-action button')
    case 'back-to-ledger':
      return first('[data-testid="month-summary-screen"] .screen__back button')
    case 'expense-row':
      return withText('[data-testid="month-card"] [data-testid="list-row"]', example.expense.name, '.ui-row__title')
    case 'delete':
      return withText('[data-testid="edit-entry-form"] button', '이 내역 지우기')
    case 'year-summary':
      return withText('[data-testid="ledger-screen"] .ledger__top-actions button', '결산')
    case 'send':
      return first('[data-testid="year-summary-screen"] .ui-bottom-bar__pair > button:last-child')
    case 'save-picture':
      return first('[data-testid="year-summary-screen"] [data-testid="bottom-action-bar"] button')
  }
}

// 읽을 때마다 화면에서 찾는 ref. 말풍선(CoachMark)은 화면이 다 그려진 뒤(effect)에 읽는다
export function practiceTargetRef(target: PracticeTarget, example: PracticeExample): RefObject<HTMLElement | null> {
  return {
    get current() {
      return findPracticeTarget(target, example)
    },
  }
}
