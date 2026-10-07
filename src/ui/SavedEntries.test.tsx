import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SavedEntries, type SavedEntry } from './SavedEntries'

const RENT: SavedEntry = { name: '대관료', type: 'expense', amount: 40_000 }
const SNACK: SavedEntry = { name: '간식비', type: 'expense', amount: 28_340 }
const FEE: SavedEntry = { name: '회비', type: 'income', amount: 140_000 }

const rows = () => screen.getAllByTestId('saved-entries-row')

describe('SPEC-001 SavedEntries (장부에 넣었어요 목록)', () => {
  it('AC-20 머리 ✓ + "장부에 넣었어요 · N건" 아래 저장한 순서대로 이름 + 부호 붙은 금액 줄을 보인다', () => {
    render(<SavedEntries entries={[RENT, FEE]} />)

    const list = screen.getByRole('region', { name: '장부에 넣었어요 · 2건' })
    expect(list).toHaveAttribute('data-testid', 'saved-entries')
    expect(rows().map((row) => row.textContent)).toEqual(['대관료 −40,000원', '회비 방금 +140,000원'])
    // ✓ 는 머리에만 (줄마다 동그라미 없음)
    expect(list.querySelectorAll('[data-icon="check"]')).toHaveLength(1)
    expect(rows()[0].querySelector('[data-icon]')).not.toBeInTheDocument()
  })

  it('AC-20 방금 저장한 마지막 줄에만 "방금" 이 붙는다', () => {
    render(<SavedEntries entries={[RENT, SNACK]} />)

    expect(rows().map((row) => row.getAttribute('data-state'))).toEqual(['saved', 'latest'])
    expect(within(rows()[1]).getByText('방금')).toBeInTheDocument()
    expect(within(rows()[0]).queryByText('방금')).not.toBeInTheDocument()
  })

  it('AC-20 최근 2줄만 보이고 머리의 N 은 전체 건수다', () => {
    render(<SavedEntries entries={[RENT, SNACK, FEE]} />)

    expect(screen.getByRole('region', { name: '장부에 넣었어요 · 3건' })).toBeInTheDocument()
    expect(rows().map((row) => row.textContent)).toEqual(['간식비 −28,340원', '회비 방금 +140,000원'])
  })

  it('한 건이면 그 줄 하나만 보인다', () => {
    render(<SavedEntries entries={[RENT]} />)

    expect(rows().map((row) => row.textContent)).toEqual(['대관료 방금 −40,000원'])
  })

  it('줄은 누를 수 없다 (고치기는 장부에서)', () => {
    render(<SavedEntries entries={[RENT, SNACK]} />)

    expect(within(screen.getByTestId('saved-entries')).queryByRole('button')).not.toBeInTheDocument()
  })
})
