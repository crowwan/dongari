import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SavedEntriesCard, type SavedEntry } from './SavedEntriesCard'

const RENT: SavedEntry = { name: '대관료', type: 'expense', amount: 40_000 }
const SNACK: SavedEntry = { name: '간식비', type: 'expense', amount: 28_340 }
const FEE: SavedEntry = { name: '회비', type: 'income', amount: 140_000 }

const rows = () => screen.getAllByTestId('saved-entries-card-row')

describe('SPEC-001 SavedEntriesCard (저장한 내역 카드)', () => {
  it('AC-20 "저장한 내역 N건" 카드에 저장한 순서대로 ✓ + 이름 + 부호 붙은 금액 줄을 보인다', () => {
    render(<SavedEntriesCard entries={[RENT, FEE]} />)

    const card = screen.getByRole('region', { name: '저장한 내역 2건' })
    expect(card).toHaveAttribute('data-testid', 'saved-entries-card')
    expect(rows().map((row) => row.textContent)).toEqual(['대관료 −40,000원', '회비 방금 +140,000원'])
    expect(rows()[0].querySelector('[data-icon="check"]')).toBeInTheDocument()
    // 장부와 같은 색 규칙: 수입 금액은 수입 색, 지출은 본문색
    expect(within(rows()[1]).getByTestId('amount-text')).toHaveAttribute('data-kind', 'income')
  })

  it('AC-20 방금 저장한 마지막 줄에만 "방금" 이 붙고 옅은 청록 바탕으로 표시된다', () => {
    render(<SavedEntriesCard entries={[RENT, SNACK]} />)

    expect(rows().map((row) => row.getAttribute('data-state'))).toEqual(['saved', 'latest'])
    expect(within(rows()[1]).getByText('방금')).toBeInTheDocument()
    expect(within(rows()[0]).queryByText('방금')).not.toBeInTheDocument()
  })

  it('AC-20 4줄까지는 모두 보인다', () => {
    render(<SavedEntriesCard entries={[RENT, SNACK, FEE, RENT]} />)

    expect(rows()).toHaveLength(4)
  })

  it('AC-20 4줄을 넘으면 최근 3줄만 보이고 제목의 N 은 전체 건수다', () => {
    render(<SavedEntriesCard entries={[RENT, SNACK, FEE, RENT, SNACK]} />)

    expect(screen.getByRole('region', { name: '저장한 내역 5건' })).toBeInTheDocument()
    expect(rows().map((row) => row.textContent)).toEqual(['회비 +140,000원', '대관료 −40,000원', '간식비 방금 −28,340원'])
  })

  it('줄은 누를 수 없다 (고치기는 장부에서)', () => {
    render(<SavedEntriesCard entries={[RENT, SNACK]} />)

    expect(within(screen.getByTestId('saved-entries-card')).queryByRole('button')).not.toBeInTheDocument()
  })
})
